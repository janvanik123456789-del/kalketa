/**
 * User functions (docs/03-jazyk.md, ch. 7.2):
 *
 *   A_kruh(d) := π·d²/4
 *   A := A_kruh(20 mm)
 *
 * A function is a value. When it is defined, the names its body uses (other
 * than its parameters) are looked up and kept with it, so the sheet still
 * reads top to bottom: a function sees what is defined above it, and when one
 * of those values changes, the function and everything that calls it is
 * recalculated. A function cannot call itself.
 *
 * Units are checked when the function is called: A_kruh(20 mm) gives mm².
 */

import { CalcError, fail, type Span } from '../diagnostics.js';
import type { Expr, Statement } from '../lang/ast.js';
import { asQuantity } from './coerce.js';
import { sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import type { FunctionValue, Quantity, Value } from '../values/value.js';
import type { EvalContext } from './evaluator.js';
import { BINDING_FUNCTIONS, BINDING_OPTIONS } from '../lang/parser.js';
import { BUILTIN_CONSTANTS, builtinFunctions } from './functions.js';
import { ROW_VARIABLE, TABLE_FUNCTIONS } from './tables.js';

type Evaluate = (expr: Expr, ctx: EvalContext) => Value;
type CallExpr = Extract<Expr, { kind: 'call' }>;
type FunctionDefinition = Extract<Statement, { kind: 'definition' }> & { readonly params: NonNullable<Extract<Statement, { kind: 'definition' }>['params']> };

/** Names that user functions (and variables) cannot take over. */
export function isBuiltinFunction(name: string): boolean {
  // solve(a == b, x: …) is the line solve as a value; the help knows it as that line.
  return builtinFunctions.has(name) || name === 'solve';
}

interface FreeName {
  readonly span: Span;
  /** Used as a function: f(x). */
  readonly call: boolean;
}

/** Names an expression reads that are not bound inside it, with their first use. */
export function freeNames(expr: Expr, bound: ReadonlySet<string>): Map<string, FreeName> {
  const found = new Map<string, FreeName>();
  const visit = (e: Expr, rowScope: boolean, names: ReadonlySet<string>): void => {
    switch (e.kind) {
      case 'variable':
        if (names.has(e.name) || e.name in BUILTIN_CONSTANTS || (rowScope && e.name === ROW_VARIABLE)) return;
        if (!found.has(e.name)) found.set(e.name, { span: e.span, call: false });
        return;
      case 'unary':
        return visit(e.operand, rowScope, names);
      case 'binary':
        visit(e.left, rowScope, names);
        return visit(e.right, rowScope, names);
      case 'member':
        return visit(e.object, rowScope, names);
      case 'vector':
        return e.items.forEach((item) => visit(item, rowScope, names));
      case 'matrix':
        return e.rows.forEach((r) => r.forEach((item) => visit(item, rowScope, names)));
      case 'index':
        visit(e.object, rowScope, names);
        if (e.column) visit(e.column, rowScope, names);
        return visit(e.index, rowScope, names);
      case 'range':
        visit(e.low, rowScope, names);
        return visit(e.high, rowScope, names);
      case 'call': {
        if (!isBuiltinFunction(e.name) && !names.has(e.name) && !found.has(e.name)) found.set(e.name, { span: e.span, call: true });
        // integral(f(x), x: a .. b): x is the call's own inside f(x).
        const last = e.args[1];
        const own = BINDING_FUNCTIONS.has(e.name) ? [...e.named.filter((n) => !BINDING_OPTIONS.has(n.name)).map((n) => n.name), ...((e.name === 'solve' || e.name === 'roots') && last?.kind === 'variable' ? [last.name] : [])] : [];
        const inner = own.length ? new Set([...names, ...own]) : names;
        e.args.forEach((a) => visit(a, rowScope, inner));
        // "where:" and "by:" of table functions read the row variable r.
        const rows = rowScope || TABLE_FUNCTIONS.has(e.name);
        e.named.forEach((n) => visit(n.value, rows, names));
        return;
      }
      default:
        return;
    }
  };
  visit(expr, false, bound);
  return found;
}

/** Evaluates a function definition: keeps the values its body needs. */
export function defineFunction(statement: FunctionDefinition, ctx: EvalContext): FunctionValue {
  const params = statement.params.map((p) => p.name);
  const captured = new Map<string, Value>();
  for (const [name, use] of freeNames(statement.expr, new Set(params))) {
    if (name === statement.name) fail('E-RECURSION', use.span, { function: name });
    try {
      captured.set(name, ctx.lookup(name, use.span));
    } catch (err) {
      if (use.call && err instanceof CalcError && err.diagnostic.code === 'E-UNDEFINED') fail('E-FUNC-UNKNOWN', use.span, { function: name });
      throw err;
    }
  }
  return { type: 'function', name: statement.name, params, body: statement.expr, captured };
}

/** Calls a user function: arguments are evaluated where the call is, the body where it was defined. */
export function applyFunction(fn: FunctionValue, call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const extra = call.named[0];
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: fn.name, argument: extra.name, problem: 'unknown' });
  if (call.args.length !== fn.params.length) {
    fail('E-FUNC-ARITY', call.span, { function: fn.name, expected: fn.params.length, found: call.args.length });
  }
  const args = call.args.map((arg) => evaluate(arg, ctx));
  // A curve fitted on a reading in °C, called with kelvin (P(310.15 K)): the same absolute temperature.
  const zero = fn.fit?.zero;
  if (zero) args.forEach((arg, i) => (args[i] = asAbsolute(arg, zero)));
  if (fn.native) return fn.native(args, call.span);
  const inner: EvalContext = {
    registry: ctx.registry,
    warnings: ctx.warnings,
    ...(ctx.tableReads ? { tableReads: ctx.tableReads } : {}),
    ...(ctx.blocks ? { blocks: ctx.blocks } : {}),
    lookup(name: string, span: Span): Value {
      const index = fn.params.indexOf(name);
      if (index !== -1) return args[index]!;
      return fn.captured.get(name) ?? fail('E-UNDEFINED', span, { name });
    },
  };
  let value: Value;
  try {
    value = evaluate(fn.body, inner);
  } catch (err) {
    // f(series) where the body takes a number (a lookup, an integral up to x): item by item.
    const series = args.filter((v) => v.type === 'vector');
    if (!(err instanceof CalcError) || err.diagnostic.code !== 'E-TYPE' || series.length === 0 || series.some((v) => v.items.length !== series[0]!.items.length)) throw err;
    return { type: 'vector', items: series[0]!.items.map((_, i) => asQuantity(applyToValues(fn, args.map((v) => (v.type === 'vector' ? v.items[i]! : v)), call, ctx, evaluate), call.span)) };
  }
  const target = fn.target;
  if (!target) return value;
  const shown = (q: Quantity): Quantity => {
    if (!sameDim(q.dim, target.dim)) fail('E-TARGET-UNIT', call.span, { unit: target.symbol, found: baseUnitSymbol(q.dim) });
    return inTarget(q, target);
  };
  return value.type === 'quantity' ? shown(value) : value.type === 'vector' ? { type: 'vector', items: value.items.map(shown) } : value;
}

/** Calls a function with values at hand: each(f, v), and a series gone through item by item. */
export function applyToValues(fn: FunctionValue, values: readonly Value[], call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const name = (i: number) => `\u0000arg${i}`;
  const inner: EvalContext = { ...ctx, lookup: (asked, span) => (asked.startsWith('\u0000arg') ? values[Number(asked.slice(4))]! : ctx.lookup(asked, span)) };
  return applyFunction(fn, { ...call, name: fn.name, args: values.map((_, i) => ({ kind: 'variable', name: name(i), span: call.span })), named: [] }, inner, evaluate);
}

/** A value in a target unit: the unit it is shown in; a temperature shown in kelvins is a number like any other. */
export function inTarget(q: Quantity, target: ResolvedUnit): Quantity {
  if (!q.absolute || target.offset !== undefined) return { ...q, hint: target };
  const { absolute: _, ...plain } = q;
  return { ...plain, hint: target };
}

function asAbsolute(value: Value, zero: Quantity): Value {
  if (value.type === 'vector') return { type: 'vector', items: value.items.map((q) => asAbsolute(q, zero) as Quantity) };
  if (value.type !== 'quantity' || value.absolute || value.im || !sameDim(value.dim, zero.dim)) return value;
  return { ...value, absolute: true, ...(zero.hint ? { hint: zero.hint } : {}) };
}

/** The function a call refers to, from the names defined above. */
export function lookupFunction(call: CallExpr, ctx: EvalContext): FunctionValue {
  let value: Value;
  try {
    value = ctx.lookup(call.name, call.span);
  } catch (err) {
    if (err instanceof CalcError && err.diagnostic.code === 'E-UNDEFINED') fail('E-FUNC-UNKNOWN', call.span, { function: call.name });
    throw err;
  }
  if (value.type !== 'function') fail('E-NOT-FUNCTION', call.span, { name: call.name });
  return value;
}
