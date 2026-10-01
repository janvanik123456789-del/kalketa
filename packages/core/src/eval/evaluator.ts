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
import { quantity, type MatrixValue, type Quantity, type Value, type VectorValue } from '../values/value.js';
import { dateValue, isDate } from '../values/date.js';
import { asBoolean, asComplex, asQuantity } from './coerce.js';
import { BUILTIN_CONSTANTS, callFunction, FUNCTION_NAMES } from './functions.js';
import { composedHint, unitNames, type UnitNames } from '../units/compose.js';
import { PREFERRED_UNITS } from '../units/registry.js';
import { callCalculus, isBindingCall } from './calculus.js';
import { BINDING_FUNCTIONS } from '../lang/parser.js';
import { asMatrix, at, inverseOf, matrix, normalized } from '../functions/linear.js';
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
  if (value.type === 'quantity' && (!Number.isFinite(value.si) || !Number.isFinite(value.im ?? 0))) fail('E-NOT-FINITE', expr.span);
  return value;
}

function evaluateRaw(expr: Expr, ctx: EvalContext): Value {
  switch (expr.kind) {
    case 'number': {
      if (expr.imaginary) {
        const unit = expr.unit ? resolveUnit(expr.unit, ctx.registry) : undefined;
        if (unit?.offset !== undefined) fail('E-COMPLEX-ARG', expr.span);
        return quantity(0, unit?.dim, { im: expr.value * (unit?.factor ?? 1), ...(unit ? { hint: unit } : {}) });
      }
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
    case 'date':
      return dateValue(expr.days);
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
      const negate = (q: Quantity): Quantity => ({ ...q, si: -q.si, ...(q.im ? { im: -q.im } : {}) });
      if (operand.type === 'vector') return expr.operator === '-' ? { type: 'vector', items: operand.items.map(negate) } : operand;
      if (operand.type === 'matrix') return expr.operator === '-' ? { ...operand, items: operand.items.map(negate) } : operand;
      const q = asComplex(operand, expr.operand.span);
      return expr.operator === '-' ? negate(q) : q;
    }
    case 'binary':
      return evaluateBinary(expr.operator, expr.left, expr.right, expr.span, ctx);
    case 'call': {
      if (TABLE_FUNCTIONS.has(expr.name)) return callTableFunction(expr, ctx, evaluate);
      // integral(f(x), x: a .. b), derivative(f(x), x: a), sum(f(k), k: 1 .. n): a variable of their own.
      if (BINDING_FUNCTIONS.has(expr.name) && (expr.name !== 'sum' || isBindingCall(expr))) return callCalculus(expr, ctx, evaluate);
      if (ctx.blocks?.has(expr.name)) return callBlock(expr, ctx);
      if (!FUNCTION_NAMES.includes(expr.name)) return applyFunction(lookupFunction(expr, ctx), expr, ctx, evaluate);
      const extra = expr.named[0];
      if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: expr.name, argument: extra.name, problem: 'unknown' });
      return callFunction(expr, (arg) => evaluate(arg, ctx));
    }
    case 'range':
      // A range belongs to a variable: x: 0 m .. L.
      return fail('E-RANGE-PLACE', expr.span);
    case 'member':
      return memberOf(evaluate(expr.object, ctx), expr.name, expr.span, expr.object.span, ctx);
    case 'vector':
      return vectorOf(expr, ctx);
    case 'matrix':
      return matrixOf(expr, ctx);
    case 'index': {
      const object = evaluate(expr.object, ctx);
      if (object.type === 'matrix') {
        // A[i, j], counted from 1.
        if (!expr.column) return fail('E-INDEX', expr.span, { index: '?', length: `${object.rows}×${object.cols}` });
        const position = (e: Expr, size: number) => {
          const q = asQuantity(evaluate(e, ctx), e.span);
          if (!isDimensionless(q.dim) || !Number.isInteger(q.si) || q.si < 1 || q.si > size) fail('E-INDEX', e.span, { index: q.si, length: size });
          return q.si - 1;
        };
        return at(object, position(expr.index, object.rows), position(expr.column, object.cols));
      }
      if (expr.column) fail('E-TYPE', expr.object.span, { expected: 'matrix', found: object.type === 'quantity' ? 'number' : object.type });
      if (object.type !== 'vector') return fail('E-TYPE', expr.object.span, { expected: 'vector', found: object.type === 'quantity' ? 'number' : object.type });
      const index = asQuantity(evaluate(expr.index, ctx), expr.index.span);
      if (!isDimensionless(index.dim) || !Number.isInteger(index.si) || index.si < 1 || index.si > object.items.length) {
        fail('E-INDEX', expr.index.span, { index: index.si, length: object.items.length });
      }
      return object.items[index.si - 1]!;
    }
  }
}

/** [a, b | c, d]: a matrix row by row; every row as long, items with their own units. */
function matrixOf(expr: Extract<Expr, { kind: 'matrix' }>, ctx: EvalContext): MatrixValue {
  const cols = expr.rows[0]!.length;
  const items: Quantity[] = [];
  for (const row of expr.rows) {
    if (row.length !== cols) fail('E-MATRIX-SHAPE', expr.span, { operator: '|', left: String(cols), right: String(row.length) });
    for (const item of row) items.push(asQuantity(evaluate(item, ctx), item.span));
  }
  return matrix(expr.rows.length, cols, items);
}

/** [a, b, c]: all items of one dimension; a series among them is spread. */
function vectorOf(expr: Extract<Expr, { kind: 'vector' }>, ctx: EvalContext): VectorValue {
  const items: Quantity[] = [];
  for (const item of expr.items) {
    const value = evaluate(item, ctx);
    const parts = value.type === 'vector' ? value.items : [asQuantity(value, item.span)];
    for (const q of parts) {
      const first = items[0];
      if (first && !sameDim(first.dim, q.dim)) fail('E-UNIT-MISMATCH', item.span, { operator: ',', left: baseUnitSymbol(first.dim), right: baseUnitSymbol(q.dim) });
      items.push(q);
    }
  }
  return { type: 'vector', items };
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

  if (left.type === 'matrix' || right.type === 'matrix') return matrixBinary(op, left, right, leftExpr, rightExpr, span, ctx);
  if (left.type === 'vector' || right.type === 'vector') return vectorBinary(op, left, right, leftExpr, rightExpr, span, ctx);
  return arithmetic(op, left, right, leftExpr, rightExpr, span, ctx);
}

/**
 * Series item by item: [1, 2] + [3, 4], or with one number: CF / (1 + i)^t.
 * Series have no order, so they are not compared.
 */
function vectorBinary(op: BinaryOperator, left: Value, right: Value, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): VectorValue {
  if (!['+', '-', '*', '/', '^'].includes(op)) fail('E-TYPE', span, { expected: 'number', found: 'vector' });
  const length = (v: Value) => (v.type === 'vector' ? v.items.length : undefined);
  const n = length(left) ?? length(right)!;
  if (left.type === 'vector' && right.type === 'vector' && left.items.length !== right.items.length) {
    fail('E-VECTOR-LENGTH', span, { left: left.items.length, right: right.items.length });
  }
  const at = (v: Value, i: number): Value => (v.type === 'vector' ? v.items[i]! : v);
  const items: Quantity[] = [];
  for (let i = 0; i < n; i++) items.push(asComplex(arithmetic(op, at(left, i), at(right, i), leftExpr, rightExpr, span, ctx), span));
  return { type: 'vector', items };
}

/**
 * Matrices: + and − item by item (same shape), times or over a number,
 * A·B and A·v as matrix products, A^n and A^-1. A series next to a matrix is
 * a column (A·v), or a row on the left (v·A).
 */
function matrixBinary(op: BinaryOperator, left: Value, right: Value, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): Value {
  const shape = (m: MatrixValue) => `${m.rows}×${m.cols}`;
  const each = (m: MatrixValue, f: (q: Quantity, k: number) => Value): MatrixValue => ({ ...m, items: m.items.map((q, k) => asComplex(f(q, k), span)) });
  if (op === '^') {
    if (left.type !== 'matrix') return fail('E-TYPE', rightExpr.span, { expected: 'number', found: 'matrix' });
    const n = asQuantity(right, rightExpr.span);
    if (!isDimensionless(n.dim) || !Number.isInteger(n.si) || n.si < -1) fail('E-DOMAIN', rightExpr.span, { function: '^' });
    if (n.si === -1) return inverseOf(left, leftExpr.span, '^');
    if (left.rows !== left.cols) fail('E-MATRIX-SQUARE', leftExpr.span, { function: '^', rows: left.rows, cols: left.cols });
    if (n.si === 0) return matrix(left.rows, left.cols, left.items.map((_, k) => quantity(Math.floor(k / left.cols) === k % left.cols ? 1 : 0)));
    let power: MatrixValue = left;
    for (let k = 1; k < n.si; k++) power = product(power, left, leftExpr, rightExpr, span, ctx);
    return power;
  }
  if (op === '+' || op === '-') {
    if (left.type !== 'matrix' || right.type !== 'matrix') return fail('E-MATRIX-SHAPE', span, { operator: op, left: left.type === 'matrix' ? shape(left) : left.type, right: right.type === 'matrix' ? shape(right) : right.type });
    if (left.rows !== right.rows || left.cols !== right.cols) fail('E-MATRIX-SHAPE', span, { operator: op, left: shape(left), right: shape(right) });
    return each(left, (q, k) => arithmetic(op, q, right.items[k]!, leftExpr, rightExpr, span, ctx));
  }
  if (op === '*' || op === '/') {
    // A number scales every item; a matrix or series multiplies as a matrix.
    if (right.type === 'quantity') return each(left as MatrixValue, (q) => arithmetic(op, q, right, leftExpr, rightExpr, span, ctx));
    if (op === '/') return fail('E-TYPE', rightExpr.span, { expected: 'number', found: right.type });
    if (left.type === 'quantity') return each(right as MatrixValue, (q) => arithmetic(op, left, q, leftExpr, rightExpr, span, ctx));
    const a = left.type === 'vector' ? matrix(1, left.items.length, left.items) : asMatrix(left, leftExpr.span);
    const b = asMatrix(right, rightExpr.span);
    const result = product(a, b, leftExpr, rightExpr, span, ctx);
    // v·A gives a row, A·v a column: both come out as series.
    return result.rows === 1 && left.type === 'vector' ? { type: 'vector', items: result.items } : normalized(result);
  }
  return fail('E-TYPE', span, { expected: 'number', found: 'matrix' });
}

/** A·B: every item a sum of products, whose units must agree. */
function product(a: MatrixValue, b: MatrixValue, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): MatrixValue {
  if (a.cols !== b.rows) fail('E-MATRIX-SHAPE', span, { operator: '·', left: `${a.rows}×${a.cols}`, right: `${b.rows}×${b.cols}` });
  const items: Quantity[] = [];
  for (let i = 0; i < a.rows; i++) {
    for (let j = 0; j < b.cols; j++) {
      let sum: Quantity | undefined;
      for (let k = 0; k < a.cols; k++) {
        const term = asComplex(arithmetic('*', at(a, i, k), at(b, k, j), leftExpr, rightExpr, span, ctx), span);
        sum = sum ? asComplex(addSubtract('+', sum, term, span), span) : term;
      }
      items.push(sum!);
    }
  }
  return matrix(a.rows, b.cols, items);
}

/** Two numbers (real or complex): + − · / ^ and comparisons. */
function arithmetic(op: BinaryOperator, left: Value, right: Value, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): Value {
  const a = asComplex(left, leftExpr.span);
  const b = asComplex(right, rightExpr.span);
  if (a.im || b.im) return complexBinary(op, a, b, leftExpr, rightExpr, span, ctx);

  switch (op) {
    case '+':
    case '-':
      return addSubtract(op, a, b, span);
    case '*':
    case '/': {
      // A date has no size: 2026-09-29 · 2 means nothing.
      if (isDate(a)) fail('E-DATE-ARITHMETIC', leftExpr.span);
      if (isDate(b)) fail('E-DATE-ARITHMETIC', rightExpr.span);
      warnOnAbsoluteTemperature(a, leftExpr.span, ctx);
      warnOnAbsoluteTemperature(b, rightExpr.span, ctx);
      // Scaling by a plain number keeps the unit: 1.35 · g_k stays in kN/m.
      const scaled = scaledOperand(op, a, b);
      const combined = scaled ? undefined : samePowerHint(op, a, b);
      // Different units compose: kN/m · m² = kN·m (not joules, which have the same dimension).
      const composed = scaled || combined || !a.hint || !b.hint || a.absolute || b.absolute ? undefined : composedHint(op, a.hint, b.hint, ownNames(ctx.registry));
      const hint = keptHint(scaled) ? { hint: scaled!.hint! } : combined ? { hint: combined } : composed ? { hint: composed } : {};
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

/**
 * Arithmetic with complex values (docs/03-jazyk.md, ch. 6): + − · / and powers
 * with a real exponent. Complex numbers have no order, so only == and ≠ compare them.
 */
function complexBinary(op: BinaryOperator, a: Quantity, b: Quantity, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): Value {
  const [ar, ai, br, bi] = [a.si, a.im ?? 0, b.si, b.im ?? 0];
  const make = (re: number, im: number, dim: Quantity['dim'], hint?: ResolvedUnit): Quantity => quantity(re, dim, { im, ...(hint ? { hint } : {}) });
  switch (op) {
    case '+':
    case '-': {
      if (!sameDim(a.dim, b.dim)) fail('E-UNIT-MISMATCH', span, { operator: op, left: baseUnitSymbol(a.dim), right: baseUnitSymbol(b.dim) });
      if (a.absolute || b.absolute) fail('E-COMPLEX-ARG', span);
      const sign = op === '+' ? 1 : -1;
      return make(ar + sign * br, ai + sign * bi, a.dim, a.hint ?? b.hint);
    }
    case '*':
    case '/': {
      if (a.absolute || b.absolute) fail('E-COMPLEX-ARG', span);
      const scaled = scaledOperand(op, a, b);
      const hint = keptHint(scaled) ? scaled!.hint : undefined;
      if (op === '*') return make(ar * br - ai * bi, ar * bi + ai * br, multiplyDims(a.dim, b.dim), hint);
      const d = br * br + bi * bi;
      if (d === 0) fail('E-DIV-ZERO', rightExpr.span);
      return make((ar * br + ai * bi) / d, (ai * br - ar * bi) / d, divideDims(a.dim, b.dim), hint);
    }
    case '^': {
      if (bi || !isDimensionless(b.dim)) fail('E-COMPLEX-ARG', rightExpr.span);
      if (ai === 0 && ar === 0) return make(0, 0, powerDim(a.dim, br));
      // Principal value: r^p ∠ p·φ.
      const r = Math.hypot(ar, ai) ** br;
      const phi = Math.atan2(ai, ar) * br;
      const re = r * Math.cos(phi);
      const im = r * Math.sin(phi);
      // Whole powers of a + bj are exact up to rounding: keep tiny parts out.
      const tiny = 1e-15 * r;
      return make(Math.abs(re) < tiny ? 0 : re, Math.abs(im) < tiny ? 0 : im, powerDim(a.dim, br), poweredHint(a, br).hint);
    }
    case '==':
    case '!=': {
      if (!sameDim(a.dim, b.dim)) fail('E-UNIT-MISMATCH', span, { operator: op, left: baseUnitSymbol(a.dim), right: baseUnitSymbol(b.dim) });
      const tolerance = COMPARE_EPSILON * Math.max(Math.hypot(ar, ai), Math.hypot(br, bi));
      const equal = Math.hypot(ar - br, ai - bi) <= tolerance;
      return { type: 'boolean', value: op === '==' ? equal : !equal };
    }
    default:
      void ctx;
      void leftExpr;
      return fail('E-COMPLEX-ORDER', span, { operator: op });
  }
}

const namedByRegistry = new WeakMap<UnitRegistry, UnitNames>();
/** Unit names of this registry, for composing units of products. */
function ownNames(registry: UnitRegistry): UnitNames {
  let named = namedByRegistry.get(registry);
  if (!named) {
    named = unitNames((symbol) => registry.resolve(symbol), PREFERRED_UNITS);
    namedByRegistry.set(registry, named);
  }
  return named;
}

/**
 * The operand whose unit a product or quotient keeps. Scaling by a plain
 * number keeps the unit: 1.35 · g_k stays in kN/m, 70 % · 5.8 CZK/kWh stays in
 * CZK/kWh. Between two plain numbers the one with a unit symbol (%) wins.
 */
function scaledOperand(op: '*' | '/', a: Quantity, b: Quantity): Quantity | undefined {
  const plainA = isDimensionless(a.dim);
  const plainB = isDimensionless(b.dim);
  if (!plainA && plainB) return a;
  if (plainA && !plainB) return op === '*' ? b : undefined;
  if (plainA && plainB) return !b.hint ? a : op === '*' && !a.hint ? b : undefined;
  return undefined;
}

/**
 * Whether a product keeps the unit symbol of the scaled factor: always for
 * units with a dimension; of plain numbers only counts like ks (size 1), so
 * 200 · 21 % is 42, not 4200 %.
 */
function keptHint(scaled: Quantity | undefined): boolean {
  if (!scaled?.hint) return false;
  return !isDimensionless(scaled.dim) || scaled.hint.factor === 1;
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
  if (a.hint.power) return { hint: powerOf(a.hint.power, a.hint.power.exponent * exponent)! };
  const symbol = /[·/]/.test(a.hint.symbol) ? `(${a.hint.symbol})` : a.hint.symbol;
  return { hint: { symbol: `${symbol}${superscript(exponent)}`, factor: a.hint.factor ** exponent, dim: powerDim(a.hint.dim, exponent) } };
}

/**
 * Powers of the same unit multiply to a power of it: mm² · mm = mm³,
 * cm³ / cm = cm², so the volume of a rod given in mm comes out in mm³.
 * Different units (kN · m / cm³) fall back to SI units; a target unit (| MPa) picks others.
 */
function samePowerHint(op: '*' | '/', a: Quantity, b: Quantity): ResolvedUnit | undefined {
  const [pa, pb] = [a.hint?.power, b.hint?.power];
  if (!pa || !pb || pa.symbol !== pb.symbol || a.absolute || b.absolute) return undefined;
  return powerOf(pa, op === '*' ? pa.exponent + pb.exponent : pa.exponent - pb.exponent);
}

function powerOf(unit: NonNullable<ResolvedUnit['power']>, exponent: number): ResolvedUnit | undefined {
  if (exponent === 0 || !Number.isInteger(exponent)) return undefined;
  return {
    symbol: `${unit.symbol}${superscript(exponent)}`,
    factor: unit.factor ** exponent,
    dim: powerDim(unit.dim, exponent),
    power: { ...unit, exponent },
  };
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

