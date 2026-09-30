/**
 * Built-in functions and constants (docs/03-jazyk.md, ch. 7.1).
 *
 * Transcendental functions require dimensionless arguments (Calcpad does the
 * same). Angles are dimensionless in SI, so sin(30°) works.
 */

import { fail } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { isDimensionless, powerDim, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asBoolean, asComplex, asQuantity } from './coerce.js';

export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = {
  π: Math.PI,
};

type CallExpr = Extract<Expr, { kind: 'call' }>;
type Evaluate = (expr: Expr) => Value;

/** Plain numeric functions of one dimensionless argument. */
const UNARY_DIMENSIONLESS: Readonly<Record<string, (x: number) => number>> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const DOMAINS: Readonly<Record<string, (x: number) => boolean>> = {
  asin: (x) => x >= -1 && x <= 1,
  acos: (x) => x >= -1 && x <= 1,
  ln: (x) => x > 0,
  log10: (x) => x > 0,
};

export const FUNCTION_NAMES: readonly string[] = [
  ...Object.keys(UNARY_DIMENSIONLESS), 'sqrt', 'abs', 'atan2', 'min', 'max', 'if',
  // Complex numbers (F9)
  're', 'im', 'conj', 'arg', 'polar',
  // Series and finance (F10)
  'range', 'sum', 'len', 'mean', 'cumsum', 'npv', 'irr', 'pmt', 'payback',
];

export function callFunction(call: CallExpr, evaluate: Evaluate): Value {
  const { name, args } = call;

  // if() evaluates only the chosen branch.
  if (name === 'if') {
    arity(call, 3);
    const condition = asBoolean(evaluate(args[0]!), args[0]!.span);
    return evaluate(condition ? args[1]! : args[2]!);
  }

  const numeric = UNARY_DIMENSIONLESS[name];
  if (numeric) {
    arity(call, 1);
    const x = dimensionless(call, 0, evaluate);
    if (DOMAINS[name] && !DOMAINS[name](x)) fail('E-DOMAIN', args[0]!.span, { function: name });
    return quantity(numeric(x));
  }

  switch (name) {
    case 'sqrt': {
      arity(call, 1);
      const x = asComplex(evaluate(args[0]!), args[0]!.span);
      if (x.im) {
        // Principal square root of a complex value.
        const r = Math.hypot(x.si, x.im);
        return quantity(Math.sqrt((r + x.si) / 2), powerDim(x.dim, 0.5), { im: Math.sign(x.im) * Math.sqrt((r - x.si) / 2) });
      }
      // A real negative number has no real root: an error, as usual in a calculation.
      if (x.si < 0) fail('E-DOMAIN', args[0]!.span, { function: name });
      return quantity(Math.sqrt(x.si), powerDim(x.dim, 0.5));
    }
    case 'abs': {
      arity(call, 1);
      // Magnitude; of a complex value |a + bj| = √(a² + b²).
      const { im, ...x } = asComplex(evaluate(args[0]!), args[0]!.span);
      return { ...x, si: Math.hypot(x.si, im ?? 0) };
    }
    case 're':
    case 'im':
    case 'conj': {
      arity(call, 1);
      const { im, ...x } = asComplex(evaluate(args[0]!), args[0]!.span);
      if (name === 're') return x;
      if (name === 'im') return { ...x, si: im ?? 0 };
      return im ? { ...x, im: -im } : x;
    }
    case 'arg': {
      arity(call, 1);
      const x = asComplex(evaluate(args[0]!), args[0]!.span);
      return quantity(Math.atan2(x.im ?? 0, x.si));
    }
    case 'polar': {
      // polar(230 V, 30°): magnitude and angle.
      arity(call, 2);
      const r = asQuantity(evaluate(args[0]!), args[0]!.span);
      const phi = dimensionless(call, 1, evaluate);
      return quantity(r.si * Math.cos(phi), r.dim, { im: r.si * Math.sin(phi), ...(r.hint ? { hint: r.hint } : {}) });
    }
    case 'atan2': {
      arity(call, 2);
      const [y, x] = sameDimArgs(call, evaluate);
      return quantity(Math.atan2(y!.si, x!.si));
    }
    case 'min':
    case 'max': {
      if (args.length === 0) fail('E-FUNC-ARITY', call.span, { function: name, expected: '1+', found: 0 });
      // min(a, b, c) or min(series).
      const single = args.length === 1 ? evaluate(args[0]!) : undefined;
      const values = single?.type === 'vector' ? nonEmpty(single, call) : sameDimArgs(call, evaluate);
      const pick = name === 'min' ? (a: Quantity, b: Quantity) => (b.si < a.si ? b : a) : (a: Quantity, b: Quantity) => (b.si > a.si ? b : a);
      return values.reduce(pick);
    }
    case 'range': {
      // range(1, 25) or range(0 m, 10 m, 0.5 m): from, to (included), step.
      if (args.length !== 2 && args.length !== 3) fail('E-FUNC-ARITY', call.span, { function: name, expected: '2–3', found: args.length });
      const [from, to] = sameDimArgs({ ...call, args: args.slice(0, 2) }, evaluate);
      const step = args[2] ? asQuantity(evaluate(args[2]), args[2].span) : quantity(from!.hint && !isDimensionless(from!.dim) ? from!.hint.factor : 1, from!.dim);
      if (!sameDim(step.dim, from!.dim)) fail('E-UNIT-MISMATCH', args[2]!.span, { operator: name, left: baseUnitSymbol(from!.dim), right: baseUnitSymbol(step.dim) });
      if (!(step.si > 0)) fail('E-DOMAIN', (args[2] ?? call).span, { function: name });
      const count = Math.floor((to!.si - from!.si) / step.si + 1e-9) + 1;
      if (count > MAX_RANGE) fail('E-RANGE-SIZE', call.span);
      const items = Array.from({ length: Math.max(0, count) }, (_, i) => quantity(from!.si + i * step.si, from!.dim, from!.hint ? { hint: from!.hint } : {}));
      return { type: 'vector', items };
    }
    case 'sum':
    case 'mean': {
      arity(call, 1);
      const items = series(call, 0, evaluate);
      const first = items[0];
      const total = items.reduce((s, q) => s + q.si, 0);
      const value = name === 'mean' ? (items.length ? total / items.length : fail('E-DOMAIN', call.span, { function: name })) : total;
      return quantity(value, first?.dim, first?.hint ? { hint: first.hint } : {});
    }
    case 'len': {
      arity(call, 1);
      return quantity(series(call, 0, evaluate).length);
    }
    case 'cumsum': {
      arity(call, 1);
      let running = 0;
      return { type: 'vector', items: series(call, 0, evaluate).map((q) => ({ ...q, si: (running += q.si) })) };
    }
    case 'npv': {
      // Net present value; the first cash flow is now (t = 0), the next ones at the end of each period.
      arity(call, 2);
      const rate = dimensionless(call, 0, evaluate);
      const flows = series(call, 1, evaluate);
      const first = flows[0];
      return quantity(presentValue(rate, flows), first?.dim, first?.hint ? { hint: first.hint } : {});
    }
    case 'irr': {
      // Internal rate of return: the rate at which the net present value is zero.
      arity(call, 1);
      return quantity(internalRate(series(call, 0, evaluate), call));
    }
    case 'pmt': {
      // Payment of an annuity: pmt(rate, periods, amount).
      arity(call, 3);
      const rate = dimensionless(call, 0, evaluate);
      const n = dimensionless(call, 1, evaluate);
      const amount = asQuantity(evaluate(args[2]!), args[2]!.span);
      const payment = rate === 0 ? amount.si / n : (amount.si * rate) / (1 - (1 + rate) ** -n);
      return quantity(payment, amount.dim, amount.hint ? { hint: amount.hint } : {});
    }
    case 'payback': {
      // Periods until the cumulative cash flow reaches zero, between periods linearly.
      arity(call, 1);
      const flows = series(call, 0, evaluate);
      let cumulative = flows[0]?.si ?? 0;
      if (cumulative >= 0) return quantity(0);
      for (let k = 1; k < flows.length; k++) {
        const flow = flows[k]!.si;
        if (cumulative + flow >= 0) return quantity(k - 1 + -cumulative / flow);
        cumulative += flow;
      }
      return fail('E-NO-PAYBACK', call.span);
    }
    default:
      return fail('E-FUNC-UNKNOWN', call.span, { function: name });
  }
}

const MAX_RANGE = 10_000;

/** A series argument (a table column or [a, b, c]). */
function series(call: CallExpr, index: number, evaluate: Evaluate): readonly Quantity[] {
  const arg = call.args[index]!;
  const value = evaluate(arg);
  if (value.type !== 'vector') return fail('E-TYPE', arg.span, { expected: 'vector', found: value.type === 'quantity' ? 'number' : value.type });
  return value.items;
}

function nonEmpty(value: Extract<Value, { type: 'vector' }>, call: CallExpr): Quantity[] {
  if (value.items.length === 0) fail('E-FUNC-ARITY', call.span, { function: call.name, expected: '1+', found: 0 });
  return [...value.items];
}

function presentValue(rate: number, flows: readonly Quantity[]): number {
  return flows.reduce((sum, q, t) => sum + q.si / (1 + rate) ** t, 0);
}

/** The rate with zero net present value: the sign change nearest to 0 %, then bisection. */
function internalRate(flows: readonly Quantity[], call: CallExpr): number {
  const f = (r: number) => presentValue(r, flows);
  const grid = [0, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1, 2, 5, 10];
  const down = [-0.01, -0.05, -0.1, -0.2, -0.3, -0.5, -0.7, -0.9, -0.99];
  const find = (points: number[]): [number, number] | undefined => {
    for (let i = 1; i < points.length; i++) if (f(points[i - 1]!) * f(points[i]!) <= 0) return [points[i - 1]!, points[i]!];
    return undefined;
  };
  const bracket = find(grid) ?? find([0, ...down]);
  if (!bracket) return fail('E-SOLVE-NO-ROOT', call.span);
  let [a, b] = bracket;
  let fa = f(a);
  for (let i = 0; i < 200 && Math.abs(b - a) > 1e-15 * Math.max(1, Math.abs(a)); i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (fa * fm < 0) b = m;
    else [a, fa] = [m, fm];
  }
  return (a + b) / 2;
}

function arity(call: CallExpr, expected: number): void {
  if (call.args.length !== expected) {
    fail('E-FUNC-ARITY', call.span, { function: call.name, expected, found: call.args.length });
  }
}

function dimensionless(call: CallExpr, index: number, evaluate: Evaluate): number {
  const arg = call.args[index]!;
  const q = asQuantity(evaluate(arg), arg.span);
  if (!isDimensionless(q.dim)) fail('E-FUNC-ARG-DIM', arg.span, { function: call.name, dim: baseUnitSymbol(q.dim) });
  return q.si;
}

function sameDimArgs(call: CallExpr, evaluate: Evaluate): Quantity[] {
  const values = call.args.map((arg) => asQuantity(evaluate(arg), arg.span));
  const first = values[0]!;
  values.forEach((q, i) => {
    if (!sameDim(q.dim, first.dim)) {
      fail('E-UNIT-MISMATCH', call.args[i]!.span, { operator: call.name, left: baseUnitSymbol(first.dim), right: baseUnitSymbol(q.dim) });
    }
  });
  return values;
}
