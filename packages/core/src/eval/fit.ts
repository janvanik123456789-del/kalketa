/**
 * Fitting a curve through measured points (docs/03-jazyk.md, ch. 7.1f):
 *
 *   T_fit := fit(Mereni.T, x: Mereni.t, kind: "linear")
 *   T_fit(45 s)                                  the fitted curve at 45 s
 *
 * Least squares. Kinds: linear (a + b·x), poly2, poly3 (polynomials),
 * exp (a·e^(b·x)), power (a·x^b) and log (a + b·ln x); exp, power and log
 * are fitted on logarithms. The result is a function of one variable, named
 * after the column of x (t), with the coefficients and their units kept, so
 * the print shows its equation with numbers, and R².
 */

import { fail } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { DIMENSIONLESS, divideDims, powerDim, sameDim } from '../units/dimension.js';
import { formatTerms, unitTerms } from '../units/compose.js';
import { baseUnitSymbol } from '../units/display.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type FunctionValue, type Quantity, type Value } from '../values/value.js';
import type { EvalContext } from './evaluator.js';

type Evaluate = (expr: Expr, ctx: EvalContext) => Value;
type CallExpr = Extract<Expr, { kind: 'call' }>;

export const FIT_KINDS = ['linear', 'poly2', 'poly3', 'exp', 'power', 'log'] as const;
export type FitKind = (typeof FIT_KINDS)[number];

/** What a fitted function was made from: shown in print as its equation and R². */
export interface FitInfo {
  readonly kind: FitKind;
  /** The variable of the function (the column of x: "t"). */
  readonly param: string;
  /** Names of the coefficients in the function's body, with their values. */
  readonly coefficients: readonly { readonly name: string; readonly value: Quantity }[];
  /** Coefficient of determination of the fit, on the data as measured. */
  readonly r2: number;
  readonly points: number;
}

/** Name of a coefficient inside the fitted function (never written by a user). */
const COEFFICIENT = '\u0000c';

export function fitCall(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): FunctionValue {
  const xArg = call.named.find((n) => n.name === 'x');
  const kindArg = call.named.find((n) => n.name === 'kind');
  const extra = call.named.find((n) => n.name !== 'x' && n.name !== 'kind');
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: 'fit', argument: extra.name, problem: 'unknown' });
  if (call.args.length !== 1 || !xArg) return fail('E-FIT-FORM', call.span);
  const kindValue = kindArg ? evaluate(kindArg.value, ctx) : { type: 'text' as const, value: 'linear' };
  if (kindValue.type !== 'text' || !(FIT_KINDS as readonly string[]).includes(kindValue.value)) {
    return fail('E-FIT-KIND', kindArg?.value.span ?? call.span, { kind: kindValue.type === 'text' ? kindValue.value : '', kinds: FIT_KINDS.join(', ') });
  }
  const kind = kindValue.value as FitKind;
  const ys = series(evaluate(call.args[0]!, ctx), call.args[0]!.span);
  const xs = series(evaluate(xArg.value, ctx), xArg.value.span);
  if (xs.length !== ys.length) fail('E-PLOT-LENGTH', call.span, {});
  const needed = { linear: 2, poly2: 3, poly3: 4, exp: 2, power: 2, log: 2 }[kind];
  if (xs.length < needed + 1) fail('E-FIT-POINTS', call.span, { needed: needed + 1, found: xs.length });
  for (const list of [xs, ys]) {
    const other = list.find((q) => !sameDim(q.dim, list[0]!.dim));
    if (other) fail('E-UNIT-MISMATCH', call.span, { operator: ',', left: baseUnitSymbol(list[0]!.dim), right: baseUnitSymbol(other.dim) });
  }
  const x0 = xs[0]!;
  const y0 = ys[0]!;
  // The logarithmic kinds work on x in its own unit (ln of 20 s is ln 20).
  const xUnit: Quantity = quantity(x0.hint?.factor ?? 1, x0.dim, x0.hint ? { hint: x0.hint } : {});
  const xv = xs.map((q) => q.si);
  const yv = ys.map((q) => q.si);
  if ((kind === 'exp' || kind === 'power') && yv.some((v) => v <= 0)) fail('E-FIT-POSITIVE', call.args[0]!.span, { kind });
  if ((kind === 'power' || kind === 'log') && xv.some((v) => v <= 0)) fail('E-FIT-POSITIVE', xArg.value.span, { kind });

  const param = xArg.value.kind === 'member' ? xArg.value.name : xArg.value.kind === 'variable' ? xArg.value.name : 'x';
  const at = call.span;
  const c = (i: number): Expr => ({ kind: 'variable', name: `${COEFFICIENT}${i}`, span: at });
  const p: Expr = { kind: 'variable', name: param, span: at };
  const u: Expr = { kind: 'variable', name: `${COEFFICIENT}u`, span: at };
  const bin = (operator: '+' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({ kind: 'binary', operator, left, right, span: at });
  const callOf = (name: string, arg: Expr): Expr => ({ kind: 'call', name, args: [arg], named: [], span: at });

  let coefficients: Quantity[];
  let body: Expr;
  // Slopes of an absolute temperature are differences: °C/s, not an absolute °C.
  const yHint = deltaOf(y0.hint);
  if (kind === 'linear' || kind === 'poly2' || kind === 'poly3') {
    const degree = { linear: 1, poly2: 2, poly3: 3 }[kind];
    // Scaled x for a well-conditioned system, the coefficients scaled back.
    const scale = Math.max(...xv.map(Math.abs)) || 1;
    const a = leastSquares(xv.map((x) => Array.from({ length: degree + 1 }, (_, k) => (x / scale) ** k)), yv, call);
    coefficients = a.map((v, k) => {
      const dim = divideDims(y0.dim, powerDim(x0.dim, k));
      const hint = k === 0 ? y0.hint : quotientHint(yHint, x0.hint, k);
      return quantity(v / scale ** k, dim, { ...(hint ? { hint } : {}), ...(k === 0 && y0.absolute ? { absolute: true } : {}) });
    });
    body = coefficients.slice(1).reduce<Expr>((sum, _, i) => bin('+', sum, bin('*', c(i + 1), i === 0 ? p : bin('^', p, { kind: 'number', value: i + 1, span: at }))), c(0));
  } else if (kind === 'exp') {
    const [lnA, b] = leastSquares(xv.map((x) => [1, x]), yv.map(Math.log), call);
    const rate = quotientHint(undefined, x0.hint, 1);
    coefficients = [quantity(Math.exp(lnA!), y0.dim, y0.hint ? { hint: y0.hint } : {}), quantity(b!, divideDims(DIMENSIONLESS, x0.dim), rate ? { hint: rate } : {})];
    body = bin('*', c(0), callOf('exp', bin('*', c(1), p)));
  } else if (kind === 'power') {
    const [lnA, b] = leastSquares(xv.map((x) => [1, Math.log(x / xUnit.si)]), yv.map(Math.log), call);
    coefficients = [quantity(Math.exp(lnA!), y0.dim, y0.hint ? { hint: y0.hint } : {}), quantity(b!)];
    body = bin('*', c(0), bin('^', bin('/', p, u), c(1)));
  } else {
    const [a, b] = leastSquares(xv.map((x) => [1, Math.log(x / xUnit.si)]), yv, call);
    coefficients = [quantity(a!, y0.dim, { ...(y0.hint ? { hint: y0.hint } : {}), ...(y0.absolute ? { absolute: true } : {}) }), quantity(b!, y0.dim, yHint ? { hint: yHint } : {})];
    body = bin('+', c(0), bin('*', c(1), callOf('ln', bin('/', p, u))));
  }

  const captured = new Map<string, Value>(coefficients.map((q, i) => [`${COEFFICIENT}${i}`, q]));
  captured.set(`${COEFFICIENT}u`, xUnit);
  const fitted: FunctionValue = { type: 'function', name: 'fit', params: [param], body, captured };
  // R² on the data as measured, with the fitted function.
  const predicted = xv.map((x) => predict(kind, coefficients.map((q) => q.si), x, xUnit.si));
  const mean = yv.reduce((s, v) => s + v, 0) / yv.length;
  const total = yv.reduce((s, v) => s + (v - mean) ** 2, 0);
  const residual = yv.reduce((s, v, i) => s + (v - predicted[i]!) ** 2, 0);
  const fit: FitInfo = {
    kind,
    param,
    coefficients: coefficients.map((value, i) => ({ name: `${COEFFICIENT}${i}`, value })),
    r2: total > 0 ? 1 - residual / total : 1,
    points: xv.length,
  };
  return { ...fitted, fit };
}

function predict(kind: FitKind, c: readonly number[], x: number, unit: number): number {
  switch (kind) {
    case 'exp':
      return c[0]! * Math.exp(c[1]! * x);
    case 'power':
      return c[0]! * (x / unit) ** c[1]!;
    case 'log':
      return c[0]! + c[1]! * Math.log(x / unit);
    default:
      return c.reduce((s, ck, k) => s + ck * x ** k, 0);
  }
}

function series(value: Value, span: Parameters<typeof fail>[1]): Quantity[] {
  if (value.type !== 'vector') return fail('E-TYPE', span, { expected: 'vector', found: value.type === 'quantity' ? 'number' : value.type });
  return [...value.items];
}

/** The unit of a slope: y per x^k (°C/s, mm/s²); a difference for an absolute temperature. */
function quotientHint(y: ResolvedUnit | undefined, x: ResolvedUnit | undefined, k: number): ResolvedUnit | undefined {
  if (!x || x.offset !== undefined) return undefined;
  const power = k === 1 ? x.symbol : `${/[·/]/.test(x.symbol) ? `(${x.symbol})` : x.symbol}${'⁰¹²³⁴⁵⁶⁷⁸⁹'[k]}`;
  // The terms put together where they read: m/s² per s is m/s³, not m/s²/s.
  const ty = y ? unitTerms(y.symbol) : new Map<string, number>();
  const tx = unitTerms(x.symbol);
  let symbol = y ? `${y.symbol}/${power}` : `1/${power}`;
  if (ty && tx) {
    const terms = new Map(ty);
    for (const [name, e] of tx) terms.set(name, (terms.get(name) ?? 0) - k * e);
    for (const [name, e] of terms) if (e === 0) terms.delete(name);
    if (terms.size > 0) symbol = formatTerms(terms);
  }
  const dim = divideDims(y?.dim ?? DIMENSIONLESS, powerDim(x.dim, k));
  return { symbol, factor: (y?.factor ?? 1) / x.factor ** k, dim };
}

function deltaOf(hint: ResolvedUnit | undefined): ResolvedUnit | undefined {
  if (!hint || hint.offset === undefined) return hint;
  return { symbol: hint.delta ?? hint.symbol, factor: hint.factor, dim: hint.dim };
}

/** min ‖A·a − y‖ by the normal equations (small systems, scaled columns). */
function leastSquares(rows: readonly (readonly number[])[], y: readonly number[], call: CallExpr): number[] {
  const n = rows[0]!.length;
  const m = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  rows.forEach((row, r) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) m[i]![j]! += row[i]! * row[j]!;
      m[i]![n]! += row[i]! * y[r]!;
    }
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-300) fail('E-FIT-SINGULAR', call.span);
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let k = col; k <= n; k++) m[r]![k]! -= f * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}
