/**
 * Fitting a curve through measured points (docs/03-jazyk.md, ch. 7.1f):
 *
 *   T_fit := fit(Mereni.T, x: Mereni.t, kind: "linear")
 *   T_fit(45 s)                                  the fitted curve at 45 s
 *
 *   P := polyfit(Mereni.t, Mereni.T, 4)          the same as MATLAB and NumPy name it
 *
 * Least squares. Kinds: linear (a + b·x), poly2 … poly10 (polynomials),
 * exp (a·e^(b·x)), power (a·x^b) and log (a + b·ln x); exp, power and log
 * are fitted on logarithms. The result is a function of one variable, named
 * after the column of x (t), with the coefficients and their units kept, so
 * the print shows its equation with numbers, and R².
 */

import { diagnostic, fail } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { DIMENSIONLESS, divideDims, multiplyDims, powerDim, sameDim } from '../units/dimension.js';
import { formatTerms, unitTerms } from '../units/compose.js';
import { baseUnitSymbol } from '../units/display.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type FunctionValue, type Quantity, type Value } from '../values/value.js';
import type { EvalContext } from './evaluator.js';
import { applyFunction } from './userFunctions.js';

type Evaluate = (expr: Expr, ctx: EvalContext) => Value;
type CallExpr = Extract<Expr, { kind: 'call' }>;

/** Kinds of curve by name; a polynomial of degree 2 … 10 is poly2 … poly10, one of degree 1 is linear. */
export type FitKind = 'linear' | 'exp' | 'power' | 'log' | `poly${number}`;
/** The highest degree of a polynomial fitted (higher ones swing between the points and lose digits). */
export const MAX_DEGREE = 10;
const KIND_LIST = `linear, poly2 … poly${MAX_DEGREE}, exp, power, log`;

/** The kind a name stands for ("poly4"), undefined for no kind. */
export function fitKindOf(name: string): FitKind | undefined {
  if (name === 'linear' || name === 'exp' || name === 'power' || name === 'log') return name;
  const degree = Number(/^poly(\d+)$/.exec(name)?.[1]);
  return degree >= 2 && degree <= MAX_DEGREE ? `poly${degree}` : undefined;
}

/** The degree of a polynomial kind (a line is one of degree 1); undefined for the kinds fitted on logarithms. */
export function degreeOf(kind: FitKind): number | undefined {
  return kind === 'linear' ? 1 : kind.startsWith('poly') ? Number(kind.slice(4)) : undefined;
}

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
  /**
   * x an absolute temperature: the zero of its unit (0 °C). The curve is fitted on the reading,
   * c0 + c1·(T − 0 °C) + …, so the coefficients are those of the reading in °C.
   */
  readonly zero?: Quantity;
  /**
   * steps: true on a straight line or a polynomial — the method written out as on paper: the sums
   * over the points, then for a line b₁ = (n·Σx·y − Σx·Σy)/(n·Σx² − (Σx)²) and b₀ = (Σy − b₁·Σx)/n,
   * for a polynomial the normal equations Σⱼ bⱼ·Σx^(i+j) = Σx^i·y with their numbers.
   */
  readonly steps?: {
    /** Names of the columns, as the sums are written: Σt·a. */
    readonly x: string;
    readonly y: string;
    /** Σx^k for k = 0 … 2·degree (k = 0 is n). */
    readonly powers: readonly Quantity[];
    /** Σx^k·y for k = 0 … degree (k = 0 is Σy). */
    readonly withY: readonly Quantity[];
    /**
     * The kinds fitted on logarithms, made a straight line first: ln y = b₀ + b₁·x (exp), ln y = b₀ + b₁·ln x
     * (power), y = b₀ + b₁·ln x (log). Which of x and y are taken as ln (of their value in their own unit), and
     * the line found; the sums above are then those of ln x and ln y.
     */
    readonly linearized?: { readonly x: boolean; readonly y: boolean; readonly b0: Quantity; readonly b1: Quantity };
  };
}

/** Name of a coefficient inside the fitted function (never written by a user). */
const COEFFICIENT = '\u0000c';

export function fitCall(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): FunctionValue {
  const xArg = call.named.find((n) => n.name === 'x');
  const kindArg = call.named.find((n) => n.name === 'kind');
  const extra = call.named.find((n) => n.name !== 'x' && n.name !== 'kind' && n.name !== 'steps');
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: 'fit', argument: extra.name, problem: 'unknown' });
  if (call.args.length !== 1 || !xArg) return fail('E-FIT-FORM', call.span);
  const kindValue = kindArg ? evaluate(kindArg.value, ctx) : { type: 'text' as const, value: 'linear' };
  const kind = kindValue.type === 'text' ? fitKindOf(kindValue.value) : undefined;
  if (!kind) return fail('E-FIT-KIND', kindArg?.value.span ?? call.span, { kind: kindValue.type === 'text' ? kindValue.value : '', kinds: KIND_LIST });
  return fitPoints(call, call.args[0]!, xArg.value, kind, false, ctx, evaluate);
}

/**
 * polyfit(x, y, n): the least squares polynomial of degree n, as MATLAB and NumPy name it.
 * A function of the sheet, not bare coefficients; n + 1 points give the polynomial through them all.
 */
export function polyfitCall(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): FunctionValue {
  const extra = call.named.find((n) => n.name !== 'steps');
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: 'polyfit', argument: extra.name, problem: 'unknown' });
  if (call.args.length !== 3) return fail('E-FUNC-ARITY', call.span, { function: 'polyfit', expected: 3, found: call.args.length });
  const n = evaluate(call.args[2]!, ctx);
  const degree = n.type === 'quantity' && Object.keys(n.dim).length === 0 && !n.im ? n.si : NaN;
  if (!Number.isInteger(degree) || degree < 1 || degree > MAX_DEGREE) return fail('E-POLYFIT-DEGREE', call.args[2]!.span, { most: MAX_DEGREE });
  return fitPoints(call, call.args[1]!, call.args[0]!, degree === 1 ? 'linear' : `poly${degree}`, true, ctx, evaluate);
}

/**
 * polyval(p, x): a polynomial at x. p is a function of the sheet (from polyfit) or, as in MATLAB,
 * a series of coefficients from the highest power down: polyval([1, 0, -2], 3) = 7. x may be a series.
 */
export function polyvalCall(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const extra = call.named[0];
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: 'polyval', argument: extra.name, problem: 'unknown' });
  if (call.args.length !== 2) return fail('E-FUNC-ARITY', call.span, { function: 'polyval', expected: 2, found: call.args.length });
  const p = evaluate(call.args[0]!, ctx);
  if (p.type === 'function') return applyFunction(p, { ...call, name: p.name, args: [call.args[1]!] }, ctx, evaluate);
  if (p.type !== 'vector') return fail('E-TYPE', call.args[0]!.span, { expected: 'vector', found: p.type === 'quantity' ? 'number' : p.type });
  // Horner's rule written as an expression of the sheet, so the units of the coefficients and x go through.
  const at = call.span;
  const v = (name: string): Expr => ({ kind: 'variable', name, span: at });
  const horner = p.items.slice(1).reduce<Expr>(
    (acc, _, i) => ({ kind: 'binary', operator: '+', left: { kind: 'binary', operator: '*', left: acc, right: v(`${COEFFICIENT}x`), span: at }, right: v(`${COEFFICIENT}${i + 1}`), span: at }),
    v(`${COEFFICIENT}0`),
  );
  const x = evaluate(call.args[1]!, ctx);
  const valueAt = (point: Value): Value =>
    evaluate(horner, {
      ...ctx,
      lookup: (name, span) => (name === `${COEFFICIENT}x` ? point : name.startsWith(COEFFICIENT) ? p.items[Number(name.slice(COEFFICIENT.length))]! : ctx.lookup(name, span)),
    });
  if (x.type === 'vector') return { type: 'vector', items: x.items.map((q) => valueAt(q) as Quantity) };
  return valueAt(x);
}

/** The fit of the points y over x; exact: as many points as coefficients will do (a curve through them all). */
function fitPoints(call: CallExpr, yExpr: Expr, xExpr: Expr, kind: FitKind, exact: boolean, ctx: EvalContext, evaluate: Evaluate): FunctionValue {
  const stepsArg = call.named.find((n) => n.name === 'steps');
  const stepsValue = stepsArg ? evaluate(stepsArg.value, ctx) : undefined;
  if (stepsValue && stepsValue.type !== 'boolean') return fail('E-TYPE', stepsArg!.value.span, { expected: 'boolean', found: stepsValue.type });
  const steps = stepsValue?.type === 'boolean' && stepsValue.value;
  // The method written out is that of a line or a polynomial; the kinds fitted on logarithms as a line of ln.
  const degree = degreeOf(kind);
  const ys = series(evaluate(yExpr, ctx), yExpr.span);
  const xs = series(evaluate(xExpr, ctx), xExpr.span);
  if (xs.length !== ys.length) fail('E-PLOT-LENGTH', call.span, {});
  const needed = (degree ?? 1) + 1 + (exact ? 0 : 1);
  if (xs.length < needed) fail('E-FIT-POINTS', call.span, { needed, found: xs.length });
  for (const list of [xs, ys]) {
    const other = list.find((q) => !sameDim(q.dim, list[0]!.dim));
    if (other) fail('E-UNIT-MISMATCH', call.span, { operator: ',', left: baseUnitSymbol(list[0]!.dim), right: baseUnitSymbol(other.dim) });
  }
  const x0 = xs[0]!;
  const y0 = ys[0]!;
  // An absolute temperature (°C, °F) is fitted on its reading, from the zero of its unit: the polynomial
  // printed is then the one a reader evaluates with 37 for 37 °C, and T − 0 °C is a difference, no product
  // of an absolute temperature. A logarithm of a reading in °C means nothing: such x goes into kelvin first.
  const zero = x0.absolute ? quantity(x0.hint?.offset ?? 0, x0.dim, { absolute: true, ...(x0.hint ? { hint: x0.hint } : {}) }) : undefined;
  if (zero && (kind === 'power' || kind === 'log')) fail('E-FIT-ABS-X', xExpr.span, { kind, name: xExpr.kind === 'member' || xExpr.kind === 'variable' ? xExpr.name : 'x' });
  // The unit of x in the units of the coefficients: kΩ/°C, a difference.
  const xHint: ResolvedUnit | undefined = zero && x0.hint ? { symbol: x0.hint.symbol, factor: x0.hint.factor, dim: x0.hint.dim } : x0.hint;
  // The logarithmic kinds work on x in its own unit (ln of 20 s is ln 20).
  const xUnit: Quantity = quantity(x0.hint?.factor ?? 1, x0.dim, x0.hint ? { hint: x0.hint } : {});
  const xv = xs.map((q) => q.si - (zero?.si ?? 0));
  const yv = ys.map((q) => q.si);
  if ((kind === 'exp' || kind === 'power') && yv.some((v) => v <= 0)) fail('E-FIT-POSITIVE', yExpr.span, { kind });
  if ((kind === 'power' || kind === 'log') && xv.some((v) => v <= 0)) fail('E-FIT-POSITIVE', xExpr.span, { kind });

  const param = xExpr.kind === 'member' ? xExpr.name : xExpr.kind === 'variable' ? xExpr.name : 'x';
  const at = call.span;
  const c = (i: number): Expr => ({ kind: 'variable', name: `${COEFFICIENT}${i}`, span: at });
  const bin = (operator: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({ kind: 'binary', operator, left, right, span: at });
  const variable: Expr = { kind: 'variable', name: param, span: at };
  const p: Expr = zero ? bin('-', variable, { kind: 'variable', name: `${COEFFICIENT}z`, span: at }) : variable;
  const u: Expr = { kind: 'variable', name: `${COEFFICIENT}u`, span: at };
  const callOf = (name: string, arg: Expr): Expr => ({ kind: 'call', name, args: [arg], named: [], span: at });

  let coefficients: Quantity[];
  let body: Expr;
  // Slopes of an absolute temperature are differences: °C/s, not an absolute °C.
  const yHint = deltaOf(y0.hint);
  if (degree !== undefined) {
    // x centred and scaled to −1 … 1 for a well-conditioned system (temperatures in K, high degrees),
    // the coefficients turned back to powers of x: Σ aⱼ·((x − mid)/half)^j = Σ cₖ·x^k.
    const [lo, hi] = [Math.min(...xv), Math.max(...xv)];
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2 || 1;
    const a = leastSquares(xv.map((x) => Array.from({ length: degree + 1 }, (_, k) => ((x - mid) / half) ** k)), yv, call);
    const powers = a.map((_, k) => a.reduce((sum, aj, j) => (j < k ? sum : sum + (aj * binomial(j, k) * (-mid) ** (j - k)) / half ** j), 0));
    coefficients = powers.map((v, k) => {
      const dim = divideDims(y0.dim, powerDim(x0.dim, k));
      const hint = k === 0 ? y0.hint : quotientHint(yHint, xHint, k);
      return quantity(v, dim, { ...(hint ? { hint } : {}), ...(k === 0 && y0.absolute ? { absolute: true } : {}) });
    });
    body = coefficients.slice(1).reduce<Expr>((sum, _, i) => bin('+', sum, bin('*', c(i + 1), i === 0 ? p : bin('^', p, { kind: 'number', value: i + 1, span: at }))), c(0));
  } else if (kind === 'exp') {
    const [lnA, b] = leastSquares(xv.map((x) => [1, x]), yv.map(Math.log), call);
    const rate = quotientHint(undefined, xHint, 1);
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
  if (zero) captured.set(`${COEFFICIENT}z`, zero);
  const fitted: FunctionValue = { type: 'function', name: 'fit', params: [param], body, captured };
  // R² on the data as measured, with the fitted function.
  const predicted = xv.map((x) => predict(kind, coefficients.map((q) => q.si), x, xUnit.si));
  const mean = yv.reduce((s, v) => s + v, 0) / yv.length;
  const total = yv.reduce((s, v) => s + (v - mean) ** 2, 0);
  const residual = yv.reduce((s, v, i) => s + (v - predicted[i]!) ** 2, 0);
  const yName = yExpr.kind === 'member' ? yExpr.name : yExpr.kind === 'variable' ? yExpr.name : 'y';
  const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);
  const fit: FitInfo = {
    ...fitBase(),
    ...(steps && degree === undefined ? { steps: linearSteps() } : {}),
  };
  return { ...fitted, fit };

  /** The steps of a kind fitted on logarithms: the sums of ln x and ln y (in their own units) and the line. */
  function linearSteps(): NonNullable<FitInfo['steps']> {
    const lnX = kind !== 'exp';
    const lnY = kind !== 'log';
    const yUnit = y0.hint?.factor ?? 1;
    const X = lnX ? xv.map((x) => Math.log(x / xUnit.si)) : xv;
    const Y = lnY ? yv.map((y) => Math.log(y / yUnit)) : yv;
    const xDim = (k: number) => (lnX ? DIMENSIONLESS : powerDim(x0.dim, k));
    const yDim = lnY ? DIMENSIONLESS : y0.dim;
    const powers = [0, 1, 2].map((k) => quantity(sum(X.map((x) => x ** k)), xDim(k), k === 1 && !lnX && xHint ? { hint: xHint } : {}));
    const withY = [0, 1].map((k) => quantity(sum(X.map((x, i) => x ** k * Y[i]!)), multiplyDims(xDim(k), yDim), k === 0 && !lnY && yHint ? { hint: yHint } : {}));
    const [n, sx, sxx, sy, sxy] = [X.length, powers[1]!.si, powers[2]!.si, withY[0]!.si, withY[1]!.si];
    const b1 = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const b0 = (sy - b1 * sx) / n;
    return {
      x: param,
      y: yName,
      powers,
      withY,
      linearized: { x: lnX, y: lnY, b0: lnY ? quantity(b0) : coefficients[0]!, b1: coefficients[1]! },
    };
  }

  function fitBase(): FitInfo {
    return {
      kind,
      param,
      coefficients: coefficients.map((value, i) => ({ name: `${COEFFICIENT}${i}`, value })),
      r2: total > 0 ? 1 - residual / total : 1,
      points: xv.length,
      ...(zero ? { zero } : {}),
      ...(steps && degree !== undefined
        ? {
            steps: {
              x: param,
              y: yName,
              powers: Array.from({ length: 2 * degree + 1 }, (_, k) =>
                quantity(sum(xv.map((x) => x ** k)), powerDim(x0.dim, k), k === 1 && xHint ? { hint: xHint } : {}),
              ),
              withY: Array.from({ length: degree + 1 }, (_, k) =>
                quantity(sum(xv.map((x, i) => x ** k * yv[i]!)), multiplyDims(powerDim(x0.dim, k), y0.dim), k === 0 && yHint ? { hint: yHint } : {}),
              ),
            },
          }
        : {}),
    };
  }
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
  const power = k === 1 ? x.symbol : `${/[·/]/.test(x.symbol) ? `(${x.symbol})` : x.symbol}${[...String(k)].map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]).join('')}`;
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

/**
 * min ‖A·a − y‖ by Householder reflections (QR): stable where the normal equations would square
 * the condition of the system (polynomials of high degree). The print still shows the normal equations.
 */
function leastSquares(rows: readonly (readonly number[])[], y: readonly number[], call: CallExpr): number[] {
  const m = rows.length;
  const n = rows[0]!.length;
  const r = rows.map((row) => [...row]);
  const b = [...y];
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += r[i]![k]! ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) fail('E-FIT-SINGULAR', call.span);
    const alpha = r[k]![k]! > 0 ? -norm : norm;
    const v = r.slice(k).map((row) => row[k]!);
    v[0]! -= alpha;
    const vv = v.reduce((sum, e) => sum + e * e, 0);
    if (vv === 0) continue;
    const reflect = (column: (i: number) => number, set: (i: number, value: number) => void) => {
      let dot = 0;
      for (let i = k; i < m; i++) dot += v[i - k]! * column(i);
      const f = (2 * dot) / vv;
      for (let i = k; i < m; i++) set(i, column(i) - f * v[i - k]!);
    };
    for (let j = k; j < n; j++) reflect((i) => r[i]![j]!, (i, value) => (r[i]![j] = value));
    reflect((i) => b[i]!, (i, value) => (b[i] = value));
  }
  // Points that leave a coefficient undetermined (all x equal, fewer distinct x than coefficients).
  const largest = Math.max(...r.slice(0, n).map((row, i) => Math.abs(row[i]!)));
  const a = new Array<number>(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    if (Math.abs(r[k]![k]!) <= largest * 1e-13) fail('E-FIT-SINGULAR', call.span);
    let sum = b[k]!;
    for (let j = k + 1; j < n; j++) sum -= r[k]![j]! * a[j]!;
    a[k] = sum / r[k]![k]!;
  }
  return a;
}

function binomial(n: number, k: number): number {
  let value = 1;
  for (let i = 1; i <= k; i++) value = (value * (n - k + i)) / i;
  return value;
}
