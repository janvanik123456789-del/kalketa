/**
 * Special functions, distributions with their parameters, and random numbers that repeat by a seed. Values against SciPy
 * in tests/data/special.json.
 */

import { fail } from '../diagnostics.js';
import { divideDims, isDimensionless, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type Quantity } from '../values/value.js';
import { chiSquareCdf, normalCdf, normalQuantile } from './distributions.js';
import type { Args, FunctionDef } from './registry.js';

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let sum = LANCZOS[0]!;
  for (let i = 1; i < 9; i++) sum += LANCZOS[i]! / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

function gamma(x: number): number {
  if (Number.isInteger(x) && x > 0 && x < 171) {
    let f = 1;
    for (let i = 2; i < x; i++) f *= i;
    return f;
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  return Math.exp(logGamma(x));
}

/** The regularized lower incomplete gamma P(a, x), and 1 − P: series below a + 1, a continued fraction above. */
function incompleteGamma(a: number, x: number): { p: number; q: number } {
  if (x <= 0) return { p: 0, q: 1 };
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let [term, sum] = [1 / a, 1 / a];
    for (let n = 1; n < 2000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
    }
    const p = sum * front;
    return { p, q: 1 - p };
  }
  // Lentz.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 2000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  const q = front * h;
  return { p: 1 - q, q };
}

const erf = (x: number): number => (x === 0 ? 0 : Math.sign(x) * incompleteGamma(0.5, x * x).p);
const erfc = (x: number): number => (x >= 0 ? incompleteGamma(0.5, x * x).q : 1 + incompleteGamma(0.5, x * x).p);

/** J_n(x) from its integral over a period: the trapezoids converge faster than any power there. */
function besselJ(n: number, x: number): number {
  const steps = Math.max(256, Math.ceil(4 * (Math.abs(x) + Math.abs(n))) + 64);
  let sum = 0;
  for (let k = 0; k < steps; k++) {
    const t = ((k + 0.5) / steps) * Math.PI;
    sum += Math.cos(n * t - x * Math.sin(t));
  }
  return sum / steps;
}

const logChoose = (n: number, k: number) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

function hypergeometric(x: number, population: number, successes: number, draws: number): number {
  if (x < Math.max(0, draws - (population - successes)) || x > Math.min(draws, successes)) return 0;
  return Math.exp(logChoose(successes, x) + logChoose(population - successes, draws - x) - logChoose(population, draws));
}

const wholeNumber = (a: Args, i: number): number => {
  const v = a.number(i);
  if (!Number.isInteger(v) || v < 0) a.domain(i);
  return v;
};

function one(name: string, f: (x: number) => number, domain?: (x: number) => boolean): FunctionDef {
  return {
    name,
    module: 'statistics',
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      const x = a.number(0);
      if (domain && !domain(x)) a.domain(0);
      return quantity(f(x));
    },
  };
}

/** x with the location and scale of a distribution, of one unit: (x − μ)/σ and the 1/σ of a density. */
function standardized(a: Args, name: string): { z: number; sigma: Quantity | undefined } {
  const x = a.quantity(0);
  if (a.count === 1) {
    if (!isDimensionless(x.dim)) fail('E-FUNC-ARG-DIM', a.expr(0).span, { function: name, dim: baseUnitSymbol(x.dim) });
    return { z: x.si, sigma: undefined };
  }
  const [mu, sigma] = [a.quantity(1), a.quantity(2)];
  if (!sameDim(x.dim, mu.dim) || !sameDim(x.dim, sigma.dim)) fail('E-UNIT-MISMATCH', a.call.span, { operator: name, left: baseUnitSymbol(x.dim), right: baseUnitSymbol(sameDim(x.dim, mu.dim) ? sigma.dim : mu.dim) });
  if (!(sigma.si > 0)) a.domain(2);
  return { z: (x.si - mu.si) / sigma.si, sigma };
}

/** The positive parts of a distribution of a positive quantity: x, then its scale in the same unit. */
function positive(a: Args, scaleAt: number): { t: number; scale: number; dim: Quantity['dim'] } {
  const x = a.quantity(0);
  const scale = a.quantity(scaleAt);
  if (!sameDim(x.dim, scale.dim)) fail('E-UNIT-MISMATCH', a.call.span, { operator: a.name, left: baseUnitSymbol(x.dim), right: baseUnitSymbol(scale.dim) });
  if (!(scale.si > 0)) a.domain(scaleAt);
  return { t: x.si / scale.si, scale: scale.si, dim: divideDims(quantity(1).dim, x.dim) };
}

/** A generator of mulberry32: the same seed gives the same numbers, here and on any other computer. */
function generator(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_RANDOM = 1_000_000;

function countAndSeed(a: Args): { count: number; next: () => number } {
  const count = a.number(0);
  const seed = a.number(1);
  if (!Number.isInteger(count) || count < 1 || count > MAX_RANDOM) a.domain(0);
  if (!Number.isInteger(seed)) a.domain(1);
  return { count, next: generator(seed) };
}

function classes(a: Args): { low: number; width: number; n: number; items: readonly Quantity[] } {
  const items = a.series(0);
  if (items.length === 0) a.domain(0);
  const other = items.find((q) => !sameDim(q.dim, items[0]!.dim));
  if (other) fail('E-UNIT-MISMATCH', a.expr(0).span, { operator: a.name, left: baseUnitSymbol(items[0]!.dim), right: baseUnitSymbol(other.dim) });
  const n = a.number(1);
  if (!Number.isInteger(n) || n < 1 || n > 10000) a.domain(1);
  const values = items.map((q) => q.si);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return { low, width: (high - low) / n || 1, n, items };
}

export const SPECIAL: readonly FunctionDef[] = [
  {
    name: 'hist_counts',
    module: 'statistics',
    params: 'v, n',
    arity: [2, 2],
    call: (a) => {
      const { low, width, n, items } = classes(a);
      const counts = new Array<number>(n).fill(0);
      // The greatest item goes in the last class.
      for (const q of items) counts[Math.min(n - 1, Math.floor((q.si - low) / width))]!++;
      return { type: 'vector', items: counts.map((c) => quantity(c)) };
    },
  },
  {
    name: 'hist_centers',
    module: 'statistics',
    params: 'v, n',
    arity: [2, 2],
    call: (a) => {
      const { low, width, n, items } = classes(a);
      const first = items[0]!;
      return { type: 'vector', items: Array.from({ length: n }, (_, i) => quantity(low + (i + 0.5) * width, first.dim, first.hint ? { hint: first.hint } : {})) };
    },
  },
  {
    name: 'box_values',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      if (items.length === 0) a.domain(0);
      const sorted = items.map((q) => q.si).sort((x, y) => x - y);
      const at = (p: number) => {
        const place = p * (sorted.length - 1);
        const below = Math.floor(place);
        return sorted[below]! + (place - below) * ((sorted[below + 1] ?? sorted[below]!) - sorted[below]!);
      };
      const first = items[0]!;
      return { type: 'vector', items: [0, 0.25, 0.5, 0.75, 1].map((p) => quantity(at(p), first.dim, first.hint ? { hint: first.hint } : {})) };
    },
  },
  one('gamma', gamma, (x) => !(Number.isInteger(x) && x <= 0)),
  one('lgamma', logGamma, (x) => x > 0),
  one('erf', erf),
  one('erfc', erfc),
  {
    name: 'beta',
    module: 'statistics',
    params: 'a, b',
    arity: [2, 2],
    call: (a) => {
      const [p, q] = [a.number(0), a.number(1)];
      if (!(p > 0)) a.domain(0);
      if (!(q > 0)) a.domain(1);
      return quantity(Math.exp(logGamma(p) + logGamma(q) - logGamma(p + q)));
    },
  },
  {
    name: 'besselj',
    module: 'statistics',
    params: 'n, x',
    arity: [2, 2],
    call: (a) => {
      const n = a.number(0);
      if (!Number.isInteger(n)) a.domain(0);
      return quantity(besselJ(n, a.number(1)));
    },
  },
  {
    name: 'hygepdf',
    module: 'statistics',
    params: 'x, M, K, n',
    arity: [4, 4],
    call: (a) => {
      const [x, m, k, n] = [wholeNumber(a, 0), wholeNumber(a, 1), wholeNumber(a, 2), wholeNumber(a, 3)];
      if (k > m) a.domain(2);
      if (n > m) a.domain(3);
      return quantity(hypergeometric(x, m, k, n));
    },
  },
  {
    name: 'hygecdf',
    module: 'statistics',
    params: 'x, M, K, n',
    arity: [4, 4],
    call: (a) => {
      const [x, m, k, n] = [wholeNumber(a, 0), wholeNumber(a, 1), wholeNumber(a, 2), wholeNumber(a, 3)];
      if (k > m) a.domain(2);
      if (n > m) a.domain(3);
      let sum = 0;
      for (let i = 0; i <= x; i++) sum += hypergeometric(i, m, k, n);
      return quantity(Math.min(1, sum));
    },
  },
  // Of the normal distribution: of the standard one with a single argument, as before.
  {
    name: 'normcdf',
    module: 'statistics',
    params: 'x, μ, σ',
    arity: [1, 3],
    call: (a) => {
      if (a.count === 2) a.domain();
      return quantity(normalCdf(standardized(a, a.name).z));
    },
  },
  {
    name: 'norminv',
    module: 'statistics',
    params: 'p, μ, σ',
    arity: [1, 3],
    call: (a) => {
      if (a.count === 2) a.domain();
      const p = a.number(0);
      if (!(p > 0 && p < 1)) a.domain(0);
      const z = normalQuantile(p);
      if (a.count === 1) return quantity(z);
      const [mu, sigma] = [a.quantity(1), a.quantity(2)];
      if (!sameDim(mu.dim, sigma.dim)) fail('E-UNIT-MISMATCH', a.call.span, { operator: a.name, left: baseUnitSymbol(mu.dim), right: baseUnitSymbol(sigma.dim) });
      if (!(sigma.si > 0)) a.domain(2);
      return quantity(mu.si + z * sigma.si, mu.dim, mu.hint ? { hint: mu.hint } : {});
    },
  },
  {
    name: 'normpdf',
    module: 'statistics',
    params: 'x, μ, σ',
    arity: [1, 3],
    call: (a) => {
      if (a.count === 2) a.domain();
      const { z, sigma } = standardized(a, a.name);
      const density = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
      return sigma ? quantity(density / sigma.si, divideDims(quantity(1).dim, sigma.dim)) : quantity(density);
    },
  },
  {
    // By the mean, as MATLAB writes it.
    name: 'exppdf',
    module: 'statistics',
    params: 'x, mean',
    arity: [2, 2],
    call: (a) => {
      const { t, scale, dim } = positive(a, 1);
      return quantity(t < 0 ? 0 : Math.exp(-t) / scale, dim);
    },
  },
  {
    name: 'expcdf',
    module: 'statistics',
    params: 'x, mean',
    arity: [2, 2],
    call: (a) => {
      const { t } = positive(a, 1);
      return quantity(t < 0 ? 0 : 1 - Math.exp(-t));
    },
  },
  {
    name: 'wblpdf',
    module: 'statistics',
    params: 'x, scale, shape',
    arity: [3, 3],
    call: (a) => {
      const { t, scale, dim } = positive(a, 1);
      const k = a.number(2);
      if (!(k > 0)) a.domain(2);
      return quantity(t < 0 ? 0 : (k / scale) * t ** (k - 1) * Math.exp(-(t ** k)), dim);
    },
  },
  {
    name: 'wblcdf',
    module: 'statistics',
    params: 'x, scale, shape',
    arity: [3, 3],
    call: (a) => {
      const { t } = positive(a, 1);
      const k = a.number(2);
      if (!(k > 0)) a.domain(2);
      return quantity(t < 0 ? 0 : 1 - Math.exp(-(t ** k)));
    },
  },
  {
    // μ and σ of the logarithm of x.
    name: 'lognpdf',
    module: 'statistics',
    params: 'x, μ, σ',
    arity: [3, 3],
    call: (a) => {
      const [x, mu, sigma] = [a.number(0), a.number(1), a.number(2)];
      if (!(sigma > 0)) a.domain(2);
      if (x <= 0) return quantity(0);
      const z = (Math.log(x) - mu) / sigma;
      return quantity(Math.exp((-z * z) / 2) / (x * sigma * Math.sqrt(2 * Math.PI)));
    },
  },
  {
    name: 'logncdf',
    module: 'statistics',
    params: 'x, μ, σ',
    arity: [3, 3],
    call: (a) => {
      const [x, mu, sigma] = [a.number(0), a.number(1), a.number(2)];
      if (!(sigma > 0)) a.domain(2);
      return quantity(x <= 0 ? 0 : normalCdf((Math.log(x) - mu) / sigma));
    },
  },
  {
    name: 'gampdf',
    module: 'statistics',
    params: 'x, shape, scale',
    arity: [3, 3],
    call: (a) => {
      const { t, scale, dim } = positive(a, 2);
      const k = a.number(1);
      if (!(k > 0)) a.domain(1);
      return quantity(t <= 0 ? 0 : Math.exp((k - 1) * Math.log(t) - t - logGamma(k)) / scale, dim);
    },
  },
  {
    name: 'gamcdf',
    module: 'statistics',
    params: 'x, shape, scale',
    arity: [3, 3],
    call: (a) => {
      const { t } = positive(a, 2);
      const k = a.number(1);
      if (!(k > 0)) a.domain(1);
      return quantity(t <= 0 ? 0 : chiSquareCdf(2 * t, 2 * k));
    },
  },
  {
    name: 'rnd',
    module: 'statistics',
    params: 'n, seed, a, b',
    arity: [2, 4],
    call: (a) => {
      if (a.count === 3) a.domain();
      const { count, next } = countAndSeed(a);
      if (a.count === 2) return { type: 'vector', items: Array.from({ length: count }, () => quantity(next())) };
      const [low, high] = [a.quantity(2), a.quantity(3)];
      if (!sameDim(low.dim, high.dim)) fail('E-UNIT-MISMATCH', a.call.span, { operator: a.name, left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
      return { type: 'vector', items: Array.from({ length: count }, () => quantity(low.si + next() * (high.si - low.si), low.dim, low.hint ? { hint: low.hint } : {})) };
    },
  },
  {
    // Normal numbers by Box and Muller.
    name: 'rndn',
    module: 'statistics',
    params: 'n, seed, μ, σ',
    arity: [2, 4],
    call: (a) => {
      if (a.count === 3) a.domain();
      const { count, next } = countAndSeed(a);
      const mu = a.count > 2 ? a.quantity(2) : quantity(0);
      const sigma = a.count > 2 ? a.quantity(3) : quantity(1);
      if (!sameDim(mu.dim, sigma.dim)) fail('E-UNIT-MISMATCH', a.call.span, { operator: a.name, left: baseUnitSymbol(mu.dim), right: baseUnitSymbol(sigma.dim) });
      if (!(sigma.si > 0)) a.domain(3);
      const items: Quantity[] = [];
      while (items.length < count) {
        const [u, v] = [1 - next(), next()];
        const r = Math.sqrt(-2 * Math.log(u));
        for (const z of [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)]) {
          if (items.length < count) items.push(quantity(mu.si + z * sigma.si, mu.dim, mu.hint ? { hint: mu.hint } : {}));
        }
      }
      return { type: 'vector', items };
    },
  },
];
