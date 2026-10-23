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
import type { Expr, NamedArg } from '../lang/ast.js';
import { divideDims, isDimensionless, multiplyDims, powerDim, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import { withoutShownUnits, type EvalContext } from './evaluator.js';
import { extremum, rootsOf } from './roots.js';
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
  const value = low.si === high.si ? 0 : adapt(low.si, high.si, whole, 0);
  if (!accurate) ctx.warnings.push(diagnostic('W-CALCULUS-ACCURACY', call.span, { function: call.name }));
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
  const f = asFunction(body, variable.name, low, ctx, evaluate, call.span);
  let total: Quantity | undefined;
  for (let k = low.si; k <= high.si; k++) {
    const term = f(k);
    total = total ? { ...total, si: total.si + term.si } : term;
  }
  return total ?? quantity(0);
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
