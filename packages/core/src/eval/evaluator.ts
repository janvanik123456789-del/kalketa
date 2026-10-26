/**
 * Expression evaluator.
 *
 * Works on SI magnitudes and dimensions; raises CalcError with a diagnostic on
 * the first problem in an expression. Warnings are collected in the context.
 */

import { diagnostic, fail, type Diagnostic, type Span } from '../diagnostics.js';
import * as X from '../values/exact.js';
import type { BinaryOperator, Expr } from '../lang/ast.js';
import { dim, isDimensionless, multiplyDims, divideDims, powerDim, sameDim, superscript } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { UnitRegistry } from '../units/registry.js';
import { resolveUnit, type ResolvedUnit } from '../units/unitExpr.js';
import type { TableRead } from '../tables/table.js';
import { quantity, type MatrixValue, type Quantity, type Value, type VectorValue } from '../values/value.js';
import { dateValue, isDate } from '../values/date.js';
import { asBoolean, asComplex, asQuantity } from './coerce.js';
import { BUILTIN_CONSTANTS, callFunction, FUNCTION_NAME_SET } from './functions.js';
import { composedHint, rootHint, unitNames, type UnitNames } from '../units/compose.js';
import { PREFERRED_UNITS } from '../units/registry.js';
import { callCalculus, isBindingCall } from './calculus.js';
import { PLOT_FUNCTION } from './plot.js';
import { isUnboundedCall } from './derive.js';
import { fitCall, polyfitCall, polyvalCall } from './fit.js';
import { isBareZero, withBareZero, zeroLike } from './zero.js';
import { BINDING_FUNCTIONS } from '../lang/parser.js';
import { asMatrix, at, inverseOf, matrix, normalized } from '../functions/linear.js';
import { callTableFunction, COMPARE_FUNCTION, memberOf, TABLE_FUNCTIONS } from './tables.js';
import { applyFunction, lookupFunction } from './userFunctions.js';
import { primeName } from './ode.js';
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

/** While above 0, products and powers compose no unit to show (see withoutShownUnits). */
let hintsOff = 0;

/**
 * Runs f for values whose units are never shown (the points of an integral, of the search of an extreme): the
 * numbers and dimensions are the same, only the composing of the unit to show (kN·m from kN/m · m²) is left out.
 */
export function withoutShownUnits<T>(f: () => T): T {
  hintsOff++;
  try {
    return f();
  } finally {
    hintsOff--;
  }
}

/** Longest evaluation of one line of a sheet: a line that would compute for ever fails, the window stays alive. */
export const LINE_TIME_LIMIT_MS = 15_000;

let deadline = Infinity;
let limitSeconds = 0;
let expired = false;
let ticks = 0;

/**
 * Runs f with a time limit on the expressions it evaluates; once over, every evaluation fails at once (E-TIME-LIMIT),
 * so loops that pass over failing points end quickly too. Nested calls keep the outer limit.
 */
export function withTimeLimit<T>(ms: number, f: () => T): T {
  if (deadline !== Infinity) return f();
  deadline = Date.now() + ms;
  limitSeconds = Math.max(1, Math.round(ms / 1000));
  try {
    return f();
  } finally {
    deadline = Infinity;
    expired = false;
  }
}

export function evaluate(expr: Expr, ctx: EvalContext): Value {
  if (expired || ((++ticks & 1023) === 0 && Date.now() > deadline)) {
    expired = true;
    fail('E-TIME-LIMIT', expr.span, { seconds: limitSeconds });
  }
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
      // The number as written, exactly (0.1 is 1/10): only where values are shown, not at points of an integral.
      const written = hintsOff ? undefined : X.fromNumber(expr.value);
      if (!expr.unit) return quantity(expr.value, undefined, written ? { exact: written } : {});
      const unit = resolveUnit(expr.unit, ctx.registry);
      const scaled = written && unit.exact ? X.multiply(written, unit.exact) : undefined;
      if (unit.offset !== undefined) {
        const offset = X.fromNumber(unit.offset);
        const exact = scaled && offset ? X.add(scaled, offset) : undefined;
        return quantity(expr.value * unit.factor + unit.offset, unit.dim, { absolute: true, hint: unit, ...(exact ? { exact } : {}) });
      }
      return quantity(expr.value * unit.factor, unit.dim, { hint: unit, ...(scaled ? { exact: scaled } : {}) });
    }
    case 'unit': {
      // A standalone unit is a scale factor; °C here means a difference.
      const unit = resolveUnit(expr.unit, ctx.registry);
      return quantity(unit.factor, unit.dim, { hint: withoutOffset(unit), ...(unit.exact ? { exact: unit.exact } : {}) });
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
      const negate = (q: Quantity): Quantity => ({ ...q, si: -q.si, ...(q.im ? { im: -q.im } : {}), ...(q.exact ? { exact: X.negate(q.exact) } : {}) });
      if (operand.type === 'vector' || operand.type === 'matrix') {
        if (expr.operator === '±') fail('E-PLUS-MINUS', expr.span);
      }
      if (operand.type === 'vector') return expr.operator === '-' ? { type: 'vector', items: operand.items.map(negate) } : operand;
      if (operand.type === 'matrix') return expr.operator === '-' ? { ...operand, items: operand.items.map(negate) } : operand;
      const q = asComplex(operand, expr.operand.span);
      if (expr.operator === '±') return { type: 'vector', items: [q, negate(q)] };
      return expr.operator === '-' ? negate(q) : q;
    }
    case 'binary':
      return evaluateBinary(expr.operator, expr.left, expr.right, expr.span, ctx);
    case 'call': {
      if (TABLE_FUNCTIONS.has(expr.name)) return callTableFunction(expr, ctx, evaluate);
      // integral(f(x), x: a .. b), derivative(f(x), x: a), sum(f(k), k: 1 .. n): a variable of their own.
      // A chart is a line of its own: plot(M(x), x: 0 m .. L).
      if (expr.name === PLOT_FUNCTION) fail('E-PLOT-PLACE', expr.span, {});
      // A comparison of variants calculates the whole sheet again for each: a line of its own too.
      if (expr.name === COMPARE_FUNCTION) fail('E-COMPARE-PLACE', expr.span, {});
      // Σ and ∫ without bounds are a notation of theory: no value to calculate.
      if (isUnboundedCall(expr)) fail('E-NO-BOUNDS', expr.span, { function: expr.name });
      // fit(y, x: series, kind: "linear"): a curve through measured points, as a function.
      if (expr.name === 'fit') return fitCall(expr, ctx, evaluate);
      // polyfit(x, y, n) and polyval(p, x): the same with the names of MATLAB and NumPy.
      if (expr.name === 'polyfit') return polyfitCall(expr, ctx, evaluate);
      if (expr.name === 'polyval') return polyvalCall(expr, ctx, evaluate);
      if (BINDING_FUNCTIONS.has(expr.name) && (expr.name !== 'sum' || isBindingCall(expr))) return callCalculus(expr, ctx, evaluate);
      if (ctx.blocks?.has(expr.name)) return callBlock(expr, ctx);
      if (!FUNCTION_NAME_SET.has(expr.name)) return applyFunction(lookupFunction(expr, ctx), expr, ctx, evaluate);
      const extra = expr.named[0];
      if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: expr.name, argument: extra.name, problem: 'unknown' });
      return callFunction(expr, (arg) => evaluate(arg, ctx));
    }
    case 'range':
      // A range belongs to a variable: x: 0 m .. L.
      return fail('E-RANGE-PLACE', expr.span);
    case 'member':
      return memberOf(evaluate(expr.object, ctx), expr.name, expr.span, expr.object.span, ctx);
    case 'prime':
      return primeOf(expr, ctx);
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
  return matrix(expr.rows.length, cols, withBareZeros(items, expr.rows.flat()));
}

/**
 * Zeros written without a unit among items of one unit take it, as on paper: [0, 1 m | 1 m, 0].
 * Among items of different units (a stiffness matrix) a zero stays as written.
 */
function withBareZeros(items: Quantity[], exprs: readonly Expr[]): Quantity[] {
  const bare = items.map((q, i) => q.si === 0 && !q.im && isDimensionless(q.dim) && !!exprs[i] && isBareZero(exprs[i]!));
  const others = items.filter((_, i) => !bare[i]);
  if (!bare.some(Boolean) || others.length === 0 || others.some((q) => !sameDim(q.dim, others[0]!.dim)) || isDimensionless(others[0]!.dim)) return items;
  return items.map((q, i) => (bare[i] ? zeroLike(others[0]!) : q));
}

/** [a, b, c]: all items of one dimension; a series among them is spread. */
function vectorOf(expr: Extract<Expr, { kind: 'vector' }>, ctx: EvalContext): VectorValue {
  const evaluated = expr.items.map((item) => evaluate(item, ctx));
  // [0, 2 m, 5 m]: a zero without a unit is one of the others.
  const single = evaluated.every((v) => v.type !== 'vector') ? withBareZeros(evaluated.map((v, i) => asQuantity(v, expr.items[i]!.span)), expr.items) : undefined;
  const items: Quantity[] = [];
  expr.items.forEach((item, i) => {
    const value = evaluated[i]!;
    const parts = single ? [single[i]!] : value.type === 'vector' ? value.items : [asQuantity(value, item.span)];
    for (const q of parts) {
      const first = items[0];
      if (first && !sameDim(first.dim, q.dim)) fail('E-UNIT-MISMATCH', item.span, { operator: ',', left: baseUnitSymbol(first.dim), right: baseUnitSymbol(q.dim) });
      items.push(q);
    }
  });
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
  // a ± b: both values, a + b first, as the two roots of a quadratic.
  if (op === '±') {
    const both = [evaluateBinary('+', leftExpr, rightExpr, span, ctx), evaluateBinary('-', leftExpr, rightExpr, span, ctx)];
    return { type: 'vector', items: both.map((v) => (v.type === 'quantity' ? v : fail('E-PLUS-MINUS', span))) };
  }
  // [20, 25] °C: readings of a thermometer, absolute temperatures as 20 °C is (a lone °C elsewhere is a difference).
  if (op === '*' && leftExpr.kind === 'vector' && rightExpr.kind === 'unit') {
    const unit = resolveUnit(rightExpr.unit, ctx.registry);
    const offset = unit.offset;
    const items = offset === undefined ? undefined : vectorOf(leftExpr, ctx).items;
    if (offset !== undefined && items && items.every((q) => isDimensionless(q.dim) && !q.im && !q.hint)) {
      return { type: 'vector', items: items.map((q) => quantity(q.si * unit.factor + offset, unit.dim, { absolute: true, hint: unit })) };
    }
  }
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

const PER_SECOND = dim({ T: -1 });
const RADIANS_PER_SECOND: ResolvedUnit = { symbol: 'rad/s', factor: 1, dim: PER_SECOND };

/** π written in a factor (2·π, π·n/30): the product is an angle, or an angle per time. */
function writesPi(e: Expr): boolean {
  if (e.kind === 'variable') return e.name === 'π' || e.name === 'pi';
  if (e.kind === 'binary') return (e.operator === '*' || e.operator === '/') && (writesPi(e.left) || (e.operator === '*' && writesPi(e.right)));
  if (e.kind === 'unary') return writesPi(e.operand);
  return false;
}

/** Two numbers (real or complex): + − · / ^ and comparisons. */
/** Operations where a zero written without a unit takes the unit of the other side (p_a + ρ·g·0, y == 0). */
const SUMS_AND_COMPARISONS: ReadonlySet<BinaryOperator> = new Set(['+', '-', '==', '!=', '<', '<=', '>', '>=']);

function arithmetic(op: BinaryOperator, left: Value, right: Value, leftExpr: Expr, rightExpr: Expr, span: Span, ctx: EvalContext): Value {
  const [a, b] = SUMS_AND_COMPARISONS.has(op)
    ? withBareZero(asComplex(left, leftExpr.span), asComplex(right, rightExpr.span), leftExpr, rightExpr)
    : [asComplex(left, leftExpr.span), asComplex(right, rightExpr.span)];
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
      // Values no one sees (points of an integral) need no unit to show: composing it is most of the work.
      const scaled = hintsOff ? undefined : scaledOperand(op, a, b);
      const combined = scaled || hintsOff ? undefined : samePowerHint(op, a, b);
      // Different units compose: kN/m · m² = kN·m (not joules, which have the same dimension).
      const composed = hintsOff || scaled || combined || !a.hint || !b.hint || a.absolute || b.absolute ? undefined : composedHint(op, a.hint, b.hint, ownNames(ctx.registry), op === '*' ? a.si * b.si : a.si / b.si);
      // A share divided by a plain number stays a share: i/4 of 6,96 % is 1,74 %, not 0,0174 (200 · 21 % is still 42).
      const share = op === '/' && scaled === a && !!a.hint && isDimensionless(a.dim) && !b.hint;
      const hint = keptHint(scaled) || share ? { hint: scaled!.hint! } : combined ? { hint: combined } : composed ? { hint: composed } : {};
      // Exactly as well, where both are exact (absolute temperatures are no fractions of anything).
      const exactly = a.exact && b.exact && !a.absolute && !b.absolute ? (op === '*' ? X.multiply(a.exact, b.exact) : X.divide(a.exact, b.exact)) : undefined;
      const exact = exactly ? { exact: exactly } : {};
      // 2·π·f, 2·π·n: an angular velocity, shown in rad/s, not in the Hz or min⁻¹ of the frequency;
      // 2·π/T likewise.
      const product = op === '*' ? multiplyDims(a.dim, b.dim) : divideDims(a.dim, b.dim);
      if (!hintsOff && (writesPi(leftExpr) || (op === '*' && writesPi(rightExpr))) && sameDim(product, PER_SECOND) && (op === '*' || b.si !== 0)) {
        return quantity(op === '*' ? a.si * b.si : a.si / b.si, PER_SECOND, { hint: RADIANS_PER_SECOND, ...exact });
      }
      if (op === '*') return quantity(a.si * b.si, multiplyDims(a.dim, b.dim), { ...hint, ...exact });
      if (b.si === 0) fail('E-DIV-ZERO', rightExpr.span);
      return quantity(a.si / b.si, divideDims(a.dim, b.dim), { ...hint, ...exact });
    }
    case '^': {
      if (!isDimensionless(b.dim)) fail('E-POWER-DIM', rightExpr.span, { dim: baseUnitSymbol(b.dim) });
      warnOnAbsoluteTemperature(a, leftExpr.span, ctx);
      // A whole power, or ^0.5 as a square root, keeps the exact form.
      const half = b.exact && b.exact.num === 1n && b.exact.den === 2n && b.exact.root === 1n;
      const exactly = a.exact && !a.absolute && b.exact ? (half ? X.squareRoot(a.exact) : b.exact.den === 1n && b.exact.root === 1n ? X.power(a.exact, Number(b.exact.num)) : undefined) : undefined;
      return quantity(a.si ** b.si, powerDim(a.dim, b.si), { ...(hintsOff ? {} : poweredHint(a, b.si)), ...(exactly ? { exact: exactly } : {}) });
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
  const sum = a.exact && b.exact ? (op === '+' ? X.add(a.exact, b.exact) : X.subtract(a.exact, b.exact)) : undefined;
  const exact = sum ? { exact: sum } : {};

  // Absolute temperatures: T + T is meaningless, T - T is a difference.
  if (a.absolute && b.absolute) {
    if (op === '+') fail('E-ABS-TEMP', span);
    return quantity(si, a.dim, { ...deltaHint(a.hint), ...exact });
  }
  if (a.absolute || b.absolute) {
    if (op === '-' && b.absolute) fail('E-ABS-TEMP', span);
    const abs = a.absolute ? a : b;
    return quantity(si, a.dim, { absolute: true, ...(abs.hint ? { hint: abs.hint } : {}), ...exact });
  }

  // Keep the unit of the first operand that has one (Calcpad: 1.23 m + 35 cm = 1.58 m).
  const hint = a.hint ?? b.hint;
  return quantity(si, a.dim, { ...(hint ? { hint } : {}), ...exact });
}

/** A whole power keeps the unit: (20 mm)² is 400 mm², (2 kN/m)² is 4 (kN/m)². */
function poweredHint(a: Quantity, exponent: number): { hint?: ResolvedUnit } {
  // x^0.5 and x^(1/3) as √x and ∛x: (mm²)^0.5 = mm.
  const root = exponent > 0 && exponent < 1 && !a.absolute ? Math.round(1 / exponent) : 0;
  if (root > 1 && Math.abs(1 / exponent - root) < 1e-9) {
    const hint = rootHint(a.hint, root);
    return hint ? { hint } : {};
  }
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


/**
 * A derivative written with primes. In a differential equation (w″, no point) it is one of
 * the values the solver gives. At a point (w′(0 m)): the derivative of the function there,
 * from the solution of its equation, else numerically (order 1 or 2) as derivative() does.
 */
function primeOf(expr: Extract<Expr, { kind: 'prime' }>, ctx: EvalContext): Value {
  if (!expr.arg) return ctx.lookup(primeName(expr.name, expr.order), expr.span);
  const fn = ctx.lookup(expr.name, expr.span);
  if (fn.type !== 'function') return fail('E-NOT-FUNCTION', expr.span, { name: expr.name });
  if (fn.derivative) return fn.derivative(expr.order, evaluate(expr.arg, ctx), expr.span);
  const variable = fn.params[0] ?? 'x';
  const span = expr.span;
  const call: Expr = {
    kind: 'call',
    name: 'derivative',
    args: [{ kind: 'call', name: expr.name, args: [{ kind: 'variable', name: variable, span }], named: [], span }],
    named: [
      { name: variable, nameSpan: span, value: expr.arg },
      ...(expr.order > 1 ? [{ name: 'order', nameSpan: span, value: { kind: 'number', value: expr.order, span } as Expr }] : []),
    ],
    span,
  };
  return evaluate(call, ctx);
}
