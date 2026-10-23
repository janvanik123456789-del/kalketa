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
  // The whole interval is scanned, so the global extreme is found, not the nearest one: 400 points when f is
  // cheap; when one value costs more (an integral up to x), as many as fit in about a second, at least 40.
  const started = performance.now();
  const first = [g(a), g(b), g((a + b) / 2)];
  const cost = (performance.now() - started) / 3;
  const steps = Math.max(40, Math.min(400, Math.floor(SCAN_BUDGET_MS / Math.max(cost, 1e-3))));
  const points = Array.from({ length: steps + 1 }, (_, i) => a + ((b - a) * i) / steps);
  const values = points.map((x, i) => (i === 0 ? first[0]! : i === steps ? first[1]! : 2 * i === steps ? first[2]! : g(x)));
  if (!values.some(Number.isFinite)) return fail('E-SOLVE-NO-ROOT', call.span);
  // The two lowest dips of the scan, each sharpened between its neighbours: a coarse scan may rank them wrongly.
  const dips = values
    .map((v, i) => ({ i, v }))
    .filter(({ i, v }) => Number.isFinite(v) && v <= (values[i - 1] ?? Infinity) && v <= (values[i + 1] ?? Infinity))
    .sort((p, q) => p.v - q.v)
    .slice(0, 2);
  let best = { x: points[dips[0]!.i]!, v: dips[0]!.v };
  for (const dip of dips) {
    // To 1e-8 of the interval: more than the digits shown, and no chase after noise of an f computed numerically.
    const sharp = brentMinimum(g, points[Math.max(0, dip.i - 1)]!, points[Math.min(steps, dip.i + 1)]!, 1e-8 * (b - a || Math.abs(a) || 1));
    if (sharp.v < best.v) best = sharp;
    if (dip.v < best.v) best = { x: points[dip.i]!, v: dip.v };
  }
  return quantity(best.x, low.dim, low.hint ? { hint: low.hint } : {});
}

/** How long the scan of minimize/maximize may take when f is expensive (milliseconds). */
const SCAN_BUDGET_MS = 1000;

/**
 * The minimum of g between lo and hi by Brent's method (parabolic steps, golden section where they fail):
 * far fewer values of g than the golden section alone.
 */
function brentMinimum(g: (x: number) => number, lo: number, hi: number, tol: number): { x: number; v: number } {
  const golden = 0.3819660112501051;
  let [a, b] = [lo, hi];
  let x = a + golden * (b - a);
  let w = x;
  let v = x;
  let fx = g(x);
  let fw = fx;
  let fv = fx;
  let d = 0;
  let e = 0;
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const tol1 = tol + 1e-12 * Math.abs(x);
    const tol2 = 2 * tol1;
    if (Math.abs(x - m) <= tol2 - (b - a) / 2) break;
    let parabolic = false;
    if (Math.abs(e) > tol1) {
      // A parabola through x, w and v.
      const r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw);
      let p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p;
      q = Math.abs(q);
      if (Math.abs(p) < Math.abs(0.5 * q * e) && p > q * (a - x) && p < q * (b - x)) {
        e = d;
        d = p / q;
        const u = x + d;
        if (u - a < tol2 || b - u < tol2) d = x < m ? tol1 : -tol1;
        parabolic = true;
      }
    }
    if (!parabolic) {
      e = (x < m ? b : a) - x;
      d = golden * e;
    }
    const u = Math.abs(d) >= tol1 ? x + d : x + (d > 0 ? tol1 : -tol1);
    const fu = g(u);
    if (fu <= fx) {
      if (u < x) b = x;
      else a = x;
      [v, fv, w, fw, x, fx] = [w, fw, x, fx, u, fu];
    } else {
      if (u < x) a = u;
      else b = u;
      if (fu <= fw || w === x) [v, fv, w, fw] = [w, fw, u, fu];
      else if (fu <= fv || v === x || v === w) [v, fv] = [u, fu];
    }
  }
  return { x, v: fx };
}
