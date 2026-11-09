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
 * with Runge–Kutta of the 4th order. Conditions all at one point give the
 * curve directly, going out from that point both ways; otherwise the values
 * at the start that the conditions leave open are found by shooting: Newton's
 * method on the conditions, which for a linear equation (a beam) is exact in
 * one step. The grid is uniform, its steps doubled until the curve no longer
 * changes; what does not settle comes with a warning.
 * The result is a function: w(x) and its derivatives w′(x), w″(x) … between
 * the grid points by cubic Hermite interpolation.
 */

import { CalcError, diagnostic, fail, type Span } from '../diagnostics.js';
import type { Equation, Expr, Statement } from '../lang/ast.js';
import { divideDims, multiplyDims, powerDim, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol, toDisplay } from '../units/display.js';
import { quantity, type FunctionValue, type Quantity, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import type { EvalContext } from './evaluator.js';
import { withBareZero } from './zero.js';
import { eigenvalues, type C } from '../functions/general.js';

type SolveStatement = Extract<Statement, { kind: 'solve' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

/** Steps of the first grid; doubled until the curve no longer changes (see the end of solveOde). */
export const ODE_STEPS = 200;
const MAX_ODE_STEPS = 3200;
/** How far the classical Runge–Kutta method stays stable along the negative real axis: h·|λ| ≤ 2.785. */
const RK4_STABILITY = 2.78;
/** The change of a curve at which the doubling stops, and the largest one a result stands without a warning. */
const ODE_TOLERANCE = 1e-6;
const ODE_ACCEPTABLE = 1e-4;
const MAX_NEWTON = 25;
/** What says that the curve reached a point without a value. */
const UNDEFINED_ON_THE_WAY: ReadonlySet<string> = new Set(['E-DIV-ZERO', 'E-DOMAIN', 'E-NOT-FINITE']);

/** The solution on one grid: the curve, the values it set out with, and how the conditions answer to those. */
interface Solved {
  readonly grid: Grid;
  readonly values: number[];
  readonly sensitivity?: number[][];
}

/** A curve along a grid; `left` is the index of the point it set out from. */
interface Grid {
  readonly left: number;
  readonly xs: readonly number[];
  readonly ys: readonly (readonly number[])[];
  readonly ds: readonly number[];
}

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
export function orderIn(expr: Expr, name: string): number {
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
export function conditionOf(equation: Equation, name: string): { order: number; at: Expr; value: Expr } | undefined {
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
  let evaluated = false;
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
      // "m·w″ + k·w == 0": a zero written without a unit is one of the other side's.
      const [left, right] = withBareZero(asQuantity(evaluate(equation.left, inner), equation.left.span), asQuantity(evaluate(equation.right, inner), equation.right.span), equation.left, equation.right);
      if (!sameDim(left.dim, right.dim)) fail('E-UNIT-MISMATCH', equation.span, { operator: '==', left: baseUnitSymbol(left.dim), right: baseUnitSymbol(right.dim) });
      return quantity(left.si - right.si, left.dim);
    };
    const g0 = at(0).si;
    const known = factors.get(x);
    if (reuse && known !== undefined) return -g0 / known;
    const factor = at(1).si - g0;
    // At the first point the equation does not read its highest derivative at all; later the curve reached a point
    // where its factor vanishes ((y − 1)²·y′ at y = 1).
    if (factor === 0) fail(evaluated ? 'E-DIV-ZERO' : 'E-ODE-FORM', equation.span, evaluated ? {} : { name });
    evaluated = true;
    if (known !== undefined && Math.abs(known - factor) > 1e-9 * Math.abs(factor)) mismatch = true;
    factors.set(x, factor);
    return -g0 / factor;
  };

  const a = low.si;
  const b = high.si;
  // All conditions at one point, one for each lower derivative: nothing to search for, the curve goes out from
  // that point both ways. Otherwise (w(0) and w(L)) it goes from the start, the open values found by shooting.
  const atOnePoint = new Set(conditions.map((c) => c.order)).size === n && conditions.every((c) => c.order < n && Math.abs(c.at - conditions[0]!.at) <= 1e-12 * (b - a));
  const origin = atOnePoint ? Math.min(b, Math.max(a, conditions[0]!.at)) : a;
  // Points of the coarsest grid before the origin; every finer grid holds the coarser one's points.
  const before = origin <= a ? 0 : origin >= b ? ODE_STEPS : Math.min(ODE_STEPS - 1, Math.max(1, Math.round((ODE_STEPS * (origin - a)) / (b - a))));

  const where = (x: number): string => {
    const shown = toDisplay(quantity(x, dimX, low.hint ? { hint: low.hint } : {}), ctx.registry);
    return `${variable} = ${Number(shown.value.toPrecision(4))}${shown.unit ? ` ${shown.unit}` : ''}`;
  };
  /** Where the last integration found no value: the step it began at; and the grid it was on. */
  let failedAt = origin;
  let failedGrid: { xs: readonly number[]; ys: readonly (number[] | undefined)[] } | undefined;
  /** The state along a grid from the values at the origin; with each point its highest derivative. */
  const integrate = (steps: number, values: readonly number[]): Grid => {
    const left = before * (steps / ODE_STEPS);
    const xs = Array.from({ length: steps + 1 }, (_, i) => (i <= left ? (left === 0 ? a : a + ((origin - a) * i) / left) : origin + ((b - origin) * (i - left)) / (steps - left)));
    const ys = new Array<number[]>(steps + 1);
    const ds = new Array<number>(steps + 1);
    failedGrid = { xs, ys };
    const f = (x: number, y: readonly number[]): number[] => [...y.slice(1), highest(x, y)];
    /** Runs f where the curve has reached: a point without a value says where, not only what. */
    const along = <T>(x: number, run: () => T): T => {
      try {
        return run();
      } catch (err) {
        if (err instanceof CalcError && UNDEFINED_ON_THE_WAY.has(err.diagnostic.code)) {
          failedAt = x;
          fail('E-ODE-SINGULAR', equation.span, { name, at: where(x) });
        }
        throw err;
      }
    };
    const go = (from: number, to: number) => {
      const [x, y, h] = [xs[from]!, ys[from]!, xs[to]! - xs[from]!];
      const next = along(x, () => {
        const k1 = f(x, y);
        ds[from] = k1[n - 1]!;
        const k2 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k1[j]!));
        const k3 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k2[j]!));
        const k4 = f(x + h, y.map((v, j) => v + h * k3[j]!));
        return y.map((v, j) => v + (h / 6) * (k1[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!));
      });
      if (!next.every(Number.isFinite)) {
        failedAt = x;
        fail('E-ODE-SINGULAR', equation.span, { name, at: where(x) });
      }
      ys[to] = next;
    };
    ys[left] = [...values];
    for (let i = left; i < steps; i++) go(i, i + 1);
    ds[steps] = along(xs[steps]!, () => highest(xs[steps]!, ys[steps]!));
    for (let i = left; i > 0; i--) go(i, i - 1);
    if (left > 0) ds[0] = along(xs[0]!, () => highest(xs[0]!, ys[0]!));
    return { left, xs, ys, ds };
  };
  /** The step of a grid that holds x. */
  const locate = (grid: Grid, x: number): number => {
    const steps = grid.xs.length - 1;
    const found = x < origin ? Math.floor(((x - a) / (origin - a)) * grid.left) : grid.left === steps ? steps - 1 : grid.left + Math.floor(((x - origin) / (b - origin)) * (steps - grid.left));
    return Math.min(steps - 1, Math.max(0, found));
  };
  /** The k-th derivative at x between the grid points: cubic Hermite from it and the next one. */
  const sample = (grid: Grid, k: number, x: number): number => {
    const i = locate(grid, x);
    const h = grid.xs[i + 1]! - grid.xs[i]!;
    const t = (x - grid.xs[i]!) / h;
    const value = (j: number) => grid.ys[j]![k]!;
    const slope = (j: number) => (k + 1 < n ? grid.ys[j]![k + 1]! : grid.ds[j]!);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * value(i) + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * value(i + 1) + (t3 - t2) * h * slope(i + 1);
  };
  const derivativeAt = (grid: Grid, k: number, x: number): number => {
    if (k < n) return sample(grid, k, x);
    // The highest derivative itself: between its values at the grid points.
    const i = locate(grid, x);
    const t = (x - grid.xs[i]!) / (grid.xs[i + 1]! - grid.xs[i]!);
    return grid.ds[i]! * (1 - t) + grid.ds[i + 1]! * t;
  };

  /** Shooting on one grid: the values at the start that make every condition hold. */
  const shoot = (steps: number, from: readonly number[], known?: number[][]): Solved => {
    factors.clear();
    reuse = false;
    mismatch = false;
    const residuals = (values: readonly number[]) => {
      const grid = integrate(steps, values);
      return { grid, r: conditions.map((c) => derivativeAt(grid, c.order, c.at) - c.value) };
    };
    let values = [...from];
    let current = residuals(values);
    reuse = true;
    const scale = (grid: Grid) => Math.max(1e-300, ...conditions.map((c) => Math.abs(c.value)), ...grid.ys.map((y) => Math.abs(y[0]!)));
    let converged = false;
    let sensitivity: number[][] | undefined;
    for (let iteration = 0; iteration < MAX_NEWTON; iteration++) {
      const size = scale(current.grid);
      const holds = current.r.every((r) => Math.abs(r) <= 1e-9 * size);
      // Values taken over from a coarser grid hold within this tolerance, yet not as well as this grid can: one step always.
      if (holds && iteration > 0) {
        converged = true;
        break;
      }
      // On a finer grid the coarser one's sensitivities still point the way: the first step needs no new runs.
      const matrix = known && iteration === 0 ? known : sensitivities(values, current.r, residuals);
      sensitivity = matrix;
      const delta = solveLinear(matrix, current.r.map((v) => -v));
      if (!delta && holds) {
        converged = true;
        break;
      }
      if (!delta) return fail('E-ODE-CONDITIONS', statement.span, { name, order: n, found: conditions.length });
      values = values.map((p, j) => p + delta[j]!);
      // The run that gives the solution works its factors out afresh.
      reuse = false;
      current = residuals(values);
      if (mismatch) factors.clear();
      reuse = !mismatch;
    }
    if (!converged) {
      const size = scale(current.grid);
      if (!current.r.every((r) => Math.abs(r) <= 1e-7 * size)) fail('E-SOLVE-NO-CONVERGENCE', statement.span, {});
    }
    return { grid: current.grid, values, ...(sensitivity ? { sensitivity } : {}) };
  };
  /** One grid: from the conditions directly when they say all at one point, else by shooting. */
  const solveOn = (steps: number, from: readonly number[], known?: number[][]): Solved => {
    if (!atOnePoint) return shoot(steps, from, known);
    factors.clear();
    reuse = false;
    mismatch = false;
    return { grid: integrate(steps, from), values: [...from] };
  };

  // Where to begin: what the conditions say at the origin; a slope from two values of the function (w(0), w(L));
  // what they leave open from zero, which may be a point without a value (u′ == 1/u): then other values.
  const first = new Array<number>(n).fill(0);
  const open = first.map((_, k) => k);
  for (const c of conditions) {
    if (c.order < n && Math.abs(c.at - origin) <= 1e-12 * (b - a)) {
      first[c.order] = c.value;
      open.splice(open.indexOf(c.order), 1);
    }
  }
  const across = conditions.find((c) => c.order === 0 && Math.abs(c.at - origin) > 1e-12 * (b - a));
  if (n > 1 && across && !open.includes(0) && open.includes(1)) first[1] = (across.value - first[0]!) / (across.at - origin);
  /**
   * The first point of the last grid tried where the equation is stiff: a mode that dies away faster than the step
   * can follow, h·|Re λ| past the stability of Runge–Kutta (2.78) for an eigenvalue λ < 0 of ∂f/∂y. A pole
   * (y′ = y², λ = 2y > 0) is none: there the solution grows, it does not die away.
   */
  const stiffPoint = (): number | undefined => {
    if (!failedGrid) return undefined;
    reuse = false;
    return firstStiffPoint(failedGrid, origin, (x, y) => [...y.slice(1), highest(x, y)]);
  };
  const solveFirst = (steps: number): Solved => {
    for (const factor of [0, 1, -1, 0.1, -0.1, 10]) {
      try {
        return solveOn(steps, first.map((v, k) => (factor !== 0 && open.includes(k) ? v + factor : v)));
      } catch (err) {
        if (!(err instanceof CalcError) || err.diagnostic.code !== 'E-ODE-SINGULAR' || open.length === 0) throw err;
      }
    }
    return solveOn(steps, first.map((v, k) => (open.includes(k) ? v - 10 : v)));
  };
  // A curve without a value on the way: on a finer grid too, or only on this one? Where the place moves away with
  // smaller steps (Van der Pol with μ = 10), the steps were too long for the equation, which is stiff: the curve
  // goes on, the method did not. Where it stays (y′ = y² at its pole), the solution itself ends there.
  let solved: Solved | undefined;
  let steps = ODE_STEPS;
  for (;;) {
    try {
      solved = solveFirst(steps);
      break;
    } catch (err) {
      if (!(err instanceof CalcError) || err.diagnostic.code !== 'E-ODE-SINGULAR') throw err;
      if (steps * 2 > MAX_ODE_STEPS) {
        const stiff = stiffPoint();
        if (stiff !== undefined) fail('E-ODE-STIFF', equation.span, { name, at: where(stiff), steps });
        throw err;
      }
      steps *= 2;
    }
  }

  // Twice as many steps until the curve no longer changes: a fast oscillation or a narrow load shows itself so.
  let { grid, values: reached, sensitivity } = solved;
  let difference = Infinity;
  while (steps < MAX_ODE_STEPS && difference > ODE_TOLERANCE) {
    const finer = solveOn(steps * 2, reached, sensitivity);
    const change = gridDifference(grid, finer.grid, n, Math.abs(b - a));
    // Good enough for what is shown and settling slowly (a jump in the load): more steps would only cost time.
    const slowly = change > difference / 8;
    difference = change;
    grid = finer.grid;
    reached = finer.values;
    sensitivity = finer.sensitivity ?? sensitivity;
    steps *= 2;
    if (slowly && difference <= ODE_ACCEPTABLE) break;
  }
  if (difference > ODE_ACCEPTABLE) ctx.warnings.push(diagnostic('W-ODE-ACCURACY', equation.span, { name, steps }));
  const inside = (q: Value, span: Span): number => {
    const x = asQuantity(q, span);
    if (!sameDim(x.dim, dimX)) fail('E-UNIT-MISMATCH', span, { operator: '(', left: baseUnitSymbol(x.dim), right: baseUnitSymbol(dimX) });
    const slack = 1e-9 * (b - a);
    if (x.si < a - slack || x.si > b + slack) fail('E-DOMAIN', span, { function: name });
    return Math.min(b, Math.max(a, x.si));
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
  return { fn, info: { order: n, low, high, steps } };
}

/**
 * The first point of a grid, from its origin outwards, where the equation is stiff: a mode that dies away faster than
 * the step can follow, h·|Re λ| past the stability of Runge–Kutta (2.78) for an eigenvalue λ < 0 of ∂f/∂y. A pole
 * (y′ = y², λ = 2y > 0) is none: there the solution grows, it does not die away. Points the integration has not
 * reached are left out; one where the equation has no value tells nothing.
 */
export function firstStiffPoint(grid: { readonly xs: readonly number[]; readonly ys: readonly (readonly number[] | undefined)[] }, origin: number, f: (x: number, y: readonly number[]) => number[]): number | undefined {
  const last = grid.xs.length - 1;
  const h = Math.abs(grid.xs[last]! - grid.xs[0]!) / last;
  /** The fastest mode that dies away at (x, y), as a rate; 0 where none does or the equation has no value there. */
  const decay = (x: number, y: readonly number[]): number => {
    try {
      const f0 = f(x, y);
      // A small part of a state beside a large one (B ≈ 1e-5 beside A ≈ 1 in Robertson's kinetics) moves by a share
      // of the whole state, not of itself alone.
      const size = Math.max(...y.map(Math.abs)) || 1;
      const columns = y.map((_, j) => {
        const dy = 1e-7 * Math.max(Math.abs(y[j]!), 1e-3 * size);
        const moved = f(x, y.map((v, k) => (k === j ? v + dy : v)));
        return moved.map((v, r) => (v - f0[r]!) / dy);
      });
      const values = eigenvalues(y.map((_, r) => y.map((__, j): C => [columns[j]![r]!, 0])));
      return Math.max(0, ...(values ?? []).filter(([re]) => Number.isFinite(re)).map(([re]) => -re));
    } catch {
      return 0;
    }
  };
  const reached = Array.from({ length: last + 1 }, (_, i) => i)
    .filter((i) => grid.ys[i]?.every(Number.isFinite))
    .sort((i, j) => Math.abs(grid.xs[i]! - origin) - Math.abs(grid.xs[j]! - origin));
  for (const i of reached) if (h * decay(grid.xs[i]!, grid.ys[i]!) > RK4_STABILITY) return grid.xs[i]!;
  // Stiff only within the step that failed (Robertson: B = 0 at the start, a rate of 2000/s after a millisecond): that
  // step followed on the curve itself, in steps short enough for each rate met on the way.
  // The points just before it may already be swinging (values of the method, not of the curve): the way is followed
  // from a little further back, at most 50 steps, up to the end of the failed step.
  const farthest = reached.at(-1);
  if (farthest === undefined) return undefined;
  const direction = grid.xs[farthest]! >= origin && farthest < last ? 1 : -1;
  const back = reached[Math.max(0, reached.length - 51)]!;
  let [x, y] = [grid.xs[back]!, [...grid.ys[back]!]];
  const end = grid.xs[farthest]! + direction * h;
  for (let n = 0; n < 20000 && direction * (end - x) > 1e-12 * h; n++) {
    const rate = decay(x, y);
    if (h * rate > RK4_STABILITY) return x;
    const step = direction * Math.min(direction * (end - x), h / 16, rate > 0 ? 0.5 / rate : h);
    try {
      const k1 = f(x, y);
      const k2 = f(x + step / 2, y.map((v, j) => v + (step / 2) * k1[j]!));
      const k3 = f(x + step / 2, y.map((v, j) => v + (step / 2) * k2[j]!));
      const k4 = f(x + step, y.map((v, j) => v + step * k3[j]!));
      y = y.map((v, j) => v + (step / 6) * (k1[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!));
    } catch {
      return undefined;
    }
    // The curve itself ends here (a pole): no stiffness to speak of.
    if (!y.every(Number.isFinite)) return undefined;
    x += step;
  }
  return undefined;
}

/** J[i][j] = ∂r_i/∂p_j: how each condition answers to each value at the start. */
function sensitivities(values: readonly number[], at: readonly number[], residuals: (values: readonly number[]) => { r: number[] }): number[][] {
  const columns = values.map((p, j) => {
    const step = 1e-3 * Math.max(Math.abs(p), 1e-6);
    const moved = [...values];
    moved[j] = p + step;
    return residuals(moved).r.map((v, i) => (v - at[i]!) / step);
  });
  return at.map((_, i) => values.map((__, j) => columns[j]![i]!));
}

/**
 * How far a curve moved when the steps were doubled: the largest change at the points of the coarser grid, of the
 * function and its lower derivatives, each against its own largest value (a derivative that stays near zero
 * against the function over the length of the interval, or its rounding would count).
 */
function gridDifference(coarse: Grid, fine: Grid, n: number, length: number): number {
  const largest = (k: number) => fine.ys.reduce((most, y) => Math.max(most, Math.abs(y[k]!)), 0);
  const function0 = largest(0);
  let worst = 0;
  for (let k = 0; k < n; k++) {
    const scale = largest(k) + 1e-9 * (function0 / length ** k) + Number.MIN_VALUE;
    coarse.ys.forEach((y, i) => {
      worst = Math.max(worst, Math.abs(y[k]! - fine.ys[2 * i]![k]!) / scale);
    });
  }
  return worst;
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

