/**
 * Expression evaluator.
 *
 * Works on SI magnitudes and dimensions; raises CalcError with a diagnostic on
 * the first problem in an expression. Warnings are collected in the context.
 */

import { diagnostic, fail, type Diagnostic, type Span } from '../diagnostics.js';
import type { BinaryOperator, Expr } from '../lang/ast.js';
import { isDimensionless, multiplyDims, divideDims, powerDim, sameDim, superscript } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { UnitRegistry } from '../units/registry.js';
import { resolveUnit, type ResolvedUnit } from '../units/unitExpr.js';
import type { TableRead } from '../tables/table.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asBoolean, asQuantity } from './coerce.js';
import { BUILTIN_CONSTANTS, callFunction, FUNCTION_NAMES } from './functions.js';
import { callTableFunction, memberOf, TABLE_FUNCTIONS } from './tables.js';
import { applyFunction, lookupFunction } from './userFunctions.js';
import type { BlockCaller, BlockInput } from './blocks.js';

export interface EvalContext {
  readonly registry: UnitRegistry;
  /** Returns the value of a variable or raises a diagnostic. */
  lookup(name: string, span: Span): Value;
  /** Collects warnings raised while evaluating. */
  readonly warnings: Diagnostic[];
  /** Collects reads of table data, for provenance. */
  readonly tableReads?: TableRead[];
  /** Blocks of the sheet, callable by name. */
  readonly blocks?: BlockCaller;
}

/** Relative tolerance for comparisons, so 0.1 + 0.2 == 0.3 holds. */
const COMPARE_EPSILON = 1e-12;

export function evaluate(expr: Expr, ctx: EvalContext): Value {
  const value = evaluateRaw(expr, ctx);
  if (value.type === 'quantity' && !Number.isFinite(value.si)) fail('E-NOT-FINITE', expr.span);
  return value;
}

function evaluateRaw(expr: Expr, ctx: EvalContext): Value {
  switch (expr.kind) {
    case 'number': {
      if (!expr.unit) return quantity(expr.value);
      const unit = resolveUnit(expr.unit, ctx.registry);
      if (unit.offset !== undefined) {
        return quantity(expr.value * unit.factor + unit.offset, unit.dim, { absolute: true, hint: unit });
      }
      return quantity(expr.value * unit.factor, unit.dim, { hint: unit });
    }
    case 'unit': {
      // A standalone unit is a scale factor; °C here means a difference.
      const unit = resolveUnit(expr.unit, ctx.registry);
      return quantity(unit.factor, unit.dim, { hint: withoutOffset(unit) });
    }
    case 'string':
      return { type: 'text', value: expr.value };
    case 'boolean':
      return { type: 'boolean', value: expr.value };
    case 'variable': {
      const constant = BUILTIN_CONSTANTS[expr.name];
      if (constant !== undefined) return quantity(constant);
      return ctx.lookup(expr.name, expr.span);
    }
    case 'unary': {
      const operand = evaluate(expr.operand, ctx);
      if (expr.operator === 'not') return { type: 'boolean', value: !asBoolean(operand, expr.operand.span) };
      const q = asQuantity(operand, expr.operand.span);
      return expr.operator === '-' ? { ...q, si: -q.si } : q;
    }
    case 'binary':
      return evaluateBinary(expr.operator, expr.left, expr.right, expr.span, ctx);
    case 'call': {
      if (TABLE_FUNCTIONS.has(expr.name)) return callTableFunction(expr, ctx, evaluate);
      if (ctx.blocks?.has(expr.name)) return callBlock(expr, ctx);
      if (!FUNCTION_NAMES.includes(expr.name)) return applyFunction(lookupFunction(expr, ctx), expr, ctx, evaluate);
      const extra = expr.named[0];
      if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: expr.name, argument: extra.name, problem: 'unknown' });
      return callFunction(expr, (arg) => evaluate(arg, ctx));
    }
    case 'member':
      return memberOf(evaluate(expr.object, ctx), expr.name, expr.span, expr.object.span, ctx);
  }
}

/** A block is called with its inputs by name: Prosty_nosnik(L: 6 m, q: 10 kN/m). */
function callBlock(call: Extract<Expr, { kind: 'call' }>, ctx: EvalContext): Value {
  const positional = call.args[0];
  if (positional) fail('E-NAMED-ARG', positional.span, { function: call.name, argument: '', problem: 'positional' });
  const inputs = new Map<string, BlockInput>();
  for (const arg of call.named) inputs.set(arg.name, { value: evaluate(arg.value, ctx), nameSpan: arg.nameSpan });
  return ctx.blocks!.call(call.name, inputs, call.span);
}

function evaluateBinary(op: BinaryOperator, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): Value {
  if (op === 'and' || op === 'or') {
    // Short-circuit like most languages.
    const left = asBoolean(evaluate(leftExpr, ctx), leftExpr.span);
    if (op === 'and' && !left) return { type: 'boolean', value: false };
    if (op === 'or' && left) return { type: 'boolean', value: true };
    return { type: 'boolean', value: asBoolean(evaluate(rightExpr, ctx), rightExpr.span) };
  }

  const left = evaluate(leftExpr, ctx);
  const right = evaluate(rightExpr, ctx);

  // Text and booleans can be tested for equality ("S235" == material.trida).
  if ((op === '==' || op === '!=') && left.type === right.type && (left.type === 'text' || left.type === 'boolean')) {
    const equal = left.value === (right as typeof left).value;
    return { type: 'boolean', value: op === '==' ? equal : !equal };
  }

  const a = asQuantity(left, leftExpr.span);
  const b = asQuantity(right, rightExpr.span);

  switch (op) {
    case '+':
    case '-':
      return addSubtract(op, a, b, span);
    case '*':
    case '/': {
      warnOnAbsoluteTemperature(a, leftExpr.span, ctx);
      warnOnAbsoluteTemperature(b, rightExpr.span, ctx);
      // Scaling by a plain number keeps the unit: 1.35 · g_k stays in kN/m.
      const scaled = isDimensionless(b.dim) && !b.hint ? a : op === '*' && isDimensionless(a.dim) && !a.hint ? b : undefined;
      const hint = scaled?.hint && !isDimensionless(scaled.dim) ? { hint: scaled.hint } : {};
      if (op === '*') return quantity(a.si * b.si, multiplyDims(a.dim, b.dim), hint);
      if (b.si === 0) fail('E-DIV-ZERO', rightExpr.span);
      return quantity(a.si / b.si, divideDims(a.dim, b.dim), hint);
    }
    case '^': {
      if (!isDimensionless(b.dim)) fail('E-POWER-DIM', rightExpr.span, { dim: baseUnitSymbol(b.dim) });
      warnOnAbsoluteTemperature(a, leftExpr.span, ctx);
      return quantity(a.si ** b.si, powerDim(a.dim, b.si), poweredHint(a, b.si));
    }
    default:
      return compare(op, a, b, span);
  }
}

function addSubtract(op: '+' | '-', a: Quantity, b: Quantity, span: Span): Quantity {
  if (!sameDim(a.dim, b.dim)) {
    fail('E-UNIT-MISMATCH', span, { operator: op, left: baseUnitSymbol(a.dim), right: baseUnitSymbol(b.dim) });
  }
  const si = op === '+' ? a.si + b.si : a.si - b.si;

  // Absolute temperatures: T + T is meaningless, T - T is a difference.
  if (a.absolute && b.absolute) {
    if (op === '+') fail('E-ABS-TEMP', span);
    return quantity(si, a.dim, deltaHint(a.hint));
  }
  if (a.absolute || b.absolute) {
    if (op === '-' && b.absolute) fail('E-ABS-TEMP', span);
    const abs = a.absolute ? a : b;
    return quantity(si, a.dim, { absolute: true, ...(abs.hint ? { hint: abs.hint } : {}) });
  }

  // Keep the unit of the first operand that has one (Calcpad: 1.23 m + 35 cm = 1.58 m).
  const hint = a.hint ?? b.hint;
  return quantity(si, a.dim, hint ? { hint } : {});
}

/** A whole power keeps the unit: (20 mm)² is 400 mm², (2 kN/m)² is 4 (kN/m)². */
function poweredHint(a: Quantity, exponent: number): { hint?: ResolvedUnit } {
  if (!a.hint || a.absolute || !Number.isInteger(exponent) || exponent === 0 || isDimensionless(a.dim)) return {};
  const symbol = /[·/]/.test(a.hint.symbol) ? `(${a.hint.symbol})` : a.hint.symbol;
  return { hint: { symbol: `${symbol}${superscript(exponent)}`, factor: a.hint.factor ** exponent, dim: powerDim(a.hint.dim, exponent) } };
}

function deltaHint(hint: ResolvedUnit | undefined): { hint?: ResolvedUnit } {
  if (!hint?.delta) return {};
  return { hint: { symbol: hint.delta, factor: hint.factor, dim: hint.dim } };
}

function withoutOffset(unit: ResolvedUnit): ResolvedUnit {
  if (unit.offset === undefined) return unit;
  return { symbol: unit.delta ?? unit.symbol, factor: unit.factor, dim: unit.dim };
}

/** Comparison of two quantities with a relative tolerance. */
export function compare(op: BinaryOperator, a: Quantity, b: Quantity, span: Span): Value {
  if (!sameDim(a.dim, b.dim)) {
    fail('E-UNIT-MISMATCH', span, { operator: op, left: baseUnitSymbol(a.dim), right: baseUnitSymbol(b.dim) });
  }
  const tolerance = COMPARE_EPSILON * Math.max(Math.abs(a.si), Math.abs(b.si));
  const diff = a.si - b.si;
  const equal = Math.abs(diff) <= tolerance;
  const result = {
    '==': equal,
    '!=': !equal,
    '<': diff < 0 && !equal,
    '<=': diff < 0 || equal,
    '>': diff > 0 && !equal,
    '>=': diff > 0 || equal,
  }[op as '==' | '!=' | '<' | '<=' | '>' | '>='];
  return { type: 'boolean', value: result };
}

function warnOnAbsoluteTemperature(q: Quantity, span: Span, ctx: EvalContext): void {
  if (q.absolute) ctx.warnings.push(diagnostic('W-ABS-TEMP-MUL', span));
}

