/**
 * Integrals, derivatives and sums with a variable of their own
 * (docs/03-jazyk.md, ch. 7.1c):
 *
 *   integral(q·x·(L − x)/2, x: 0 m .. L)      adaptive Gauss–Kronrod (G7K15)
 *   derivative(w(x), x: L/2, order: 2)         Ridders' extrapolation (1st and 2nd order)
 *   sum(1/k², k: 1 .. 100)
 *
 * The variable is local: x inside the call does not read or change an x of
 * the sheet (as in Calcpad). Units follow the operation: an integral has the
 * unit of the integrand times the variable, a derivative the unit of the
 * expression over the variable (as in EngineeringPaper.xyz).
 */

import { CalcError, diagnostic, fail, type Span } from '../diagnostics.js';
import type { Expr, NamedArg, Statement } from '../lang/ast.js';
import { divideDims, isDimensionless, multiplyDims, powerDim, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type MatrixValue, type Quantity, type Value, type VectorValue } from '../values/value.js';
import { isPlainZero, matrix, normalized, withZerosOfUnit } from '../functions/linear.js';
import { asComplex, asQuantity } from './coerce.js';
import { withoutShownUnits, type EvalContext } from './evaluator.js';
import { extremum, rootsOf } from './roots.js';
import { solveStatement } from './solver.js';
import { withBareZero } from './zero.js';

type CallExpr = Extract<Expr, { kind: 'call' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

/** Relative accuracy aimed at by the integral. */
const INTEGRAL_TOLERANCE = 1e-10;
const MAX_DEPTH = 40;
/** The narrowest part of the interval divided further around a jump of the integrand (relative to the whole). */
const JUMP_WIDTH = 1e-9;
const MAX_EVALUATIONS = 200_000;
const MAX_TERMS = 1_000_000;

/** The named argument that binds the variable (not an option such as order:). */
function binding(call: CallExpr, options: readonly string[]): NamedArg | undefined {
  const binders = call.named.filter((n) => !options.includes(n.name));
  if (binders.length > 1) fail('E-NAMED-ARG', binders[1]!.nameSpan, { function: call.name, argument: binders[1]!.name, problem: 'unknown' });
  return binders[0];
}

/** True when a call is the form with its own variable: sum(1/k², k: 1 .. n), not sum(series). */
export function isBindingCall(call: CallExpr): boolean {
  return call.named.some((n) => n.name !== 'order');
}

export function callCalculus(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  switch (call.name) {
    case 'integral':
      return integral(call, ctx, evaluate);
    case 'derivative':
      return derivative(call, ctx, evaluate);
    case 'roots':
      return rootsOf(call, ctx, evaluate);
    case 'solve':
      return solveValue(call, ctx, evaluate);
    case 'first':
      return firstWhole(call, ctx, evaluate);
    case 'matrix':
      return matrixOfIndices(call, ctx, evaluate);
    case 'vector':
      return vectorOfIndices(call, ctx, evaluate);
    case 'minimize':
    case 'maximize': {
      const { body, variable } = parts(call, []);
      const [low, high] = range(variable, call, ctx, evaluate);
      const f = asFunction(body, variable.name, low, ctx, evaluate, call.span);
      // Only the place of the extreme is kept, in the unit of the interval: no unit of f is shown.
      return extremum(call, (x) => withoutShownUnits(() => f(x)), low, high);
    }
    default:
      return sum(call, ctx, evaluate);
  }
}

/**
 * solve(eq, x: a .. b), solve(eq, x: guess), solve(eq, x): the root as a value, so a function can be defined
 * by an equation (λ of the Colebrook equation) and a column of a table can solve one in each row.
 */
function solveValue(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const equation = call.args[0];
  const last = call.args[1];
  const bound = call.named[0];
  const variable = bound ? { name: bound.name, span: bound.nameSpan } : last?.kind === 'variable' ? { name: last.name, span: last.span } : undefined;
  if (!equation || equation.kind !== 'binary' || equation.operator !== '==' || !variable || call.named.length > 1 || call.args.length !== (bound ? 1 : 2)) return fail('E-SOLVE-VALUE-FORM', call.span);
  const value = bound?.value;
  const statement: Extract<Statement, { kind: 'solve' }> = {
    kind: 'solve',
    unknowns: [variable],
    equations: [{ left: equation.left, right: equation.right, span: equation.span }],
    ...(value?.kind === 'range' ? { range: { low: value.low, high: value.high } } : {}),
    guesses: value && value.kind !== 'range' ? [{ name: variable.name, nameSpan: variable.span, value }] : [],
    span: call.span,
  };
  return solveStatement(statement, ctx, evaluate).values[0]!;
}

/**
 * first(condition, n: 1 .. 50): the least whole number in the range (or number of a unit: t: 1 yr .. 20 yr) for
 * which the condition holds, tried one after another. When to replace a machine, how many bolts.
 */
function firstWhole(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const { body, variable } = parts(call, []);
  const [low, high] = range(variable, call, ctx, evaluate);
  const step = low.hint?.factor ?? 1;
  const start = low.si / step;
  if (Math.abs(start - Math.round(start)) > 1e-9 * Math.max(1, Math.abs(start))) fail('E-DOMAIN', variable.value.span, { function: call.name });
  for (let k = Math.round(start); k * step <= high.si * (1 + Math.sign(high.si) * 1e-12); k++) {
    if (k - start > MAX_TERMS) fail('E-RANGE-SIZE', call.span);
    const here = quantity(k * step, low.dim, low.hint ? { hint: low.hint } : {});
    const holds = evaluate(body, { ...ctx, lookup: (n, at) => (n === variable.name ? here : ctx.lookup(n, at)) });
    if (holds.type !== 'boolean') return fail('E-TYPE', body.span, { expected: 'boolean', found: holds.type === 'quantity' ? 'number' : holds.type });
    if (holds.value) return here;
  }
  return fail('E-FIRST-NONE', call.span);
}

/** The one expression of the call and its variable. */
function parts(call: CallExpr, options: readonly string[]): { body: Expr; variable: NamedArg } {
  const variable = binding(call, options);
  if (!variable || call.args.length !== 1) return fail('E-CALCULUS-FORM', call.span, { function: call.name });
  return { body: call.args[0]!, variable };
}

function range(variable: NamedArg, call: CallExpr, ctx: EvalContext, evaluate: Evaluate): [Quantity, Quantity] {
  const r = variable.value;
  if (r.kind !== 'range') return fail('E-CALCULUS-FORM', r.span, { function: call.name });
  // A bound written as a bare 0 is in the unit of the other one (h: 0 .. h_1).
  const [low, high] = withBareZero(asQuantity(evaluate(r.low, ctx), r.low.span), asQuantity(evaluate(r.high, ctx), r.high.span), r.low, r.high);
  if (!sameDim(low.dim, high.dim)) fail('E-UNIT-MISMATCH', r.span, { operator: '..', left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
  return [low, high];
}

/** The expression as a function of its variable: the value of the variable carries the dimension and unit of `like`. */
function asFunction(body: Expr, name: string, like: Quantity, ctx: EvalContext, evaluate: Evaluate, span: Span): (si: number) => Quantity {
  let dim: Quantity['dim'] | undefined;
  return (si: number) => {
    const local: Value = quantity(si, like.dim, like.hint ? { hint: like.hint } : {});
    const inner: EvalContext = { ...ctx, lookup: (n, at) => (n === name ? local : ctx.lookup(n, at)) };
    const value = asQuantity(evaluate(body, inner), body.span);
    if (value.im) fail('E-COMPLEX-ARG', body.span);
    // Every value of the expression must have the same dimension.
    if (dim === undefined) dim = value.dim;
    else if (!sameDim(dim, value.dim)) fail('E-UNIT-MISMATCH', span, { operator: '∫', left: baseUnitSymbol(dim), right: baseUnitSymbol(value.dim) });
    return value;
  };
}

// ---------------------------------------------------------------- integral

// Gauss–Kronrod 7–15 points (QUADPACK): Kronrod nodes, their weights, and the weights of the 7-point Gauss rule on every second node.
const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];

/**
 * The tanh–sinh rule: its points crowd exponentially towards the ends, so what f does there hardly counts. The
 * value when two halvings of its step agree, else undefined (a jump inside the interval, where it is no better).
 */
function doubleExponential(g: (x: number) => number, a: number, b: number): number | undefined {
  const half = (b - a) / 2;
  /** One point t: its distance from the end is worked out on its own, as it soon falls below the rounding of x. */
  const term = (t: number): number => {
    const u = (Math.PI / 2) * Math.sinh(t);
    const weight = (Math.PI / 2) * Math.cosh(t) / Math.cosh(u) ** 2;
    // 1 ∓ tanh u: how far from the nearer end.
    const off = 1 / (Math.exp(Math.abs(u)) * Math.cosh(u));
    const x = t > 0 ? b - half * off : a + half * off;
    // A point that rounds to the end itself adds nothing that is known.
    if (weight === 0 || x === a || x === b) return 0;
    let value: number;
    try {
      value = g(x);
    } catch (err) {
      if (err instanceof CalcError && err.diagnostic.code !== 'E-TIME-LIMIT') return 0;
      throw err;
    }
    return Number.isFinite(value) ? weight * value : 0;
  };
  const LIMIT = 4;
  let h = 0.5;
  let sum = term(0);
  for (let k = 1; k * h <= LIMIT; k++) sum += term(k * h) + term(-k * h);
  let previous = sum * h * half;
  for (let level = 1; level <= 7; level++) {
    h /= 2;
    // The points of the finer step that the coarser one lacks: the odd multiples.
    for (let k = 1; k * h <= LIMIT; k += 2) sum += term(k * h) + term(-k * h);
    const current = sum * h * half;
    if (level >= 2 && Math.abs(current - previous) <= 1e-9 * Math.abs(current)) return current;
    previous = current;
  }
  return undefined;
}

function integral(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const { body, variable } = parts(call, []);
  const [low, high] = range(variable, call, ctx, evaluate);
  const f = asFunction(body, variable.name, low, ctx, evaluate, call.span);
  let sample: Quantity | undefined;
  let evaluations = 0;
  const g = (x: number) => {
    evaluations++;
    // The first point gives the unit of the result; the others only their numbers.
    const value = sample ? withoutShownUnits(() => f(x)) : f(x);
    sample ??= value;
    return value.si;
  };
  /** f at an end of an interval, where the rule has no point; undefined where f has no value (1/√x at 0). */
  const atEnd = (x: number): number | undefined => {
    try {
      const v = g(x);
      return Number.isFinite(v) ? v : undefined;
    } catch (err) {
      if (err instanceof CalcError && err.diagnostic.code !== 'E-TIME-LIMIT') return undefined;
      throw err;
    }
  };
  const rule = (a: number, b: number): { kronrod: number; error: number; size: number } => {
    const centre = (a + b) / 2;
    const half = (b - a) / 2;
    const fc = g(centre);
    let kronrod = WGK[7]! * fc;
    let gauss = WG[3]! * fc;
    // ∫|f|: how big the values are, whatever their sum (a work over a turn is nearly zero).
    let size = WGK[7]! * Math.abs(fc);
    // The two outermost points on each side: the trend of f towards the ends.
    const outer: number[] = [];
    for (let j = 0; j < 7; j++) {
      const dx = half * XGK[j]!;
      const [left, right] = [g(centre - dx), g(centre + dx)];
      if (j < 2) outer.push(left, right);
      const sumPair = left + right;
      kronrod += WGK[j]! * sumPair;
      size += WGK[j]! * (Math.abs(left) + Math.abs(right));
      if (j % 2 === 1) gauss += WG[(j - 1) / 2]! * sumPair;
    }
    // Between the outermost points and the ends neither rule looks: a jump there (a condition switching f just
    // before the upper limit) is seen only by f at the ends. f there far off the trend of the two outermost
    // points (more than ten times their own step) is a jump, and counts as an error of the size of the gap.
    const gap = half * (1 - XGK[0]!);
    const reach = (1 - XGK[0]!) / (XGK[0]! - XGK[1]!);
    const jumpAt = (end: number | undefined, last: number, before: number) => {
      if (end === undefined) return 0;
      const off = Math.abs(end - (last + (last - before) * reach));
      return off > 10 * Math.abs(last - before) + 1e-12 * (Math.abs(end) + Math.abs(last)) ? Math.abs(end - last) : 0;
    };
    const jump = Math.max(jumpAt(atEnd(a), outer[0]!, outer[2]!), jumpAt(atEnd(b), outer[1]!, outer[3]!));
    return { kronrod: kronrod * half, error: Math.max(Math.abs((kronrod - gauss) * half), jump * gap), size: Math.abs(size * half) };
  };
  let accurate = true;
  const warningsBefore = ctx.warnings.length;
  const whole = rule(low.si, high.si);
  // Relative to the result, or to ∫|f| where the parts cancel out (QUADPACK): a result near zero needs no
  // more digits than the values it is made of have.
  const tolerance = Math.max(INTEGRAL_TOLERANCE * Math.max(Math.abs(whole.kronrod), whole.size), 1e-300);
  const adapt = (a: number, b: number, estimate: { kronrod: number; error: number; size: number }, depth: number): number => {
    if (estimate.error <= tolerance * Math.abs((b - a) / (high.si - low.si)) || estimate.error === 0) return estimate.kronrod;
    // A jump of f (a condition switching it) never meets the criterion above, as its error shrinks only with the
    // width: an interval this narrow adds less than the accuracy aimed at, and is not divided further.
    if (Math.abs(b - a) <= JUMP_WIDTH * Math.abs(high.si - low.si) && estimate.error <= 4 * JUMP_WIDTH * whole.size) return estimate.kronrod;
    // Too deep or too many points: the estimate stands, with a warning.
    if (depth >= MAX_DEPTH || evaluations > MAX_EVALUATIONS) {
      accurate = false;
      return estimate.kronrod;
    }
    const middle = (a + b) / 2;
    return adapt(a, middle, rule(a, middle), depth + 1) + adapt(middle, b, rule(middle, b), depth + 1);
  };
  let value = low.si === high.si ? 0 : adapt(low.si, high.si, whole, 0);
  if (!accurate) {
    // A singularity at an end (1/√x at 0) is beyond this rule, not beyond the integral.
    const atEnds = doubleExponential(g, low.si, high.si);
    if (atEnds !== undefined) value = atEnds;
    else ctx.warnings.push(diagnostic('W-CALCULUS-ACCURACY', call.span, { function: call.name }));
  }
  // A zero far out in the tail (exp(−x²) at x = 500) is what the integral expects there.
  for (let i = ctx.warnings.length - 1; i >= warningsBefore; i--) if (ctx.warnings[i]!.code === 'W-UNDERFLOW') ctx.warnings.splice(i, 1);
  const f0 = sample ?? f(low.si);
  return quantity(value, multiplyDims(f0.dim, low.dim), combinedHint(f0.hint, low.hint, '*', 1));
}

// ---------------------------------------------------------------- derivative

function derivative(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const { body, variable } = parts(call, ['order']);
  if (variable.value.kind === 'range') fail('E-CALCULUS-FORM', variable.value.span, { function: call.name });
  const at = asQuantity(evaluate(variable.value, ctx), variable.value.span);
  const orderArg = call.named.find((n) => n.name === 'order');
  const order = orderArg ? asQuantity(evaluate(orderArg.value, ctx), orderArg.value.span) : quantity(1);
  if (!isDimensionless(order.dim) || (order.si !== 1 && order.si !== 2)) fail('E-DOMAIN', orderArg?.value.span ?? call.span, { function: call.name });
  const f = asFunction(body, variable.name, at, ctx, evaluate, call.span);
  const f0 = f(at.si);
  // A step from the size of the point, or of its unit when the point is zero (0 m, 0 mm).
  const scale = Math.max(Math.abs(at.si), at.hint && !isDimensionless(at.dim) ? at.hint.factor : 1);
  const difference =
    order.si === 1 ? (h: number) => (f(at.si + h).si - f(at.si - h).si) / (2 * h) : (h: number) => (f(at.si + h).si - 2 * f0.si + f(at.si - h).si) / (h * h);
  const value = ridders(difference, 0.05 * scale);
  return quantity(value, divideDims(f0.dim, powerDim(at.dim, order.si)), combinedHint(f0.hint, at.hint, '/', order.si));
}

/**
 * Ridders' method (Numerical Recipes, dfridr): central differences with a
 * shrinking step, extrapolated to step zero (Richardson), keeping the
 * estimate with the smallest error.
 */
function ridders(difference: (h: number) => number, h0: number): number {
  const CON = 1.4;
  const CON2 = CON * CON;
  const N = 10;
  const table: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  let h = h0;
  table[0]![0] = difference(h);
  let best = table[0]![0]!;
  let error = Infinity;
  for (let i = 1; i < N; i++) {
    h /= CON;
    table[0]![i] = difference(h);
    let factor = CON2;
    for (let j = 1; j <= i; j++) {
      table[j]![i] = (table[j - 1]![i]! * factor - table[j - 1]![i - 1]!) / (factor - 1);
      factor *= CON2;
      const e = Math.max(Math.abs(table[j]![i]! - table[j - 1]![i]!), Math.abs(table[j]![i]! - table[j - 1]![i - 1]!));
      if (e <= error) {
        error = e;
        best = table[j]![i]!;
      }
    }
    if (Math.abs(table[i]![i]! - table[i - 1]![i - 1]!) >= 2 * error) break;
  }
  return best;
}

// ---------------------------------------------------------------- sum

function sum(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const { body, variable } = parts(call, []);
  const [low, high] = range(variable, call, ctx, evaluate);
  if (!isDimensionless(low.dim) || !Number.isInteger(low.si) || !Number.isInteger(high.si)) fail('E-DOMAIN', variable.value.span, { function: call.name });
  if (high.si - low.si + 1 > MAX_TERMS) fail('E-RANGE-SIZE', variable.value.span);
  // A sum of matrices or series goes item by item: the stiffness matrix of a structure from those of its members.
  const termAt = (k: number): Value => evaluate(body, { ...ctx, lookup: (n, at) => (n === variable.name ? quantity(k) : ctx.lookup(n, at)) });
  const opening = high.si >= low.si ? termAt(low.si) : undefined;
  if (opening?.type === 'matrix' || opening?.type === 'vector') {
    let total: MatrixValue | VectorValue = opening;
    for (let k = low.si + 1; k <= high.si; k++) total = addedItems(total, termAt(k), body.span);
    return { ...total, items: withZerosOfUnit(total.items) };
  }
  const f = asFunction(body, variable.name, low, ctx, evaluate, call.span);
  let total: Quantity | undefined;
  for (let k = low.si; k <= high.si; k++) {
    const term = f(k);
    total = total ? { ...total, si: total.si + term.si } : term;
  }
  return total ?? quantity(0);
}

/** A term added to a matrix or series, item by item; a zero without a unit (outside a member) adds nothing. */
function addedItems(total: MatrixValue | VectorValue, term: Value, span: Span): MatrixValue | VectorValue {
  const shape = (v: Value) => (v.type === 'matrix' ? `${v.rows}×${v.cols}` : v.type === 'vector' ? `${v.items.length}` : v.type);
  if (term.type !== total.type || shape(term) !== shape(total)) fail('E-MATRIX-SHAPE', span, { operator: 'Σ', left: shape(total), right: shape(term) });
  const added = (term as MatrixValue | VectorValue).items;
  const items = total.items.map((a, k) => {
    const b = added[k]!;
    if (isPlainZero(b)) return a;
    if (isPlainZero(a)) return b;
    if (!sameDim(a.dim, b.dim)) fail('E-UNIT-MISMATCH', span, { operator: 'Σ', left: baseUnitSymbol(a.dim), right: baseUnitSymbol(b.dim) });
    const { exact: _exact, ...rest } = a;
    const im = (a.im ?? 0) + (b.im ?? 0);
    return { ...rest, si: a.si + b.si, ...(im ? { im } : {}) };
  });
  return { ...total, items };
}

/** matrix(f(i, j), i: 1 .. n, j: 1 .. m): a matrix from the indices of its items. */
function matrixOfIndices(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const [rowVar, colVar] = call.named;
  if (call.args.length !== 1 || call.named.length !== 2) return fail('E-CALCULUS-FORM', call.span, { function: call.name });
  const body = call.args[0]!;
  const rows = wholeNumbers(rowVar!, call, ctx, evaluate);
  const cols = wholeNumbers(colVar!, call, ctx, evaluate);
  if (rows.length * cols.length > MAX_TERMS) fail('E-RANGE-SIZE', call.span);
  const items: Quantity[] = [];
  for (const i of rows) {
    for (const j of cols) {
      const lookup = (n: string, at: Span): Value => (n === rowVar!.name ? quantity(i) : n === colVar!.name ? quantity(j) : ctx.lookup(n, at));
      items.push(asComplex(evaluate(body, { ...ctx, lookup }), body.span));
    }
  }
  return normalized(matrix(rows.length, cols.length, withZerosOfUnit(items)));
}

/** vector(f(i), i: 1 .. n): a series from the index of its items, all of one unit. */
function vectorOfIndices(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const { body, variable } = parts(call, []);
  const numbers = wholeNumbers(variable, call, ctx, evaluate);
  if (numbers.length > MAX_TERMS) fail('E-RANGE-SIZE', call.span);
  const items = withZerosOfUnit(
    numbers.map((k) => asComplex(evaluate(body, { ...ctx, lookup: (n, at) => (n === variable.name ? quantity(k) : ctx.lookup(n, at)) }), body.span)),
  );
  items.forEach((q) => {
    if (!sameDim(q.dim, items[0]!.dim)) fail('E-UNIT-MISMATCH', body.span, { operator: ',', left: baseUnitSymbol(items[0]!.dim), right: baseUnitSymbol(q.dim) });
  });
  return { type: 'vector', items };
}

function wholeNumbers(variable: NamedArg, call: CallExpr, ctx: EvalContext, evaluate: Evaluate): number[] {
  const [low, high] = range(variable, call, ctx, evaluate);
  if (!isDimensionless(low.dim) || !Number.isInteger(low.si) || !Number.isInteger(high.si) || high.si < low.si) fail('E-DOMAIN', variable.value.span, { function: call.name });
  if (high.si - low.si + 1 > MAX_TERMS) fail('E-RANGE-SIZE', variable.value.span);
  return Array.from({ length: high.si - low.si + 1 }, (_, k) => low.si + k);
}

// ---------------------------------------------------------------- units

/**
 * The unit symbol of a result: kN/m · m = kN, kN · m, mm / m, mm / m² for
 * the second derivative. Without symbols (or when they do not combine
 * readably) none: the result is shown in SI units.
 */
function combinedHint(f: ResolvedUnit | undefined, x: ResolvedUnit | undefined, op: '*' | '/', power: number): { hint?: ResolvedUnit } {
  if (!f || !x || /[()]/.test(f.symbol + x.symbol)) return {};
  const xp = power === 1 ? x.symbol : `${x.symbol}²`;
  const xFactor = x.factor ** power;
  const xDim = powerDim(x.dim, power);
  if (op === '*') {
    if (f.symbol.endsWith(`/${x.symbol}`)) return { hint: { symbol: f.symbol.slice(0, -x.symbol.length - 1), factor: f.factor * x.factor, dim: multiplyDims(f.dim, x.dim) } };
    if (/\//.test(f.symbol) || /[·/]/.test(x.symbol)) return {};
    return { hint: { symbol: `${f.symbol}·${x.symbol}`, factor: f.factor * x.factor, dim: multiplyDims(f.dim, x.dim) } };
  }
  if (/[·/]/.test(x.symbol) || /\//.test(f.symbol)) return {};
  return { hint: { symbol: `${f.symbol}/${xp}`, factor: f.factor / xFactor, dim: divideDims(f.dim, xDim) } };
}
