/**
 * The built-in modules of functions. Transcendental functions take plain
 * numbers (Calcpad does the same); angles are plain numbers in SI, so
 * sin(30°) works.
 */

import { rootHint } from '../units/compose.js';
import { squareRoot } from '../values/exact.js';
import { fail } from '../diagnostics.js';
import { dim, isDimensionless, powerDim, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { civilFromDays, dateValue, daysFromCivil, daysOf, isDate, isValidDay } from '../values/date.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asBoolean, asQuantity } from '../eval/coerce.js';
import { compare } from '../eval/evaluator.js';
import { withBareZero } from '../eval/zero.js';
import type { Expr } from '../lang/ast.js';
import type { Args, FunctionDef, FunctionModuleId } from './registry.js';
import { normalCdf, normalQuantile, studentCdf, studentQuantile } from './distributions.js';

/** A function of one plain number, with an optional domain; on a series it is taken item by item (exp(-t/τ) for the times t). */
function plain(name: string, module: FunctionModuleId, f: (x: number) => number, domain?: (x: number) => boolean): FunctionDef {
  return {
    name,
    module,
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      const value = a.value(0);
      const one = (q: Quantity): Quantity => {
        if (!isDimensionless(q.dim)) fail('E-FUNC-ARG-DIM', a.expr(0).span, { function: a.name, dim: baseUnitSymbol(q.dim) });
        if (domain && !domain(q.si)) a.domain(0);
        return quantity(f(q.si));
      };
      if (value.type === 'vector') return { type: 'vector', items: value.items.map(one) };
      return one(asQuantity(value, a.expr(0).span));
    },
  };
}

/** The first argument's unit kept on a result of the same dimension. */
const keepUnit = (q: Quantity | undefined) => (q?.hint ? { hint: q.hint } : {});
/** The unit of a value in the middle of a series, and whether it is an absolute temperature (the mean of 25 °C and 27 °C is 26 °C). */
const keepPlace = (items: readonly Quantity[]) => ({ ...keepUnit(items[0]), ...(items.length > 0 && items.every((q) => q.absolute) ? { absolute: true } : {}) });

// ---------------------------------------------------------------------------

export const MATH: readonly FunctionDef[] = [
  {
    name: 'sqrt',
    module: 'math',
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      const x = a.complex(0);
      if (x.im) {
        // Principal square root of a complex value.
        const r = Math.hypot(x.si, x.im);
        return quantity(Math.sqrt((r + x.si) / 2), powerDim(x.dim, 0.5), { im: Math.sign(x.im) * Math.sqrt((r - x.si) / 2) });
      }
      // A real negative number has no real root: an error, as usual in a calculation.
      if (x.si < 0) a.domain(0);
      // √mm² = mm: the root of the unit, where it is one.
      const hint = rootHint(x.hint, 2);
      // √169 = 13, √(1/2) = √2/2: the exact form where the value has one.
      const exact = x.exact && !x.absolute ? squareRoot(x.exact) : undefined;
      return quantity(Math.sqrt(x.si), powerDim(x.dim, 0.5), { ...(hint ? { hint } : {}), ...(exact ? { exact } : {}) });
    },
  },
  {
    name: 'cbrt',
    module: 'math',
    params: 'x',
    arity: [1, 1],
    // Also ∛x. A negative number has a real cube root: ∛(−8) = −2.
    call: (a) => {
      const x = a.quantity(0);
      const hint = rootHint(x.hint, 3);
      return quantity(Math.cbrt(x.si), powerDim(x.dim, 1 / 3), hint ? { hint } : {});
    },
  },
  {
    name: 'root',
    module: 'math',
    params: 'x, n',
    arity: [2, 2],
    call: (a) => {
      const n = a.number(1);
      if (!Number.isInteger(n) || n < 2) a.domain(1);
      const x = a.quantity(0);
      // An odd root of a negative number is real; an even one is not.
      if (x.si < 0 && n % 2 === 0) a.domain(0);
      const value = n === 3 ? Math.cbrt(x.si) : Math.sign(x.si) * Math.abs(x.si) ** (1 / n);
      return quantity(value, powerDim(x.dim, 1 / n));
    },
  },
  {
    name: 'abs',
    module: 'math',
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      // Magnitude; of a complex value |a + bj| = √(a² + b²).
      const { im, ...x } = a.complex(0);
      return { ...x, si: Math.hypot(x.si, im ?? 0) };
    },
  },
  {
    name: 'min',
    module: 'math',
    params: 'a, b, …',
    arity: [1, Infinity],
    call: (a) => extreme(a, (x, y) => y.si < x.si),
  },
  {
    name: 'max',
    module: 'math',
    params: 'a, b, …',
    arity: [1, Infinity],
    call: (a) => extreme(a, (x, y) => y.si > x.si),
  },
  {
    name: 'hypot',
    module: 'math',
    params: 'a, b, …',
    arity: [2, Infinity],
    call: (a) => {
      const values = a.sameDimension();
      return quantity(Math.hypot(...values.map((q) => q.si)), values[0]!.dim, keepUnit(values[0]));
    },
  },
  {
    // Resistances or impedances in parallel, written R_1 ∥ R_2: 1/(1/R_1 + 1/R_2).
    name: 'parallel',
    module: 'math',
    params: 'a, b, …',
    arity: [2, Infinity],
    call: (a) => {
      const values = Array.from({ length: a.count }, (_, i) => a.complex(i));
      values.forEach((q, i) => {
        if (!sameDim(q.dim, values[0]!.dim)) fail('E-UNIT-MISMATCH', a.expr(i).span, { operator: '∥', left: baseUnitSymbol(values[0]!.dim), right: baseUnitSymbol(q.dim) });
        if (q.si === 0 && !q.im) a.domain(i);
      });
      // The sum of the reciprocals, complex: 1/(x + jy) = (x − jy)/(x² + y²).
      let re = 0;
      let im = 0;
      for (const q of values) {
        const size = q.si * q.si + (q.im ?? 0) * (q.im ?? 0);
        re += q.si / size;
        im -= (q.im ?? 0) / size;
      }
      const size = re * re + im * im;
      if (size === 0) a.domain();
      return quantity(re / size, values[0]!.dim, { ...keepUnit(values[0]), im: -im / size });
    },
  },
  {
    name: 'mod',
    module: 'math',
    params: 'a, b',
    arity: [2, 2],
    call: (a) => {
      // The remainder with the sign of b: mod(-1, 3) = 2.
      const [x, y] = a.sameDimension();
      if (y!.si === 0) a.domain(1);
      return quantity(x!.si - y!.si * Math.floor(x!.si / y!.si), x!.dim, keepUnit(x));
    },
  },
  {
    name: 'sign',
    module: 'math',
    params: 'x',
    arity: [1, 1],
    call: (a) => quantity(Math.sign(a.quantity(0).si)),
  },
  plain('floor', 'math', Math.floor),
  plain('ceil', 'math', Math.ceil),
  {
    name: 'round',
    module: 'math',
    params: 'x, n',
    arity: [1, 2],
    call: (a) => {
      // round(x) to a whole number, round(x, n) to n decimals.
      const x = a.number(0);
      const n = a.count > 1 ? a.number(1) : 0;
      if (!Number.isInteger(n) || n < 0 || n > 15) a.domain(1);
      const scale = 10 ** n;
      return quantity(Math.round(x * scale) / scale);
    },
  },
  plain('exp', 'math', Math.exp),
  plain('ln', 'math', Math.log, (x) => x > 0),
  plain('log10', 'math', Math.log10, (x) => x > 0),
  {
    name: 'log',
    module: 'math',
    params: 'x, b',
    arity: [2, 2],
    call: (a) => {
      // Logarithm to base b.
      const x = a.number(0);
      const b = a.number(1);
      if (!(x > 0)) a.domain(0);
      if (!(b > 0) || b === 1) a.domain(1);
      return quantity(Math.log(x) / Math.log(b));
    },
  },
  {
    name: 'factorial',
    module: 'math',
    params: 'n',
    arity: [1, 1],
    call: (a) => {
      const n = a.number(0);
      if (!Number.isInteger(n) || n < 0 || n > 170) a.domain(0);
      let result = 1;
      for (let i = 2; i <= n; i++) result *= i;
      return quantity(result);
    },
  },
];

function extreme(a: Args, better: (best: Quantity, other: Quantity) => boolean): Quantity {
  // min(a, b, c) or min(series).
  const single = a.count === 1 ? a.value(0) : undefined;
  const values = single?.type === 'vector' ? single.items : a.sameDimension();
  if (values.length === 0) fail('E-FUNC-ARITY', a.call.span, { function: a.name, expected: '1+', found: 0 });
  return values.reduce((best, q) => (better(best, q) ? q : best));
}

// ---------------------------------------------------------------------------

export const TRIG: readonly FunctionDef[] = [
  plain('sin', 'trig', Math.sin),
  plain('cos', 'trig', Math.cos),
  plain('tan', 'trig', Math.tan),
  // As Czech and other books write them: tg α, cotg α.
  plain('tg', 'trig', Math.tan),
  plain('cot', 'trig', (x) => 1 / Math.tan(x)),
  plain('cotg', 'trig', (x) => 1 / Math.tan(x)),
  plain('asin', 'trig', Math.asin, (x) => x >= -1 && x <= 1),
  plain('acos', 'trig', Math.acos, (x) => x >= -1 && x <= 1),
  plain('atan', 'trig', Math.atan),
  {
    name: 'atan2',
    module: 'trig',
    params: 'y, x',
    arity: [2, 2],
    call: (a) => {
      const [y, x] = a.sameDimension();
      return quantity(Math.atan2(y!.si, x!.si));
    },
  },
  plain('sinh', 'trig', Math.sinh),
  plain('cosh', 'trig', Math.cosh),
  plain('tanh', 'trig', Math.tanh),
  plain('asinh', 'trig', Math.asinh),
  plain('acosh', 'trig', Math.acosh, (x) => x >= 1),
  plain('atanh', 'trig', Math.atanh, (x) => x > -1 && x < 1),
];

// ---------------------------------------------------------------------------

export const COMPLEX: readonly FunctionDef[] = [
  { name: 're', module: 'complex', params: 'z', arity: [1, 1], call: (a) => withoutIm(a.complex(0)) },
  {
    name: 'im',
    module: 'complex',
    params: 'z',
    arity: [1, 1],
    call: (a) => {
      const z = a.complex(0);
      return { ...withoutIm(z), si: z.im ?? 0 };
    },
  },
  {
    name: 'conj',
    module: 'complex',
    params: 'z',
    arity: [1, 1],
    call: (a) => {
      const z = a.complex(0);
      return z.im ? { ...z, im: -z.im } : z;
    },
  },
  {
    name: 'arg',
    module: 'complex',
    params: 'z',
    arity: [1, 1],
    call: (a) => {
      const z = a.complex(0);
      return quantity(Math.atan2(z.im ?? 0, z.si));
    },
  },
  {
    name: 'polar',
    module: 'complex',
    params: 'r, φ',
    arity: [2, 2],
    call: (a) => {
      // polar(230 V, 30°): magnitude and angle.
      const r = a.quantity(0);
      const phi = a.number(1);
      return quantity(r.si * Math.cos(phi), r.dim, { im: r.si * Math.sin(phi), ...keepUnit(r) });
    },
  },
];

function withoutIm(q: Quantity): Quantity {
  const { im: _im, ...rest } = q;
  return rest;
}

// ---------------------------------------------------------------------------

const MAX_RANGE = 10_000;

export const SERIES: readonly FunctionDef[] = [
  {
    name: 'range',
    module: 'series',
    params: 'from, to, step',
    arity: [2, 3],
    call: (a) => {
      // range(1, 25) or range(0 m, 10 m, 0.5 m): from, to (included), step.
      const [from, to] = a.sameDimension(0, 2);
      const step = a.count > 2 ? a.quantity(2) : quantity(from!.hint && !isDimensionless(from!.dim) ? from!.hint.factor : 1, from!.dim);
      if (!sameDim(step.dim, from!.dim)) fail('E-UNIT-MISMATCH', a.expr(2).span, { operator: a.name, left: baseUnitSymbol(from!.dim), right: baseUnitSymbol(step.dim) });
      if (!(step.si > 0)) a.domain(a.count > 2 ? 2 : undefined);
      const count = Math.floor((to!.si - from!.si) / step.si + 1e-9) + 1;
      if (count > MAX_RANGE) fail('E-RANGE-SIZE', a.call.span);
      const items = Array.from({ length: Math.max(0, count) }, (_, i) => quantity(from!.si + i * step.si, from!.dim, keepUnit(from)));
      return { type: 'vector', items };
    },
  },
  {
    name: 'sum',
    module: 'series',
    // Also sum(f(k), k: a .. b), evaluated by eval/calculus.ts.
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      return quantity(
        items.reduce((s, q) => s + q.si, 0),
        items[0]?.dim,
        keepUnit(items[0]),
      );
    },
  },
  { name: 'len', module: 'series', params: 'v', arity: [1, 1], call: (a) => quantity(a.series(0).length) },
  {
    name: 'cumsum',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      let running = 0;
      return { type: 'vector', items: a.series(0).map((q) => ({ ...q, si: (running += q.si) })) };
    },
  },
];

// ---------------------------------------------------------------------------

export const STATISTICS: readonly FunctionDef[] = [
  {
    name: 'mean',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      if (items.length === 0) a.domain();
      return quantity(items.reduce((s, q) => s + q.si, 0) / items.length, items[0]!.dim, keepPlace(items));
    },
  },
  {
    name: 'median',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      if (items.length === 0) a.domain();
      const sorted = items.map((q) => q.si).sort((x, y) => x - y);
      const mid = Math.floor(sorted.length / 2);
      const value = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      return quantity(value, items[0]!.dim, keepPlace(items));
    },
  },
  {
    name: 'stdev',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      // Sample standard deviation (n − 1), as for measured data.
      const items = a.series(0);
      if (items.length < 2) a.domain();
      const mean = items.reduce((s, q) => s + q.si, 0) / items.length;
      const variance = items.reduce((s, q) => s + (q.si - mean) ** 2, 0) / (items.length - 1);
      return quantity(Math.sqrt(variance), items[0]!.dim, keepUnit(items[0]));
    },
  },
  {
    // P(X ≤ x) of the standard normal distribution.
    name: 'normcdf',
    module: 'statistics',
    params: 'x',
    arity: [1, 1],
    call: (a) => quantity(normalCdf(a.number(0))),
  },
  {
    // The p-quantile of the standard normal distribution: norminv(0.975) = 1.960.
    name: 'norminv',
    module: 'statistics',
    params: 'p',
    arity: [1, 1],
    call: (a) => {
      const p = a.number(0);
      if (!(p > 0 && p < 1)) a.domain(0);
      return quantity(normalQuantile(p));
    },
  },
  {
    // P(T ≤ t) of Student's t distribution with ν degrees of freedom.
    name: 'tcdf',
    module: 'statistics',
    params: 't, ν',
    arity: [2, 2],
    call: (a) => {
      const nu = a.number(1);
      if (!(nu > 0)) a.domain(1);
      return quantity(studentCdf(a.number(0), nu));
    },
  },
  {
    // The p-quantile of Student's t: the coverage factor for 95 % and 21 degrees of freedom, tinv(0.975, 21) = 2.080.
    name: 'tinv',
    module: 'statistics',
    params: 'p, ν',
    arity: [2, 2],
    call: (a) => {
      const p = a.number(0);
      const nu = a.number(1);
      if (!(p > 0 && p < 1)) a.domain(0);
      if (!(nu > 0)) a.domain(1);
      return quantity(studentQuantile(p, nu));
    },
  },
  {
    // The number of ways to choose k of n: nchoosek(8, 3) = 56.
    name: 'nchoosek',
    module: 'statistics',
    params: 'n, k',
    arity: [2, 2],
    call: (a) => {
      const n = wholeNumber(a, 0);
      const k = wholeNumber(a, 1);
      if (k > n) a.domain(1);
      return quantity(choose(n, k));
    },
  },
  {
    // P(X = k) of the binomial distribution Bi(n; p).
    name: 'binopdf',
    module: 'statistics',
    params: 'k, n, p',
    arity: [3, 3],
    call: (a) => {
      const [k, n, p] = binomialArgs(a);
      return quantity(k > n ? 0 : choose(n, k) * p ** k * (1 - p) ** (n - k));
    },
  },
  {
    // P(X ≤ k) of the binomial distribution Bi(n; p).
    name: 'binocdf',
    module: 'statistics',
    params: 'k, n, p',
    arity: [3, 3],
    call: (a) => {
      const [k, n, p] = binomialArgs(a);
      let sum = 0;
      for (let i = 0; i <= Math.min(k, n); i++) sum += choose(n, i) * p ** i * (1 - p) ** (n - i);
      return quantity(Math.min(1, sum));
    },
  },
  {
    // P(X = k) of the Poisson distribution Po(λ).
    name: 'poisspdf',
    module: 'statistics',
    params: 'k, λ',
    arity: [2, 2],
    call: (a) => {
      const k = wholeNumber(a, 0);
      const lambda = a.number(1);
      if (!(lambda >= 0)) a.domain(1);
      return quantity(poisson(k, lambda));
    },
  },
  {
    // P(X ≤ k) of the Poisson distribution Po(λ).
    name: 'poisscdf',
    module: 'statistics',
    params: 'k, λ',
    arity: [2, 2],
    call: (a) => {
      const k = wholeNumber(a, 0);
      const lambda = a.number(1);
      if (!(lambda >= 0)) a.domain(1);
      let sum = 0;
      for (let i = 0; i <= k; i++) sum += poisson(i, lambda);
      return quantity(Math.min(1, sum));
    },
  },
];

/** A whole number 0 or more as argument `index` (a count: k, n). */
function wholeNumber(a: Args, index: number): number {
  const n = a.number(index);
  if (!Number.isInteger(n) || n < 0 || n > 1e9) a.domain(index);
  return n;
}

/** n over k, exactly while it fits (products of small fractions, no factorials that overflow). */
function choose(n: number, k: number): number {
  const m = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= m; i++) result = (result * (n - m + i)) / i;
  return result > 2 ** 53 ? result : Math.round(result);
}

/** k, n and p of a binomial distribution: counts and a probability from 0 to 1. */
function binomialArgs(a: Args): [number, number, number] {
  const k = wholeNumber(a, 0);
  const n = wholeNumber(a, 1);
  const p = a.number(2);
  if (!(p >= 0 && p <= 1)) a.domain(2);
  return [k, n, p];
}

/** λ^k·e^(−λ)/k!, through logarithms so a large k does not overflow. */
function poisson(k: number, lambda: number): number {
  if (lambda === 0) return k === 0 ? 1 : 0;
  let logFactorial = 0;
  for (let i = 2; i <= k; i++) logFactorial += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial);
}

// ---------------------------------------------------------------------------

export const FINANCE: readonly FunctionDef[] = [
  {
    name: 'npv',
    module: 'finance',
    params: 'rate, CF',
    arity: [2, 2],
    call: (a) => {
      // Net present value; the first cash flow is now (t = 0), the next ones at the end of each period.
      const rate = a.number(0);
      const flows = a.series(1);
      return quantity(presentValue(rate, flows), flows[0]?.dim, keepUnit(flows[0]));
    },
  },
  {
    name: 'irr',
    module: 'finance',
    params: 'CF',
    arity: [1, 1],
    call: (a) => quantity(internalRate(a.series(0), a)),
  },
  {
    name: 'pmt',
    module: 'finance',
    params: 'rate, n, amount',
    arity: [3, 3],
    call: (a) => {
      // Payment of an annuity.
      const rate = a.number(0);
      const n = a.number(1);
      const amount = a.quantity(2);
      const payment = rate === 0 ? amount.si / n : (amount.si * rate) / (1 - (1 + rate) ** -n);
      return quantity(payment, amount.dim, keepUnit(amount));
    },
  },
  {
    name: 'payback',
    module: 'finance',
    params: 'CF',
    arity: [1, 1],
    call: (a) => {
      // Periods until the cumulative cash flow reaches zero, between periods linearly.
      const flows = a.series(0);
      let cumulative = flows[0]?.si ?? 0;
      if (cumulative >= 0) return quantity(0);
      for (let k = 1; k < flows.length; k++) {
        const flow = flows[k]!.si;
        if (cumulative + flow >= 0) return quantity(k - 1 + -cumulative / flow);
        cumulative += flow;
      }
      return fail('E-NO-PAYBACK', a.call.span);
    },
  },
];

function presentValue(rate: number, flows: readonly Quantity[]): number {
  return flows.reduce((sum, q, t) => sum + q.si / (1 + rate) ** t, 0);
}

/** The rate with zero net present value: the sign change nearest to 0 %, then bisection. */
function internalRate(flows: readonly Quantity[], a: Args): number {
  const f = (r: number) => presentValue(r, flows);
  const grid = [0, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1, 2, 5, 10];
  const down = [-0.01, -0.05, -0.1, -0.2, -0.3, -0.5, -0.7, -0.9, -0.99];
  const find = (points: number[]): [number, number] | undefined => {
    for (let i = 1; i < points.length; i++) if (f(points[i - 1]!) * f(points[i]!) <= 0) return [points[i - 1]!, points[i]!];
    return undefined;
  };
  const bracket = find(grid) ?? find([0, ...down]);
  if (!bracket) return fail('E-SOLVE-NO-ROOT', a.call.span);
  let [lo, hi] = bracket;
  let flo = f(lo);
  for (let i = 0; i < 200 && Math.abs(hi - lo) > 1e-15 * Math.max(1, Math.abs(lo)); i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (flo * fm < 0) hi = m;
    else [lo, flo] = [m, fm];
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------

export const DATES: readonly FunctionDef[] = [
  {
    name: 'date',
    module: 'dates',
    params: 'year, month, day',
    arity: [3, 3],
    call: (a) => {
      const [y, m, d] = [a.number(0), a.number(1), a.number(2)];
      if (![y, m, d].every((v) => Number.isInteger(v)) || !isValidDay(y, m, d)) fail('E-DATE-INVALID', a.call.span, { value: `${y}-${m}-${d}` });
      return dateValue(daysFromCivil(y, m, d));
    },
  },
  ...(['year', 'month', 'day'] as const).map(
    (part): FunctionDef => ({
      name: part,
      module: 'dates',
      params: 'date',
      arity: [1, 1],
      call: (a) => {
        const q = a.quantity(0);
        if (!isDate(q)) fail('E-TYPE', a.expr(0).span, { expected: 'date', found: 'number' });
        const civil = civilFromDays(daysOf(q));
        return quantity(civil[part]);
      },
    }),
  ),
  {
    // Days between two dates as banks count them: months of 30 days, the year of 360 (DAYS360 of Excel, days360 of MATLAB).
    name: 'days360',
    module: 'dates',
    params: 'start, end, basis',
    arity: [2, 3],
    call: (a) => {
      const [start, end] = [0, 1].map((i) => {
        const q = a.quantity(i);
        if (!isDate(q)) fail('E-TYPE', a.expr(i).span, { expected: 'date', found: 'number' });
        return civilFromDays(daysOf(q));
      }) as [ReturnType<typeof civilFromDays>, ReturnType<typeof civilFromDays>];
      const basisValue = a.count > 2 ? a.value(2) : undefined;
      if (basisValue && basisValue.type !== 'text') fail('E-TYPE', a.expr(2).span, { expected: 'text', found: basisValue.type === 'quantity' ? 'number' : basisValue.type });
      const basis = basisValue?.type === 'text' ? basisValue.value.replace(/\s+/g, '').toUpperCase() : '30E/360';
      if (basis !== '30E/360' && basis !== '30A/360') fail('E-DAY-BASIS', a.expr(2).span, { basis: basisValue?.type === 'text' ? basisValue.value : '', bases: '30E/360, 30A/360' });
      // 30E/360 (European, as Czech banks and textbooks): a 31st counts as the 30th, at both ends.
      // 30A/360 (American, bond basis): the end's 31st counts as the 30th only where the start is the 30th or 31st.
      const d1 = Math.min(start.day, 30);
      const d2 = basis === '30E/360' || d1 === 30 ? Math.min(end.day, 30) : end.day;
      const days = 360 * (end.year - start.year) + 30 * (end.month - start.month) + d2 - d1;
      return quantity(days * 86_400, dim({ T: 1 }), { hint: { symbol: 'd', factor: 86_400, dim: dim({ T: 1 }) } });
    },
  },
];

// ---------------------------------------------------------------------------

export const LOGIC: readonly FunctionDef[] = [
  {
    name: 'if',
    module: 'logic',
    params: 'condition, then, else',
    arity: [3, 3],
    call: (a) => {
      const condition = conditionOf(a, a.expr(0));
      // Only the chosen branch is evaluated.
      if (typeof condition === 'boolean') return condition ? a.value(1) : a.value(2);
      // A condition over a series (x > 0 m for a series x): item by item, each from its own branch.
      const [then, otherwise] = [a.value(1), a.value(2)];
      const item = (v: Value, i: number, index: number): Quantity => {
        if (v.type !== 'vector') return asQuantity(v, a.expr(index).span);
        if (v.items.length !== condition.length) fail('E-VECTOR-LENGTH', a.expr(index).span, { left: condition.length, right: v.items.length });
        return v.items[i]!;
      };
      const items = condition.map((holds, i) => (holds ? item(then, i, 1) : item(otherwise, i, 2)));
      if (items.some((q) => !sameDim(q.dim, items[0]!.dim))) fail('E-UNIT-MISMATCH', a.call.span, { operator: 'if', left: baseUnitSymbol(items[0]!.dim), right: baseUnitSymbol(items.find((q) => !sameDim(q.dim, items[0]!.dim))!.dim) });
      return { type: 'vector', items };
    },
  },
];

/**
 * The condition of if(): one truth value, or one per item where a series is compared (x > 0 m, a < b and
 * b < c, not …). A comparison of plain numbers stays as it was.
 */
function conditionOf(a: Args, expr: Expr): boolean | boolean[] {
  if (expr.kind === 'unary' && expr.operator === 'not') {
    const inner = conditionOf(a, expr.operand);
    return typeof inner === 'boolean' ? !inner : inner.map((x) => !x);
  }
  if (expr.kind === 'binary' && (expr.operator === 'and' || expr.operator === 'or')) {
    const left = conditionOf(a, expr.left);
    // Short-circuit as before, unless a series is in play.
    if (typeof left === 'boolean' && (expr.operator === 'and' ? !left : left)) return left;
    const right = conditionOf(a, expr.right);
    if (typeof left === 'boolean' && typeof right === 'boolean') return expr.operator === 'and' ? left && right : left || right;
    const n = typeof left === 'boolean' ? (right as boolean[]).length : left.length;
    if (typeof right !== 'boolean' && right.length !== n) fail('E-VECTOR-LENGTH', expr.span, { left: n, right: right.length });
    const at = (c: boolean | boolean[], i: number) => (typeof c === 'boolean' ? c : c[i]!);
    return Array.from({ length: n }, (_, i) => (expr.operator === 'and' ? at(left, i) && at(right, i) : at(left, i) || at(right, i)));
  }
  if (expr.kind === 'binary' && COMPARISONS.has(expr.operator)) {
    const [left, right] = [a.evaluate(expr.left), a.evaluate(expr.right)];
    if (left.type === 'vector' || right.type === 'vector') {
      const n = left.type === 'vector' ? left.items.length : (right as Extract<Value, { type: 'vector' }>).items.length;
      if (left.type === 'vector' && right.type === 'vector' && right.items.length !== n) fail('E-VECTOR-LENGTH', expr.span, { left: n, right: right.items.length });
      const at = (v: Value, side: Expr, i: number) => (v.type === 'vector' ? v.items[i]! : asQuantity(v, side.span));
      return Array.from({ length: n }, (_, i) => {
        const [p, q] = withBareZero(at(left, expr.left, i), at(right, expr.right, i), expr.left, expr.right);
        return asBoolean(compare(expr.operator, p, q, expr.span), expr.span);
      });
    }
  }
  return asBoolean(a.evaluate(expr), expr.span);
}

const COMPARISONS: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>=']);

/** Functions with a variable of their own: evaluated by eval/calculus.ts (sum is listed with series). */
export const CALCULUS: readonly FunctionDef[] = [
  { name: 'integral', module: 'calculus', params: 'f(x), x: a .. b', arity: [1, 1] },
  { name: 'derivative', module: 'calculus', params: 'f(x), x: a, order: 1', arity: [1, 1] },
  { name: 'roots', module: 'calculus', params: 'p(x), x', arity: [2, 2] },
  { name: 'fit', module: 'calculus', params: 'y, x: series, kind: "linear"', arity: [1, 1] },
  { name: 'polyfit', module: 'calculus', params: 'x, y, n, steps: false', arity: [3, 3] },
  { name: 'polyval', module: 'calculus', params: 'p, x', arity: [2, 2] },
  { name: 'minimize', module: 'calculus', params: 'f(x), x: a .. b', arity: [1, 1] },
  { name: 'maximize', module: 'calculus', params: 'f(x), x: a .. b', arity: [1, 1] },
];

/** Charts: a line of its own, sampled by the session (eval/plot.ts). */
export const CHARTS: readonly FunctionDef[] = [{ name: 'plot', module: 'charts', params: 'f(x), x: a .. b, kind: "line", title: "…"', arity: [1, 8] }];

/** Table functions: evaluated by the table code (they read named arguments and rows). */
export const TABLES: readonly FunctionDef[] = [
  { name: 'pick', module: 'tables', params: 'T, "key"', arity: [1, 2] },
  { name: 'interpolate', module: 'tables', params: 'T, column: x', arity: [1, 1] },
  { name: 'find_min', module: 'tables', params: 'T, by: column, where: condition', arity: [1, 1] },
  { name: 'find_max', module: 'tables', params: 'T, by: column, where: condition', arity: [1, 1] },
  { name: 'filter', module: 'tables', params: 'T, where: condition', arity: [1, 1] },
  // Calculated by the session: the sheet again for each variant (graph/session.ts).
  { name: 'compare', module: 'tables', params: 'Variants, name, …', arity: [2, 32] },
];
