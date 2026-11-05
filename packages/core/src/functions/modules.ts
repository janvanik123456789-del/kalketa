/**
 * The built-in modules of functions. Transcendental functions take plain
 * numbers (Calcpad does the same); angles are plain numbers in SI, so
 * sin(30°) works.
 */

import { rootHint } from '../units/compose.js';
import { squareRoot, type Exact } from '../values/exact.js';
import { fail } from '../diagnostics.js';
import { dim, DIMENSIONLESS, isDimensionless, multiplyDims, powerDim, sameDim } from '../units/dimension.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { baseUnitSymbol } from '../units/display.js';
import { civilFromDays, dateValue, daysFromCivil, daysOf, isDate, isValidDay } from '../values/date.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asBoolean, asComplex, asQuantity } from '../eval/coerce.js';
import { compare } from '../eval/evaluator.js';
import { withBareZero } from '../eval/zero.js';
import type { Expr } from '../lang/ast.js';
import type { Args, FunctionDef, FunctionModuleId } from './registry.js';
import { chiSquareCdf, chiSquareQuantile, fisherCdf, fisherQuantile, normalCdf, normalQuantile, studentCdf, studentQuantile } from './distributions.js';

/** A function of one plain number, with an optional domain; on a series it is taken item by item (exp(-t/τ) for the times t). */
/**
 * ⌊x⌋, ⌈x⌉ or the nearest whole number as on paper: from the exact form where the value has one
 * (⌊(0.7 + 0.1)·10⌋ is 8, though the binary number is 7.999…), else with the last bits of rounding ignored.
 */
function whole(x: number, exact: Exact | undefined, how: 'floor' | 'ceil' | 'round'): number {
  // A half goes away from zero on both sides, as on paper and in Excel: round(-2.5) is -3 as round(2.5) is 3.
  if (how === 'round' && x < 0) return 0 - whole(-x, exact ? { ...exact, num: -exact.num } : undefined, how);
  if (exact && exact.root === 1n) {
    // Division of bigints truncates toward zero: floor and ceil from it and the sign of the remainder.
    const { num, den } = how === 'round' ? { num: 2n * exact.num + exact.den, den: 2n * exact.den } : exact;
    const q = num / den;
    const r = num % den;
    if (how === 'ceil') return Number(r > 0n ? q + 1n : q);
    return Number(r < 0n ? q - 1n : q);
  }
  const near = Math.round(x);
  if (Math.abs(x - near) <= 1e-12 * Math.max(1, Math.abs(x))) return near;
  return how === 'floor' ? Math.floor(x) : how === 'ceil' ? Math.ceil(x) : near;
}

/**
 * round(x), floor(x), ceil(x), with n places: round(x, 2). In the unit of the value, as it is shown: ceil(5.5 CZK)
 * is 6 CZK, round(25.6 °C) is 26 °C. (Items of a series go one by one, see ITEMWISE.)
 */
function rounding(how: 'floor' | 'ceil' | 'round'): FunctionDef {
  return {
    name: how,
    module: 'math',
    params: 'x, n',
    arity: [1, 2],
    call: (a) => {
      const q = a.quantity(0);
      const n = a.count > 1 ? a.number(1) : 0;
      if (!Number.isInteger(n) || n < 0 || n > 15) a.domain(1);
      const factor = q.hint?.factor ?? 1;
      const offset = q.absolute ? (q.hint?.offset ?? 0) : 0;
      const shown = (q.si - offset) / factor;
      const scale = 10 ** n;
      // With places too from the exact form: round(1.005, 2) is 1.01, though the binary number lies just under 1.005.
      const given = factor === 1 && offset === 0 ? q.exact : undefined;
      const done = whole(shown * scale, given && n > 0 ? { ...given, num: given.num * 10n ** BigInt(n) } : given, how) / scale;
      return quantity(done * factor + offset, q.dim, { ...(q.hint ? { hint: q.hint } : {}), ...(q.absolute ? { absolute: true } : {}) });
    },
  };
}

/** The same functions of a complex number, the principal value where there are more. */
const OF_COMPLEX: Readonly<Record<string, (a: number, b: number) => [number, number]>> = {
  exp: (a, b) => [Math.exp(a) * Math.cos(b), Math.exp(a) * Math.sin(b)],
  ln: (a, b) => [Math.log(Math.hypot(a, b)), Math.atan2(b, a)],
  log10: (a, b) => [Math.log(Math.hypot(a, b)) / Math.LN10, Math.atan2(b, a) / Math.LN10],
  log2: (a, b) => [Math.log(Math.hypot(a, b)) / Math.LN2, Math.atan2(b, a) / Math.LN2],
  sin: (a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)],
  cos: (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)],
  sinh: (a, b) => [Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)],
  cosh: (a, b) => [Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)],
  tan: (a, b) => {
    const d = Math.cos(2 * a) + Math.cosh(2 * b);
    return [Math.sin(2 * a) / d, Math.sinh(2 * b) / d];
  },
  tanh: (a, b) => {
    const d = Math.cosh(2 * a) + Math.cos(2 * b);
    return [Math.sinh(2 * a) / d, Math.sin(2 * b) / d];
  },
};

function plain(name: string, module: FunctionModuleId, f: (x: number, q: Quantity) => number, domain?: (x: number) => boolean): FunctionDef {
  const ofComplex = OF_COMPLEX[name === 'tg' ? 'tan' : name];
  return {
    name,
    module,
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      const value = a.value(0);
      const one = (q: Quantity): Quantity => {
        if (!isDimensionless(q.dim)) fail('E-FUNC-ARG-DIM', a.expr(0).span, { function: a.name, dim: baseUnitSymbol(q.dim) });
        if (q.im && ofComplex) {
          const [re, im] = ofComplex(q.si, q.im);
          if (!Number.isFinite(re) || !Number.isFinite(im)) a.domain(0);
          return quantity(re, undefined, { im });
        }
        if (q.im) fail('E-COMPLEX-ARG', a.expr(0).span);
        if (domain && !domain(q.si)) a.domain(0);
        return quantity(f(q.si, q));
      };
      if (value.type === 'vector') return { type: 'vector', items: value.items.map(one) };
      return one(asComplex(value, a.expr(0).span));
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
  { name: 'argmin', module: 'math', params: 'v', arity: [1, 1], call: (a) => whereExtreme(a, (x, y) => y < x) },
  { name: 'argmax', module: 'math', params: 'v', arity: [1, 1], call: (a) => whereExtreme(a, (x, y) => y > x) },
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
  rounding('floor'),
  rounding('ceil'),
  rounding('round'),
  plain('exp', 'math', Math.exp),
  plain('ln', 'math', Math.log, (x) => x > 0),
  plain('log10', 'math', Math.log10, (x) => x > 0),
  plain('log2', 'math', Math.log2, (x) => x > 0),
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
  // min(a, b, c), min(series) or min(matrix).
  const single = a.count === 1 ? a.value(0) : undefined;
  const values = single?.type === 'vector' || single?.type === 'matrix' ? single.items : a.sameDimension();
  if (values.length === 0) fail('E-FUNC-ARITY', a.call.span, { function: a.name, expected: '1+', found: 0 });
  return values.reduce((best, q) => (better(best, q) ? q : best));
}

/** Where the least or greatest item is: its place in a series; [row, column] in a matrix. The first of equal ones. */
function whereExtreme(a: Args, better: (best: number, other: number) => boolean): Value {
  const value = a.value(0);
  if (value.type !== 'vector' && value.type !== 'matrix') return fail('E-TYPE', a.expr(0).span, { expected: 'vector', found: value.type === 'quantity' ? 'number' : value.type });
  if (value.items.length === 0) a.domain(0);
  let at = 0;
  value.items.forEach((q, i) => {
    if (better(value.items[at]!.si, q.si)) at = i;
  });
  if (value.type === 'vector') return quantity(at + 1);
  return { type: 'vector', items: [quantity(Math.floor(at / value.cols) + 1), quantity((at % value.cols) + 1)] };
}

/** The unit of a difference of values: Δ°C for °C; an absolute temperature is no longer one. */
function differenceOf(q: Quantity | undefined): { hint?: ResolvedUnit } {
  if (!q?.hint) return {};
  return q.hint.offset === undefined ? { hint: q.hint } : { hint: { symbol: q.hint.delta ?? q.hint.symbol, factor: q.hint.factor, dim: q.hint.dim } };
}

/** The unit of a product of two values (kN·m, m²), where it reads simply; kN/m·m is kN. */
function productUnit(a: Quantity | undefined, b: Quantity | undefined): { hint?: ResolvedUnit } {
  const [f, g] = [a?.hint, b?.hint];
  if (!f || !g || f.offset !== undefined || g.offset !== undefined || isDimensionless(f.dim) || isDimensionless(g.dim) || /[()]/.test(f.symbol + g.symbol)) return {};
  const [factor, dim] = [f.factor * g.factor, multiplyDims(f.dim, g.dim)];
  if (f.symbol.endsWith(`/${g.symbol}`)) return { hint: { symbol: f.symbol.slice(0, -g.symbol.length - 1), factor, dim } };
  if (/[·/]/.test(f.symbol + g.symbol)) return {};
  return { hint: { symbol: f.symbol === g.symbol ? `${f.symbol}²` : `${f.symbol}·${g.symbol}`, factor, dim } };
}

/** The columns of a matrix, or two series of one length, for cov and corr. */
function columnsOf(a: Args): { columns: (readonly Quantity[])[]; matrix: boolean } {
  const first = a.value(0);
  if (a.count === 1 && first.type === 'matrix') {
    if (first.rows < 2) a.domain(0);
    return { matrix: true, columns: Array.from({ length: first.cols }, (_, j) => Array.from({ length: first.rows }, (__, i) => first.items[i * first.cols + j]!)) };
  }
  const x = a.series(0);
  const y = a.count > 1 ? a.series(1) : x;
  if (x.length !== y.length) fail('E-VECTOR-LENGTH', a.call.span, { left: x.length, right: y.length });
  if (x.length < 2) a.domain(0);
  return { matrix: false, columns: [x, y] };
}

/** The sample covariance Σ(x − x̄)(y − ȳ)/(n − 1), as a plain number. */
function covariance(x: readonly Quantity[], y: readonly Quantity[]): number {
  const mean = (v: readonly Quantity[]) => v.reduce((s, q) => s + q.si, 0) / v.length;
  const [mx, my] = [mean(x), mean(y)];
  return x.reduce((s, q, i) => s + (q.si - mx) * (y[i]!.si - my), 0) / (x.length - 1);
}

/** From the areas of the trapezia: trapz(y) with a step of 1, trapz(x, y); each area in order. */
function trapezia(a: Args): { areas: number[]; dim: Quantity['dim']; unit: { hint?: ResolvedUnit } } {
  const y = a.series(a.count - 1);
  const x = a.count > 1 ? a.series(0) : undefined;
  if (x && x.length !== y.length) fail('E-VECTOR-LENGTH', a.call.span, { left: x.length, right: y.length });
  if (y.length < 2) a.domain(a.count - 1);
  const areas = y.slice(1).map((q, i) => ((q.si + y[i]!.si) / 2) * (x ? x[i + 1]!.si - x[i]!.si : 1));
  return { areas, dim: x ? multiplyDims(y[0]!.dim, x[0]!.dim) : y[0]!.dim, unit: x ? productUnit(y[0], x[0]) : differenceOf(y[0]) };
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
  plain('sec', 'trig', (x) => 1 / Math.cos(x)),
  plain('csc', 'trig', (x) => 1 / Math.sin(x)),
  plain('acot', 'trig', (x) => Math.PI / 2 - Math.atan(x)),
  plain('asec', 'trig', (x) => Math.acos(1 / x), (x) => Math.abs(x) >= 1),
  plain('acsc', 'trig', (x) => Math.asin(1 / x), (x) => Math.abs(x) >= 1),
  plain('coth', 'trig', (x) => 1 / Math.tanh(x), (x) => x !== 0),
  plain('sech', 'trig', (x) => 1 / Math.cosh(x)),
  plain('csch', 'trig', (x) => 1 / Math.sinh(x), (x) => x !== 0),
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

/** Whole numbers of any count, or a series of them. */
function wholeItems(a: Args): number[] {
  const all = a.items().map((q) => q.si);
  if (all.some((x) => !Number.isSafeInteger(x)) || a.items().some((q) => !isDimensionless(q.dim))) a.domain();
  return all.map(Math.abs);
}

const gcdOf = (x: number, y: number): number => (y === 0 ? x : gcdOf(y, x % y));

export const SERIES: readonly FunctionDef[] = [
  { name: 'gcd', module: 'math', params: 'a, b, …', arity: [1, Infinity], call: (a) => quantity(wholeItems(a).reduce(gcdOf, 0)) },
  {
    name: 'lcm',
    module: 'math',
    params: 'a, b, …',
    arity: [1, Infinity],
    call: (a) => quantity(wholeItems(a).reduce((x, y) => (x === 0 || y === 0 ? 0 : (x / gcdOf(x, y)) * y), 1)),
  },
  { name: 'trunc', module: 'math', params: 'x', arity: [1, 1], call: (a) => { const q = a.quantity(0); const f = q.hint?.factor ?? 1; return quantity(Math.trunc(q.si / f) * f, q.dim, keepUnit(q)); } },
  {
    // The square root of the sum of squares, as combinations of modes and of uncertainties write it.
    name: 'srss',
    module: 'series',
    params: 'a, b, …',
    arity: [1, Infinity],
    call: (a) => {
      const items = a.items();
      return quantity(Math.hypot(...items.map((q) => q.si)), items[0]?.dim, keepUnit(items[0]));
    },
  },
  {
    name: 'sumsq',
    module: 'series',
    params: 'a, b, …',
    arity: [1, Infinity],
    call: (a) => {
      const items = a.items();
      return quantity(items.reduce((s, q) => s + q.si ** 2, 0), items[0] ? multiplyDims(items[0].dim, items[0].dim) : undefined);
    },
  },
  {
    name: 'reverse',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => ({ type: 'vector', items: [...a.series(0)].reverse() }),
  },
  {
    name: 'last',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      if (items.length === 0) a.domain();
      return items[items.length - 1]!;
    },
  },
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
    arity: [1, Infinity],
    call: (a) => {
      const items = a.items();
      const im = items.reduce((s, q) => s + (q.im ?? 0), 0);
      return quantity(
        items.reduce((s, q) => s + q.si, 0),
        items[0]?.dim,
        { ...keepUnit(items[0]), ...(im ? { im } : {}) },
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
  {
    name: 'linspace',
    module: 'series',
    params: 'from, to, n',
    arity: [3, 3],
    call: (a) => {
      // n points from one end to the other, ends included.
      const [from, to] = a.sameDimension(0, 2);
      const n = a.number(2);
      if (!Number.isInteger(n) || n < 2) a.domain(2);
      if (n > MAX_RANGE) fail('E-RANGE-SIZE', a.call.span);
      return { type: 'vector', items: Array.from({ length: n }, (_, i) => quantity(from!.si + ((to!.si - from!.si) * i) / (n - 1), from!.dim, keepUnit(from))) };
    },
  },
  {
    name: 'prod',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      const hint = items.length === 2 ? productUnit(items[0], items[1]) : {};
      return quantity(items.reduce((p, q) => p * q.si, 1), powerDim(items[0]?.dim ?? DIMENSIONLESS, items.length), hint);
    },
  },
  {
    name: 'cumprod',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      // The running product of plain numbers: growth factors. With a unit each item would have another dimension.
      const items = a.series(0);
      const wrong = items.find((q) => !isDimensionless(q.dim));
      if (wrong) fail('E-FUNC-ARG-DIM', a.expr(0).span, { function: a.name, dim: baseUnitSymbol(wrong.dim) });
      let running = 1;
      return { type: 'vector', items: items.map((q) => quantity((running *= q.si))) };
    },
  },
  {
    name: 'diff',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      // Differences of neighbours, one item fewer; of temperatures, differences of temperature.
      const items = a.series(0);
      if (items.length < 2) a.domain(0);
      return { type: 'vector', items: items.slice(1).map((q, i) => quantity(q.si - items[i]!.si, q.dim, differenceOf(q))) };
    },
  },
  {
    name: 'trapz',
    module: 'series',
    params: 'x, y',
    arity: [1, 2],
    call: (a) => {
      const { areas, dim, unit } = trapezia(a);
      return quantity(areas.reduce((s, v) => s + v, 0), dim, unit);
    },
  },
  {
    name: 'cumtrapz',
    module: 'series',
    params: 'x, y',
    arity: [1, 2],
    call: (a) => {
      // As long as the data: 0 at the first point.
      const { areas, dim, unit } = trapezia(a);
      let running = 0;
      return { type: 'vector', items: [0, ...areas].map((v) => quantity((running += v), dim, unit)) };
    },
  },
  {
    name: 'sort',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => ({ type: 'vector', items: [...a.series(0)].sort((x, y) => x.si - y.si) }),
  },
  {
    name: 'ranks',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      // The place of each item from the least, equal items sharing the mean of their places (11.5).
      const items = a.series(0);
      const order = items.map((q) => q.si).sort((x, y) => x - y);
      return { type: 'vector', items: items.map((q) => quantity((order.indexOf(q.si) + 1 + order.lastIndexOf(q.si) + 1) / 2)) };
    },
  },
  { name: 'each', module: 'series', params: 'f, v', arity: [2, 2] },
];

// ---------------------------------------------------------------------------

export const STATISTICS: readonly FunctionDef[] = [
  {
    name: 'mean',
    module: 'statistics',
    params: 'v',
    arity: [1, Infinity],
    call: (a) => {
      const items = a.items();
      if (items.length === 0) a.domain();
      const im = items.reduce((s, q) => s + (q.im ?? 0), 0) / items.length;
      return quantity(items.reduce((s, q) => s + q.si, 0) / items.length, items[0]!.dim, { ...keepPlace(items), ...(im ? { im } : {}) });
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
    // Of a whole population (n), not a sample of it (n − 1).
    name: 'stdevp',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      if (items.length < 1) a.domain();
      const mean = items.reduce((s, q) => s + q.si, 0) / items.length;
      return quantity(Math.sqrt(items.reduce((s, q) => s + (q.si - mean) ** 2, 0) / items.length), items[0]!.dim, differenceOf(items[0]));
    },
  },
  {
    name: 'varp',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      if (items.length < 1) a.domain();
      const mean = items.reduce((s, q) => s + q.si, 0) / items.length;
      return quantity(items.reduce((s, q) => s + (q.si - mean) ** 2, 0) / items.length, multiplyDims(items[0]!.dim, items[0]!.dim));
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
      return quantity(Math.sqrt(variance), items[0]!.dim, differenceOf(items[0]));
    },
  },
  {
    name: 'var',
    module: 'statistics',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      // Sample variance (n − 1), the square of stdev.
      const items = a.series(0);
      if (items.length < 2) a.domain(0);
      return quantity(covariance(items, items), multiplyDims(items[0]!.dim, items[0]!.dim), productUnit(items[0], items[0]));
    },
  },
  {
    name: 'cov',
    module: 'statistics',
    params: 'x, y',
    arity: [1, 2],
    call: (a) => {
      // cov(x, y), or of a matrix: the covariances of its columns.
      const { columns, matrix } = columnsOf(a);
      const one = (x: readonly Quantity[], y: readonly Quantity[]) => quantity(covariance(x, y), multiplyDims(x[0]!.dim, y[0]!.dim), productUnit(x[0], y[0]));
      if (!matrix) return one(columns[0]!, columns[1]!);
      return { type: 'matrix', rows: columns.length, cols: columns.length, items: columns.flatMap((x) => columns.map((y) => one(x, y))) };
    },
  },
  {
    name: 'corr',
    module: 'statistics',
    params: 'x, y',
    arity: [1, 2],
    call: (a) => {
      // Pearson's r; of a matrix: of its columns. Of ranks, corr(ranks(x), ranks(y)), it is Spearman's.
      const { columns, matrix } = columnsOf(a);
      const one = (x: readonly Quantity[], y: readonly Quantity[]) => {
        const size = Math.sqrt(covariance(x, x) * covariance(y, y));
        if (size === 0) a.domain();
        return quantity(covariance(x, y) / size);
      };
      if (!matrix) return one(columns[0]!, columns[1]!);
      return { type: 'matrix', rows: columns.length, cols: columns.length, items: columns.flatMap((x) => columns.map((y) => one(x, y))) };
    },
  },
  {
    name: 'quantile',
    module: 'statistics',
    params: 'v, p',
    arity: [2, 2],
    call: (a) => {
      // The p-quantile between neighbouring sorted items (as R and NumPy by default): quantile(v, 0.25). Books differ a little.
      const items = a.series(0);
      if (items.length === 0) a.domain(0);
      const sorted = items.map((q) => q.si).sort((x, y) => x - y);
      const one = (p: Quantity): Quantity => {
        if (!isDimensionless(p.dim)) fail('E-FUNC-ARG-DIM', a.expr(1).span, { function: a.name, dim: baseUnitSymbol(p.dim) });
        if (!(p.si >= 0 && p.si <= 1)) a.domain(1);
        const place = (sorted.length - 1) * p.si;
        const low = Math.floor(place);
        const high = Math.min(sorted.length - 1, low + 1);
        return quantity(sorted[low]! + (sorted[high]! - sorted[low]!) * (place - low), items[0]!.dim, keepPlace(items));
      };
      const p = a.value(1);
      return p.type === 'vector' ? { type: 'vector', items: p.items.map(one) } : one(a.quantity(1));
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
    // P(X ≤ x) of the χ² distribution with ν degrees of freedom: the p-value of a goodness-of-fit test is 1 − chi2cdf(x, ν).
    name: 'chi2cdf',
    module: 'statistics',
    params: 'x, ν',
    arity: [2, 2],
    call: (a) => {
      const nu = a.number(1);
      if (!(nu > 0)) a.domain(1);
      return quantity(chiSquareCdf(a.number(0), nu));
    },
  },
  {
    // The p-quantile of χ²: the critical value of a test at 5 % with 3 degrees of freedom, chi2inv(0.95, 3) = 7.815.
    name: 'chi2inv',
    module: 'statistics',
    params: 'p, ν',
    arity: [2, 2],
    call: (a) => {
      const p = a.number(0);
      const nu = a.number(1);
      if (!(p > 0 && p < 1)) a.domain(0);
      if (!(nu > 0)) a.domain(1);
      return quantity(chiSquareQuantile(p, nu));
    },
  },
  {
    // P(X ≤ x) of the F distribution with ν₁, ν₂ degrees of freedom: the p-value of an analysis of variance is 1 − fcdf(F, k − 1, n − k).
    name: 'fcdf',
    module: 'statistics',
    params: 'x, ν₁, ν₂',
    arity: [3, 3],
    call: (a) => {
      const nu1 = a.number(1);
      const nu2 = a.number(2);
      if (!(nu1 > 0)) a.domain(1);
      if (!(nu2 > 0)) a.domain(2);
      return quantity(fisherCdf(a.number(0), nu1, nu2));
    },
  },
  {
    // The p-quantile of F: finv(0.95, 3, 24) = 3.009.
    name: 'finv',
    module: 'statistics',
    params: 'p, ν₁, ν₂',
    arity: [3, 3],
    call: (a) => {
      const p = a.number(0);
      const nu1 = a.number(1);
      const nu2 = a.number(2);
      if (!(p > 0 && p < 1)) a.domain(0);
      if (!(nu1 > 0)) a.domain(1);
      if (!(nu2 > 0)) a.domain(2);
      return quantity(fisherQuantile(p, nu1, nu2));
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
  { name: 'max_of', module: 'calculus', params: 'f(x), x: a .. b', arity: [1, 1] },
  { name: 'min_of', module: 'calculus', params: 'f(x), x: a .. b', arity: [1, 1] },
  { name: 'first', module: 'calculus', params: 'condition, n: from .. to', arity: [1, 1] },
  { name: 'matrix', module: 'linear', params: 'f(i, j), i: 1 .. n, j: 1 .. m', arity: [1, 1] },
  { name: 'vector', module: 'linear', params: 'f(i), i: 1 .. n', arity: [1, 1] },
  { name: 'fit_s', module: 'calculus', params: 'F', arity: [1, 1] },
  { name: 'fit_se', module: 'calculus', params: 'F', arity: [1, 1] },
  { name: 'fit_r2', module: 'calculus', params: 'F', arity: [1, 1] },
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
  // In the formula of a column: the cell of the row above (graph/session.ts).
  { name: 'prev', module: 'tables', params: 'column, start', arity: [1, 2] },
  // Calculated by the session: the sheet again for each variant (graph/session.ts).
  { name: 'compare', module: 'tables', params: 'Variants, name, …', arity: [2, 32] },
];
