/**
 * The built-in modules of functions. Transcendental functions take plain
 * numbers (Calcpad does the same); angles are plain numbers in SI, so
 * sin(30°) works.
 */

import { rootHint } from '../units/compose.js';
import { fail } from '../diagnostics.js';
import { isDimensionless, powerDim, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { civilFromDays, dateValue, daysFromCivil, daysOf, isDate, isValidDay } from '../values/date.js';
import { quantity, type Quantity } from '../values/value.js';
import { asBoolean } from '../eval/coerce.js';
import type { Args, FunctionDef, FunctionModuleId } from './registry.js';

/** A function of one plain number, with an optional domain. */
function plain(name: string, module: FunctionModuleId, f: (x: number) => number, domain?: (x: number) => boolean): FunctionDef {
  return {
    name,
    module,
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      const x = a.number(0);
      if (domain && !domain(x)) a.domain(0);
      return quantity(f(x));
    },
  };
}

/** The first argument's unit kept on a result of the same dimension. */
const keepUnit = (q: Quantity | undefined) => (q?.hint ? { hint: q.hint } : {});

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
      return quantity(Math.sqrt(x.si), powerDim(x.dim, 0.5), hint ? { hint } : {});
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
      return quantity(items.reduce((s, q) => s + q.si, 0) / items.length, items[0]!.dim, keepUnit(items[0]));
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
      return quantity(value, items[0]!.dim, keepUnit(items[0]));
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
];

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
];

// ---------------------------------------------------------------------------

export const LOGIC: readonly FunctionDef[] = [
  {
    name: 'if',
    module: 'logic',
    params: 'condition, then, else',
    arity: [3, 3],
    // Only the chosen branch is evaluated.
    call: (a) => (asBoolean(a.value(0), a.expr(0).span) ? a.value(1) : a.value(2)),
  },
];

/** Functions with a variable of their own: evaluated by eval/calculus.ts (sum is listed with series). */
export const CALCULUS: readonly FunctionDef[] = [
  { name: 'integral', module: 'calculus', params: 'f(x), x: a .. b', arity: [1, 1] },
  { name: 'derivative', module: 'calculus', params: 'f(x), x: a, order: 1', arity: [1, 1] },
  { name: 'roots', module: 'calculus', params: 'p(x), x', arity: [2, 2] },
  { name: 'fit', module: 'calculus', params: 'y, x: series, kind: "linear"', arity: [1, 1] },
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
];
