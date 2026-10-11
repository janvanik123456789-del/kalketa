/**
 * Differential equations with their conditions (docs/03-jazyk.md, ch. 9.2):
 *
 *   solve w(x): E·I·w″ == −M(x) in 0 m .. L
 *       w(0 m) == 0 m
 *       w(L) == 0 m
 *
 * An equation of order n in the unknown function (w′, w″, w‴, w⁗) and n
 * conditions on the function or its derivatives anywhere in the interval
 * (a support: w = 0; a fixed end: w = 0 and w′ = 0). The equation is solved
 * for its highest derivative (it is taken as linear in it), then integrated
 * with Runge–Kutta of the 4th order on a fixed grid; the values at the start
 * that the conditions leave open are found by shooting: Newton's method on
 * the conditions, which for a linear equation (a beam) is exact in one step.
 * The result is a function: w(x) and its derivatives w′(x), w″(x) … between
 * the grid points by cubic Hermite interpolation.
 */

import { fail, type Span } from '../diagnostics.js';
import type { Equation, Expr, Statement } from '../lang/ast.js';
import { divideDims, multiplyDims, powerDim, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type FunctionValue, type Quantity, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import type { EvalContext } from './evaluator.js';

type SolveStatement = Extract<Statement, { kind: 'solve' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

/** Steps of the grid: enough for the smooth curves of mechanics, a kink of M(x) included. */
export const ODE_STEPS = 200;
const MAX_NEWTON = 25;

/** The name under which the equation reads the k-th derivative of the unknown: w″ -> w″ (w and k primes). */
export function primeName(name: string, order: number): string {
  return name + '′'.repeat(order);
}

/** What the print says about a solution: its order, interval and steps. */
export interface OdeInfo {
  readonly order: number;
  readonly low: Quantity;
  readonly high: Quantity;
  readonly steps: number;
}

interface Condition {
  readonly order: number;
  readonly at: number;
  readonly value: number;
  readonly span: Span;
}

/** The highest derivative of `name` an expression reads (0: none). */
function orderIn(expr: Expr, name: string): number {
  let order = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const e = node as { kind?: string; name?: string; order?: number; arg?: unknown };
    if (e.kind === 'prime' && e.name === name && e.arg === undefined) order = Math.max(order, e.order ?? 0);
    for (const [key, value] of Object.entries(node)) if (key !== 'span') walk(value);
  };
  walk(expr);
  return order;
}

/** A condition: w(a) == v or w′(a) == v (either side), at a point; its order and both sides. */
function conditionOf(equation: Equation, name: string): { order: number; at: Expr; value: Expr } | undefined {
  const point = (e: Expr): { order: number; at: Expr } | undefined => {
    if (e.kind === 'call' && e.name === name && e.args.length === 1 && e.named.length === 0) return { order: 0, at: e.args[0]! };
    if (e.kind === 'prime' && e.name === name && e.arg) return { order: e.order, at: e.arg };
    return undefined;
  };
  const left = point(equation.left);
  if (left) return { ...left, value: equation.right };
  const right = point(equation.right);
  if (right) return { ...right, value: equation.left };
  return undefined;
}

export function solveOde(statement: SolveStatement, ctx: EvalContext, evaluate: Evaluate): { fn: FunctionValue; info: OdeInfo } {
  const name = statement.unknowns[0]!.name;
  const variable = statement.ode!.variable;
  if (!statement.range) return fail('E-ODE-RANGE', statement.span, { name });
  const low = asQuantity(evaluate(statement.range.low, ctx), statement.range.low.span);
  const high = asQuantity(evaluate(statement.range.high, ctx), statement.range.high.span);
  if (!sameDim(low.dim, high.dim)) fail('E-UNIT-MISMATCH', statement.range.high.span, { operator: '..', left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
  if (!(high.si > low.si)) fail('E-ODE-RANGE', statement.range.low.span, { name });
  const dimX = low.dim;

  // The equation is the one that reads a derivative; the others are its conditions.
  const equations = statement.equations.map((e) => ({ e, order: Math.max(orderIn(e.left, name), orderIn(e.right, name)) }));
  const differential = equations.filter((x) => x.order > 0);
  if (differential.length !== 1) return fail('E-ODE-FORM', statement.span, { name });
  const { e: equation, order: n } = differential[0]!;
  const raw = equations.filter((x) => x.order === 0).map((x) => ({ x, c: conditionOf(x.e, name) }));
  const wrong = raw.find((r) => !r.c);
  if (wrong) return fail('E-ODE-CONDITION', wrong.x.e.span, { name });
  if (raw.length !== n) return fail('E-ODE-CONDITIONS', statement.span, { name, order: n, found: raw.length });

  // The dimension of the unknown from its conditions: w(0) = 0 m gives metres, w′(0) = 0 a ratio to x.
  let dimW: Dimension | undefined;
  const conditions: Condition[] = raw.map(({ x, c }) => {
    const at = asQuantity(evaluate(c!.at, ctx), c!.at.span);
    if (!sameDim(at.dim, dimX)) fail('E-UNIT-MISMATCH', c!.at.span, { operator: '(', left: baseUnitSymbol(at.dim), right: baseUnitSymbol(dimX) });
    if (at.si < low.si - 1e-12 * (high.si - low.si) || at.si > high.si + 1e-12 * (high.si - low.si)) fail('E-ODE-POINT', c!.at.span, { name });
    const value = asQuantity(evaluate(c!.value, ctx), c!.value.span);
    const own = multiplyDims(value.dim, powerDim(dimX, c!.order));
    if (!dimW) dimW = own;
    else if (!sameDim(dimW, own)) fail('E-UNIT-MISMATCH', x.e.span, { operator: '==', left: baseUnitSymbol(dimW), right: baseUnitSymbol(own) });
    return { order: c!.order, at: at.si, value: value.si, span: x.e.span };
  });
  const dimOf = (k: number) => divideDims(dimW!, powerDim(dimX, k));

  // The highest derivative from the equation, at x with the lower ones y[0..n-1]: the equation is taken
  // as linear in it, its value where left − right is zero (two trials: 0 and 1).
  // The factor of the highest derivative depends on x alone in a linear equation (E·I(x)·w″): the
  // runs of the shooting after the first take it from there, one evaluation less a point; the last
  // run works it out afresh and checks it (an equation where it does not hold goes on without it).
  const factors = new Map<number, number>();
  let reuse = false;
  let mismatch = false;
  const highest = (x: number, y: readonly number[]): number => {
    const at = (trial: number): Quantity => {
      const inner: EvalContext = {
        ...ctx,
        warnings: [],
        lookup: (asked: string, span: Span): Value => {
          if (asked === variable) return quantity(x, dimX);
          for (let k = 0; k <= n; k++) if (asked === primeName(name, k)) return quantity(k < n ? y[k]! : trial, dimOf(k));
          return ctx.lookup(asked, span);
        },
      };
      const left = asQuantity(evaluate(equation.left, inner), equation.left.span);
      const right = asQuantity(evaluate(equation.right, inner), equation.right.span);
      if (!sameDim(left.dim, right.dim)) fail('E-UNIT-MISMATCH', equation.span, { operator: '==', left: baseUnitSymbol(left.dim), right: baseUnitSymbol(right.dim) });
      return quantity(left.si - right.si, left.dim);
    };
    const g0 = at(0).si;
    const known = factors.get(x);
    if (reuse && known !== undefined) return -g0 / known;
    const factor = at(1).si - g0;
    if (factor === 0) fail('E-ODE-FORM', equation.span, { name });
    if (known !== undefined && Math.abs(known - factor) > 1e-9 * Math.abs(factor)) mismatch = true;
    factors.set(x, factor);
    return -g0 / factor;
  };

  const a = low.si;
  const h = (high.si - a) / ODE_STEPS;
  /** The state along the grid from the values at the start; with each point its highest derivative. */
  const integrate = (start: readonly number[]): { ys: number[][]; ds: number[] } => {
    const f = (x: number, y: readonly number[]): number[] => [...y.slice(1), highest(x, y)];
    const ys: number[][] = [[...start]];
    const ds: number[] = [];
    let y = [...start];
    for (let i = 0; i < ODE_STEPS; i++) {
      const x = a + i * h;
      const k1 = f(x, y);
      ds.push(k1[n - 1]!);
      const k2 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k1[j]!));
      const k3 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k2[j]!));
      const k4 = f(x + h, y.map((v, j) => v + h * k3[j]!));
      y = y.map((v, j) => v + (h / 6) * (k1[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!));
      if (!y.every(Number.isFinite)) fail('E-NOT-FINITE', equation.span);
      ys.push([...y]);
    }
    ds.push(highest(a + ODE_STEPS * h, y));
    return { ys, ds };
  };
  /** The k-th derivative at x between the grid points: cubic Hermite from it and the next one. */
  const sample = (grid: { ys: number[][]; ds: number[] }, k: number, x: number): number => {
    const i = Math.min(ODE_STEPS - 1, Math.max(0, Math.floor((x - a) / h)));
    const t = (x - (a + i * h)) / h;
    const value = (j: number) => grid.ys[j]![k]!;
    const slope = (j: number) => (k + 1 < n ? grid.ys[j]![k + 1]! : grid.ds[j]!);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * value(i) + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * value(i + 1) + (t3 - t2) * h * slope(i + 1);
  };
  const derivativeAt = (grid: { ys: number[][]; ds: number[] }, k: number, x: number): number => {
    if (k < n) return sample(grid, k, x);
    // The highest derivative itself: between its values at the grid points.
    const i = Math.min(ODE_STEPS - 1, Math.max(0, Math.floor((x - a) / h)));
    const t = (x - (a + i * h)) / h;
    return grid.ds[i]! * (1 - t) + grid.ds[i + 1]! * t;
  };

  // Shooting: the values at the start that make every condition hold.
  const residuals = (start: readonly number[]) => {
    const grid = integrate(start);
    return { grid, r: conditions.map((c) => derivativeAt(grid, c.order, c.at) - c.value) };
  };
  let start = new Array<number>(n).fill(0);
  let current = residuals(start);
  reuse = true;
  const scale = (grid: { ys: number[][] }) => Math.max(1e-300, ...conditions.map((c) => Math.abs(c.value)), ...grid.ys.map((y) => Math.abs(y[0]!)));
  let converged = false;
  for (let iteration = 0; iteration < MAX_NEWTON; iteration++) {
    const size = scale(current.grid);
    if (current.r.every((r) => Math.abs(r) <= 1e-9 * size)) {
      converged = true;
      break;
    }
    const jacobian = start.map((p, j) => {
      const step = 1e-3 * Math.max(Math.abs(p), 1e-6);
      const moved = [...start];
      moved[j] = p + step;
      const r = residuals(moved).r;
      return r.map((v, i) => (v - current.r[i]!) / step);
    });
    // Columns per start value: J[i][j] = ∂r_i/∂p_j.
    const matrix = conditions.map((_, i) => start.map((__, j) => jacobian[j]![i]!));
    const delta = solveLinear(matrix, current.r.map((v) => -v));
    if (!delta) return fail('E-ODE-CONDITIONS', statement.span, { name, order: n, found: conditions.length });
    start = start.map((p, j) => p + delta[j]!);
    // The run that gives the solution works its factors out afresh.
    reuse = false;
    current = residuals(start);
    if (mismatch) factors.clear();
    reuse = !mismatch;
  }
  if (!converged) {
    const size = scale(current.grid);
    if (!current.r.every((r) => Math.abs(r) <= 1e-7 * size)) fail('E-SOLVE-NO-CONVERGENCE', statement.span, {});
  }
  const grid = current.grid;
  const inside = (q: Value, span: Span): number => {
    const x = asQuantity(q, span);
    if (!sameDim(x.dim, dimX)) fail('E-UNIT-MISMATCH', span, { operator: '(', left: baseUnitSymbol(x.dim), right: baseUnitSymbol(dimX) });
    const slack = 1e-9 * (high.si - a);
    if (x.si < a - slack || x.si > high.si + slack) fail('E-DOMAIN', span, { function: name });
    return Math.min(high.si, Math.max(a, x.si));
  };
  const fn: FunctionValue = {
    type: 'function',
    name,
    params: [variable],
    body: { kind: 'variable', name: variable, span: statement.span },
    captured: new Map(),
    native: (args, span) => quantity(sample(grid, 0, inside(args[0]!, span)), dimW!),
    derivative: (order, arg, span) => {
      if (order > n) fail('E-ODE-ORDER', span, { name, order: n });
      return quantity(derivativeAt(grid, order, inside(arg, span)), dimOf(order));
    },
  };
  return { fn, info: { order: n, low, high, steps: ODE_STEPS } };
}

/** Gaussian elimination with partial pivoting; undefined when the matrix is singular. */
function solveLinear(matrix: number[][], rhs: number[]): number[] | undefined {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    const size = Math.max(...m.map((row) => Math.abs(row[col]!)));
    if (!(Math.abs(m[pivot]![col]!) > 1e-14 * size) || size === 0) return undefined;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const top = m[col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const row = m[r]!;
      const factor = row[col]! / top[col]!;
      for (let c = col; c <= n; c++) row[c] = row[c]! - factor * top[c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

