/**
 * Roots of a polynomial and extremes of a function (docs/03-jazyk.md, ch. 7.1c):
 *
 *   roots(x^3 - 6·x^2 + 11·x - 6, x)       [1, 2, 3]
 *   roots(k - m·ω^2, ω)                     ±√(k/m), in rad/s when k and m have units
 *   x_min := minimize(f(x), x: 0 m .. L)    where f is smallest in the interval
 *
 * roots: the coefficients are found from the expression (eval/isolate.ts), the
 * unit of the variable from them (every term must have the same dimension),
 * and all roots, complex ones too, by the Durand–Kerner iteration, polished by
 * Newton's method; real coefficients give exactly real roots where the
 * imaginary part is only rounding. minimize/maximize: a scan of the interval
 * for the best point, refined by golden-section search around it, so the
 * global extreme in the interval is found, not just the nearest local one.
 */

import { CalcError, fail } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { DIMENSIONLESS, divideDims, multiplyDims, powerDim, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type Quantity, type Value, type VectorValue } from '../values/value.js';
import { asQuantity } from './coerce.js';
import type { EvalContext } from './evaluator.js';
import { polynomialCoefficients } from './isolate.js';

type Evaluate = (expr: Expr, ctx: EvalContext) => Value;
type CallExpr = Extract<Expr, { kind: 'call' }>;

/** Highest degree roots() takes. */
export const MAX_DEGREE = 20;

export function rootsOf(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): VectorValue {
  const variable = call.args[1];
  if (call.args.length !== 2 || call.named.length > 0 || variable?.kind !== 'variable') return fail('E-CALCULUS-FORM', call.span, { function: call.name });
  const expressions = polynomialCoefficients(call.args[0]!, variable.name, MAX_DEGREE);
  if (!expressions) return fail('E-ROOTS-POLYNOMIAL', call.args[0]!.span, { name: variable.name, max: MAX_DEGREE });
  const coefficients = expressions.map((c) => (c ? asQuantity(evaluate(c, ctx), c.span) : undefined));
  const present = coefficients.flatMap((c, k) => (c && (c.si !== 0 || c.im) ? [k] : []));
  const n = present.at(-1);
  const m = present[0];
  if (n === undefined || m === undefined || n === 0) return fail('E-SOLVE-NO-ROOT', call.span);

  // The unit of the variable: c_m·x^m and c_n·x^n have one dimension, so x^(n−m) = c_m/c_n.
  const top = coefficients[n]!;
  const dim: Dimension = n > m ? powerDim(divideDims(coefficients[m]!.dim, top.dim), 1 / (n - m)) : DIMENSIONLESS;
  const term = multiplyDims(top.dim, powerDim(dim, n));
  for (const k of present) {
    const own = multiplyDims(coefficients[k]!.dim, powerDim(dim, k));
    if (!sameDim(own, term)) fail('E-UNIT-MISMATCH', call.args[0]!.span, { operator: '+', left: baseUnitSymbol(term), right: baseUnitSymbol(own) });
  }

  // Monic polynomial in SI magnitudes; x = 0 for the missing lowest powers.
  const a: Complex[] = [];
  for (let k = m; k <= n; k++) {
    const c = coefficients[k];
    a.push(c ? divide([c.si, c.im ?? 0], [top.si, top.im ?? 0]) : [0, 0]);
  }
  const found = [...Array.from({ length: m }, (): Complex => [0, 0]), ...durandKerner(a)];
  const real = a.every(([, im]) => im === 0);
  const items = found
    // Rounding noise is no part of a root: the imaginary part of roots of real coefficients, a real part of ±2j.
    .map(([re, im]): Complex => {
      const size = Math.max(Math.hypot(re, im), 1e-300);
      return [Math.abs(re) <= 1e-12 * size ? 0 : re, real && Math.abs(im) <= 1e-9 * Math.max(size, scaleOf(a)) ? 0 : im];
    })
    .sort(([ar, ai], [br, bi]) => (ai === 0) !== (bi === 0) ? (ai === 0 ? -1 : 1) : ar - br || bi - ai)
    .map(([re, im]) => quantity(re, dim, im ? { im } : {}));
  return { type: 'vector', items };
}

type Complex = [number, number];

const mul = ([a, b]: Complex, [c, d]: Complex): Complex => [a * c - b * d, a * d + b * c];
const add = ([a, b]: Complex, [c, d]: Complex): Complex => [a + c, b + d];
const sub = ([a, b]: Complex, [c, d]: Complex): Complex => [a - c, b - d];
function divide([a, b]: Complex, [c, d]: Complex): Complex {
  const q = c * c + d * d;
  return [(a * c + b * d) / q, (b * c - a * d) / q];
}

/** p(z) of the monic polynomial with coefficients a[0] … a[n] (a[n] = 1), and p'(z). */
function value(a: readonly Complex[], z: Complex): { p: Complex; dp: Complex } {
  let p: Complex = [0, 0];
  let dp: Complex = [0, 0];
  // Horner's scheme for both.
  for (let k = a.length - 1; k >= 0; k--) {
    dp = add(mul(dp, z), p);
    p = add(mul(p, z), a[k]!);
  }
  return { p, dp };
}

/** A bound of the roots (Fujiwara): where the starting points go. */
function scaleOf(a: readonly Complex[]): number {
  const n = a.length - 1;
  let s = 0;
  for (let k = 0; k < n; k++) s = Math.max(s, Math.hypot(...a[k]!) ** (1 / (n - k)));
  return s || 1;
}

function durandKerner(a: readonly Complex[]): Complex[] {
  const n = a.length - 1;
  if (n === 0) return [];
  const s = scaleOf(a);
  let z: Complex[] = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n + 0.4;
    return [s * Math.cos(angle), s * Math.sin(angle)];
  });
  for (let iteration = 0; iteration < 1000; iteration++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let denominator: Complex = [1, 0];
      z.forEach((zj, j) => {
        if (j !== i) denominator = mul(denominator, sub(zi, zj));
      });
      const step = divide(value(a, zi).p, denominator);
      moved = Math.max(moved, Math.hypot(...step));
      return sub(zi, step);
    });
    if (moved <= 1e-15 * s) break;
  }
  // Newton's method sharpens each root on the polynomial itself.
  return z.map((zi) => {
    let x = zi;
    for (let i = 0; i < 4; i++) {
      const { p, dp } = value(a, x);
      if (Math.hypot(...dp) === 0) break;
      x = sub(x, divide(p, dp));
    }
    return x;
  });
}

/** minimize(f(x), x: a .. b) and maximize: where in the interval f is smallest or largest. */
export function extremum(call: CallExpr, f: (si: number) => Quantity, low: Quantity, high: Quantity): Value {
  const sign = call.name === 'maximize' ? -1 : 1;
  const g = (x: number): number => {
    try {
      return sign * f(x).si;
    } catch (err) {
      // A point where f has no value is never the extreme.
      if (err instanceof CalcError && ['E-DOMAIN', 'E-DIV-ZERO', 'E-NOT-FINITE'].includes(err.diagnostic.code)) return Infinity;
      throw err;
    }
  };
  const [a, b] = low.si <= high.si ? [low.si, high.si] : [high.si, low.si];
  const steps = 400;
  let best = 0;
  let bestValue = Infinity;
  const points = Array.from({ length: steps + 1 }, (_, i) => a + ((b - a) * i) / steps);
  points.forEach((x, i) => {
    const v = g(x);
    if (v < bestValue) [best, bestValue] = [i, v];
  });
  if (!Number.isFinite(bestValue)) return fail('E-SOLVE-NO-ROOT', call.span);
  // Golden-section search between the neighbours of the best point.
  let lo = points[Math.max(0, best - 1)]!;
  let hi = points[Math.min(steps, best + 1)]!;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = hi - ratio * (hi - lo);
  let d = lo + ratio * (hi - lo);
  let gc = g(c);
  let gd = g(d);
  for (let i = 0; i < 200 && hi - lo > 1e-13 * Math.max(Math.abs(lo), Math.abs(hi), (b - a) * 1e-3); i++) {
    if (gc <= gd) {
      [hi, d, gd] = [d, c, gc];
      c = hi - ratio * (hi - lo);
      gc = g(c);
    } else {
      [lo, c, gc] = [c, d, gd];
      d = lo + ratio * (hi - lo);
      gd = g(d);
    }
  }
  const candidates = [points[best]!, (lo + hi) / 2];
  const x = candidates.reduce((p, q) => (g(q) < g(p) ? q : p));
  return quantity(x, low.dim, low.hint ? { hint: low.hint } : {});
}
