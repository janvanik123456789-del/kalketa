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
import type { FunctionValue, Value } from '../values/value.js';
import type { EvalContext } from './evaluator.js';
import { BUILTIN_CONSTANTS, FUNCTION_NAMES } from './functions.js';
import { ROW_VARIABLE, TABLE_FUNCTIONS } from './tables.js';

type Evaluate = (expr: Expr, ctx: EvalContext) => Value;
type CallExpr = Extract<Expr, { kind: 'call' }>;
type FunctionDefinition = Extract<Statement, { kind: 'definition' }> & { readonly params: NonNullable<Extract<Statement, { kind: 'definition' }>['params']> };

const BUILTIN_FUNCTIONS: ReadonlySet<string> = new Set(FUNCTION_NAMES);

/** Names that user functions (and variables) cannot take over. */
export function isBuiltinFunction(name: string): boolean {
  return BUILTIN_FUNCTIONS.has(name) || TABLE_FUNCTIONS.has(name);
}

interface FreeName {
  readonly span: Span;
  /** Used as a function: f(x). */
  readonly call: boolean;
}

/** Names an expression reads that are not bound inside it, with their first use. */
export function freeNames(expr: Expr, bound: ReadonlySet<string>): Map<string, FreeName> {
  const found = new Map<string, FreeName>();
  const visit = (e: Expr, rowScope: boolean): void => {
    switch (e.kind) {
      case 'variable':
        if (bound.has(e.name) || e.name in BUILTIN_CONSTANTS || (rowScope && e.name === ROW_VARIABLE)) return;
        if (!found.has(e.name)) found.set(e.name, { span: e.span, call: false });
        return;
      case 'unary':
        return visit(e.operand, rowScope);
      case 'binary':
        visit(e.left, rowScope);
        return visit(e.right, rowScope);
      case 'member':
        return visit(e.object, rowScope);
      case 'call': {
        if (!isBuiltinFunction(e.name) && !bound.has(e.name) && !found.has(e.name)) found.set(e.name, { span: e.span, call: true });
        e.args.forEach((a) => visit(a, rowScope));
        // "where:" and "by:" of table functions read the row variable r.
        const rows = rowScope || TABLE_FUNCTIONS.has(e.name);
        e.named.forEach((n) => visit(n.value, rows));
        return;
      }
      default:
        return;
    }
  };
  visit(expr, false);
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
  return evaluate(fn.body, inner);
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
