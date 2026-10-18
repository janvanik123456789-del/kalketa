/**
 * Interpolation: a curve through every point of a series, as MATLAB and NumPy name it.
 *
 *   interp1(x, y, xi)                   straight lines between the points
 *   interp1(x, y, xi, "spline")         also "nearest", "pchip"; "extrap" after it goes beyond the points
 *   spline(x, y, xi)                    a cubic spline, not-a-knot at the ends (MATLAB, SciPy CubicSpline)
 *   pchip(x, y, xi)                     a cubic that keeps the shape: no swing past the points (Fritsch–Carlson)
 *
 * x is sorted on the way in; xi may be one number or a series. Beyond the points interp1
 * stops with an error unless "extrap" is given; spline and pchip go on, as in MATLAB.
 */

import { fail } from '../diagnostics.js';
import { sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import type { Args, FunctionDef } from './registry.js';

export const INTERPOLATION_METHODS = ['linear', 'nearest', 'spline', 'pchip'] as const;
type Method = (typeof INTERPOLATION_METHODS)[number];

/** The points sorted by x, distinct, and the slopes of a cubic between them (none for lines and the nearest point). */
interface Curve {
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly slopes?: readonly number[];
}

export const INTERPOLATION: readonly FunctionDef[] = [
  {
    name: 'interp1',
    module: 'series',
    params: 'x, y, xi, "linear" | "nearest" | "spline" | "pchip", "extrap"',
    arity: [3, 5],
    call: (a) => {
      const method = a.count > 3 ? text(a, 3) : 'linear';
      if (!(INTERPOLATION_METHODS as readonly string[]).includes(method)) fail('E-INTERP-METHOD', a.expr(3).span, { method, methods: INTERPOLATION_METHODS.join(', ') });
      if (a.count > 4 && text(a, 4) !== 'extrap') fail('E-INTERP-METHOD', a.expr(4).span, { method: text(a, 4), methods: 'extrap' });
      return interpolate(a, method as Method, a.count > 4);
    },
  },
  { name: 'spline', module: 'series', params: 'x, y, xi', arity: [3, 3], call: (a) => interpolate(a, 'spline', true) },
  { name: 'pchip', module: 'series', params: 'x, y, xi', arity: [3, 3], call: (a) => interpolate(a, 'pchip', true) },
];

function text(a: Args, index: number): string {
  const value = a.value(index);
  return value.type === 'text' ? value.value : fail('E-TYPE', a.expr(index).span, { expected: 'text', found: value.type === 'quantity' ? 'number' : value.type });
}

function interpolate(a: Args, method: Method, beyond: boolean): Value {
  const xs = a.series(0);
  const ys = a.series(1);
  if (xs.length !== ys.length || xs.length < 2) fail('E-INTERP-POINTS', a.call.span, { x: xs.length, y: ys.length });
  for (const [list, index] of [[xs, 0], [ys, 1]] as const) {
    const other = list.find((q) => !sameDim(q.dim, list[0]!.dim));
    if (other) fail('E-UNIT-MISMATCH', a.expr(index).span, { operator: ',', left: baseUnitSymbol(list[0]!.dim), right: baseUnitSymbol(other.dim) });
  }
  const order = xs.map((_, i) => i).sort((i, j) => xs[i]!.si - xs[j]!.si);
  const x = order.map((i) => xs[i]!.si);
  const y = order.map((i) => ys[i]!.si);
  if (x.some((v, i) => i > 0 && v === x[i - 1])) fail('E-INTERP-X', a.expr(0).span, {});
  const curve: Curve = { x, y, ...(method === 'spline' ? { slopes: splineSlopes(x, y) } : method === 'pchip' ? { slopes: pchipSlopes(x, y) } : {}) };
  const y0 = ys[0]!;
  const at = (q: Quantity): Quantity => {
    if (!sameDim(q.dim, xs[0]!.dim)) fail('E-UNIT-MISMATCH', a.expr(2).span, { operator: a.name, left: baseUnitSymbol(xs[0]!.dim), right: baseUnitSymbol(q.dim) });
    if (!beyond && (q.si < x[0]! || q.si > x[x.length - 1]!)) {
      fail('E-INTERP-RANGE', a.expr(2).span, { function: a.name });
    }
    return quantity(valueAt(curve, method, q.si), y0.dim, { ...(y0.hint ? { hint: y0.hint } : {}), ...(y0.absolute ? { absolute: true } : {}) });
  };
  const xi = a.value(2);
  if (xi.type === 'vector') return { type: 'vector', items: xi.items.map(at) };
  return at(a.quantity(2));
}

/** The segment of t: the last point at or before it, kept within the ends (beyond them the end segment goes on). */
function segment(x: readonly number[], t: number): number {
  let lo = 0;
  let hi = x.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (x[mid]! <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function valueAt(curve: Curve, method: Method, t: number): number {
  const { x, y, slopes } = curve;
  const i = segment(x, t);
  const h = x[i + 1]! - x[i]!;
  if (method === 'nearest') return t - x[i]! < x[i + 1]! - t ? y[i]! : y[i + 1]!;
  const m = (y[i + 1]! - y[i]!) / h;
  const u = t - x[i]!;
  if (!slopes) return y[i]! + m * u;
  // The cubic of the segment by its end values and slopes (Hermite).
  const [d0, d1] = [slopes[i]!, slopes[i + 1]!];
  const c2 = (3 * m - 2 * d0 - d1) / h;
  const c3 = (d0 + d1 - 2 * m) / (h * h);
  return y[i]! + u * (d0 + u * (c2 + u * c3));
}

/** Slopes of the cubic spline at the points, not-a-knot at the ends: the third derivative goes on across the second point and the last but one. */
function splineSlopes(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length;
  const dx = x.slice(1).map((v, i) => v - x[i]!);
  const m = dx.map((h, i) => (y[i + 1]! - y[i]!) / h);
  if (n === 2) return [m[0]!, m[0]!];
  if (n === 3) {
    // The parabola through the three points.
    const c = (m[1]! - m[0]!) / (x[2]! - x[0]!);
    return x.map((t) => m[0]! + c * (2 * t - x[0]! - x[1]!));
  }
  const lower = new Array<number>(n - 1).fill(0);
  const diag = new Array<number>(n).fill(0);
  const upper = new Array<number>(n - 1).fill(0);
  const rhs = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    lower[i - 1] = dx[i]!;
    diag[i] = 2 * (dx[i - 1]! + dx[i]!);
    upper[i] = dx[i - 1]!;
    rhs[i] = 3 * (dx[i]! * m[i - 1]! + dx[i - 1]! * m[i]!);
  }
  const first = x[2]! - x[0]!;
  diag[0] = dx[1]!;
  upper[0] = first;
  rhs[0] = ((dx[0]! + 2 * first) * dx[1]! * m[0]! + dx[0]! ** 2 * m[1]!) / first;
  const last = x[n - 1]! - x[n - 3]!;
  diag[n - 1] = dx[n - 3]!;
  lower[n - 2] = last;
  rhs[n - 1] = (dx[n - 2]! ** 2 * m[n - 3]! + (2 * last + dx[n - 2]!) * dx[n - 3]! * m[n - 2]!) / last;
  return tridiagonal(lower, diag, upper, rhs);
}

/** Slopes that keep the shape (SciPy PchipInterpolator): flat where the data turn, a weighted harmonic mean elsewhere. */
function pchipSlopes(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length;
  const h = x.slice(1).map((v, i) => v - x[i]!);
  const m = h.map((hk, i) => (y[i + 1]! - y[i]!) / hk);
  if (n === 2) return [m[0]!, m[0]!];
  const d = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    if (m[k - 1]! * m[k]! <= 0) continue;
    const w1 = 2 * h[k]! + h[k - 1]!;
    const w2 = h[k]! + 2 * h[k - 1]!;
    d[k] = (w1 + w2) / (w1 / m[k - 1]! + w2 / m[k]!);
  }
  const end = (h0: number, h1: number, m0: number, m1: number): number => {
    const slope = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(m0)) return 0;
    if (Math.sign(m0) !== Math.sign(m1) && Math.abs(slope) > Math.abs(3 * m0)) return 3 * m0;
    return slope;
  };
  d[0] = end(h[0]!, h[1]!, m[0]!, m[1]!);
  d[n - 1] = end(h[n - 2]!, h[n - 3]!, m[n - 2]!, m[n - 3]!);
  return d;
}

/** A tridiagonal system by elimination with row exchanges (LAPACK gtsv): the not-a-knot rows are not dominant. */
function tridiagonal(lower: number[], diag: number[], upper: number[], b: number[]): number[] {
  const n = diag.length;
  const fill = new Array<number>(Math.max(n - 2, 0)).fill(0);
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(diag[i]!) >= Math.abs(lower[i]!)) {
      const f = lower[i]! / diag[i]!;
      diag[i + 1]! -= f * upper[i]!;
      b[i + 1]! -= f * b[i]!;
    } else {
      const f = diag[i]! / lower[i]!;
      diag[i] = lower[i]!;
      const next = diag[i + 1]!;
      diag[i + 1] = upper[i]! - f * next;
      if (i < n - 2) {
        fill[i] = upper[i + 1]!;
        upper[i + 1] = -f * fill[i]!;
      }
      upper[i] = next;
      const bi = b[i]!;
      b[i] = b[i + 1]!;
      b[i + 1] = bi - f * b[i + 1]!;
    }
  }
  b[n - 1] = b[n - 1]! / diag[n - 1]!;
  if (n > 1) b[n - 2] = (b[n - 2]! - upper[n - 2]! * b[n - 1]!) / diag[n - 2]!;
  for (let i = n - 3; i >= 0; i--) b[i] = (b[i]! - upper[i]! * b[i + 1]! - fill[i]! * b[i + 2]!) / diag[i]!;
  return b;
}
