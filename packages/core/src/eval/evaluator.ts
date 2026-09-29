/**
 * Expression evaluator.
 *
 * Works on SI magnitudes and dimensions; raises CalcError with a diagnostic on
 * the first problem in an expression. Warnings are collected in the context.
 */

import { diagnostic, fail, type Diagnostic, type Span } from '../diagnostics.js';
import type { BinaryOperator, Expr } from '../lang/ast.js';
import { isDimensionless, multiplyDims, divideDims, powerDim, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { UnitRegistry } from '../units/registry.js';
import { resolveUnit, type ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asBoolean, asQuantity } from './coerce.js';
import { BUILTIN_CONSTANTS, callFunction } from './functions.js';

export interface EvalContext {
  readonly registry: UnitRegistry;
  /** Returns the value of a variable or raises a diagnostic. */
  lookup(name: string, span: Span): Value;
  /** Collects warnings raised while evaluating. */
  readonly warnings: Diagnostic[];
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
    case 'call':
      return callFunction(expr, (arg) => evaluate(arg, ctx));
    case 'member':
      return fail('E-UNSUPPORTED', expr.span, { feature: 'member-access' });
  }
}

function evaluateBinary(op: BinaryOperator, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): Value {
  if (op === 'and' || op === 'or') {
    // Short-circuit like most languages.
    const left = asBoolean(evaluate(leftExpr, ctx), leftExpr.span);
    if (op === 'and' && !left) return { type: 'boolean', value: false };
    if (op === 'or' && left) return { type: 'boolean', value: true };
    return { type: 'boolean', value: asBoolean(evaluate(rightExpr, ctx), rightExpr.span) };
  }

  const a = asQuantity(evaluate(leftExpr, ctx), leftExpr.span);
  const b = asQuantity(evaluate(rightExpr, ctx), rightExpr.span);

  switch (op) {
    case '+':
    case '-':
      return addSubtract(op, a, b, span);
    case '*':
    case '/': {
      warnOnAbsoluteTemperature(a, leftExpr.span, ctx);
      warnOnAbsoluteTemperature(b, rightExpr.span, ctx);
      if (op === '*') return quantity(a.si * b.si, multiplyDims(a.dim, b.dim));
      if (b.si === 0) fail('E-DIV-ZERO', rightExpr.span);
      return quantity(a.si / b.si, divideDims(a.dim, b.dim));
    }
    case '^': {
      if (!isDimensionless(b.dim)) fail('E-POWER-DIM', rightExpr.span, { dim: baseUnitSymbol(b.dim) });
      warnOnAbsoluteTemperature(a, leftExpr.span, ctx);
      return quantity(a.si ** b.si, powerDim(a.dim, b.si));
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

function deltaHint(hint: ResolvedUnit | undefined): { hint?: ResolvedUnit } {
  if (!hint?.delta) return {};
  return { hint: { symbol: hint.delta, factor: hint.factor, dim: hint.dim } };
}

function withoutOffset(unit: ResolvedUnit): ResolvedUnit {
  if (unit.offset === undefined) return unit;
  return { symbol: unit.delta ?? unit.symbol, factor: unit.factor, dim: unit.dim };
}

function compare(op: BinaryOperator, a: Quantity, b: Quantity, span: Span): Value {
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

