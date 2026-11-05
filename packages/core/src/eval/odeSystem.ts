/**
 * More differential equations together, and unknown numbers in them (docs/03-jazyk.md, ch. 9.2):
 *
 *   solve (a(t), b(t)): a′ == -k_1·a + k_2·b, b′ == k_1·a - k_2·b in 0 s .. 60 s      A ⇌ B
 *       a(0 s) == 1 mol/l
 *       b(0 s) == 0 mol/l
 *
 *   solve w(x), P: E·I·w″ + P·w == 0 in 0 m .. L        the critical force
 *       w(0 m) == 0 m, w(L) == 0 m, w′(0 m) == 0.01
 *       guess P = 800 kN
 *
 * Each equation is taken as linear in the highest derivatives, which may mix (L_1·i_1′ + M·i_2′ == u): their values are
 * a small system at every point. Integrated with Runge–Kutta of the 4th order, steps doubled until the curves settle.
 * Conditions all at one point give the curves directly; otherwise the values at the start and the unknown numbers are
 * found by Newton's method on the conditions. An unknown number needs a condition of its own, and a guess: which mode of
 * a beam comes out depends on it.
 */

import { CalcError, diagnostic, fail, type Span } from '../diagnostics.js';
import type { Expr, Statement } from '../lang/ast.js';
import { divideDims, multiplyDims, powerDim, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type FunctionValue, type Quantity, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import type { EvalContext } from './evaluator.js';
import { conditionOf, ODE_STEPS, orderIn, primeName, type OdeInfo } from './ode.js';
import { withBareZero } from './zero.js';

type SolveStatement = Extract<Statement, { kind: 'solve' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

const MAX_STEPS = 3200;
const TOLERANCE = 1e-6;
const ACCEPTABLE = 1e-4;
const MAX_NEWTON = 40;

interface Curve {
  readonly name: string;
  readonly order: number;
  /** Where its value stands in the state; its derivatives follow. */
  readonly first: number;
  dim: Dimension | undefined;
}

interface Grid {
  readonly xs: readonly number[];
  readonly ys: readonly (readonly number[])[];
  /** The highest derivative of each curve at each point. */
  readonly ds: readonly (readonly number[])[];
  readonly left: number;
}

export interface OdeSystemResult {
  readonly values: ReadonlyMap<string, Value>;
  readonly info: OdeInfo;
}

export function solveOdeSystem(statement: SolveStatement, ctx: EvalContext, evaluate: Evaluate): OdeSystemResult {
  const ode = statement.ode!;
  const names = ode.functions ?? [statement.unknowns[0]!.name];
  const parameters = statement.unknowns.map((u) => u.name).filter((u) => !names.includes(u));
  const first = names[0]!;
  const variable = ode.variable;
  if (!statement.range) return fail('E-ODE-RANGE', statement.span, { name: first });
  const low = asQuantity(evaluate(statement.range.low, ctx), statement.range.low.span);
  const high = asQuantity(evaluate(statement.range.high, ctx), statement.range.high.span);
  if (!sameDim(low.dim, high.dim)) fail('E-UNIT-MISMATCH', statement.range.high.span, { operator: '..', left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
  if (!(high.si > low.si)) fail('E-ODE-RANGE', statement.range.low.span, { name: first });
  const dimX = low.dim;
  const [a, b] = [low.si, high.si];

  // Which equations are differential, and the order of each curve.
  const reads = (e: { left: Expr; right: Expr }, name: string) => Math.max(orderIn(e.left, name), orderIn(e.right, name));
  const differential = statement.equations.filter((e) => names.some((name) => reads(e, name) > 0));
  const others = statement.equations.filter((e) => !differential.includes(e));
  let offset = 0;
  const curves: Curve[] = names.map((name) => {
    const order = Math.max(0, ...differential.map((e) => reads(e, name)));
    if (order === 0) fail('E-ODE-FORM', statement.span, { name });
    const curve: Curve = { name, order, first: offset, dim: undefined };
    offset += order;
    return curve;
  });
  const size = offset;
  if (differential.length !== curves.length) return fail('E-ODE-FORM', statement.span, { name: first });

  // The numbers sought: their guesses give their units.
  const guesses = parameters.map((name) => {
    const guess = statement.guesses.find((g) => g.name === name);
    if (!guess) return fail('E-ODE-GUESS', statement.span, { name });
    return asQuantity(evaluate(guess.value, ctx), guess.value.span);
  });

  // The conditions, and through them the units of the curves.
  const conditions = others.map((e) => {
    for (const curve of curves) {
      const c = conditionOf(e, curve.name);
      if (!c) continue;
      const at = asQuantity(evaluate(c.at, ctx), c.at.span);
      if (!sameDim(at.dim, dimX)) fail('E-UNIT-MISMATCH', c.at.span, { operator: '(', left: baseUnitSymbol(at.dim), right: baseUnitSymbol(dimX) });
      if (at.si < a - 1e-12 * (b - a) || at.si > b + 1e-12 * (b - a)) fail('E-ODE-POINT', c.at.span, { name: curve.name });
      const value = asQuantity(evaluate(c.value, ctx), c.value.span);
      const own = multiplyDims(value.dim, powerDim(dimX, c.order));
      if (!curve.dim) curve.dim = own;
      else if (!sameDim(curve.dim, own)) fail('E-UNIT-MISMATCH', e.span, { operator: '==', left: baseUnitSymbol(curve.dim), right: baseUnitSymbol(own) });
      return { curve, order: c.order, at: at.si, value: value.si };
    }
    return fail('E-ODE-CONDITION', e.span, { name: first });
  });
  if (conditions.length !== size + parameters.length || curves.some((c) => !c.dim)) {
    return fail('E-ODE-CONDITIONS', statement.span, { name: first, order: size + parameters.length, found: conditions.length });
  }
  const dimOf = (curve: Curve, k: number) => divideDims(curve.dim!, powerDim(dimX, k));

  // The highest derivatives at x: each equation at zero and at one for each of them gives a small linear system.
  const highest = (x: number, y: readonly number[], p: readonly number[]): number[] => {
    const residualsWith = (trial: readonly number[]): number[] => {
      const inner: EvalContext = {
        ...ctx,
        warnings: [],
        iterating: true,
        lookup: (asked: string, span: Span): Value => {
          if (asked === variable) return quantity(x, dimX);
          const q = parameters.indexOf(asked);
          if (q >= 0) return quantity(p[q]!, guesses[q]!.dim, guesses[q]!.hint ? { hint: guesses[q]!.hint! } : {});
          for (const [c, curve] of curves.entries()) {
            for (let k = 0; k <= curve.order; k++) {
              if (asked === primeName(curve.name, k)) return quantity(k < curve.order ? y[curve.first + k]! : trial[c]!, dimOf(curve, k));
            }
          }
          return ctx.lookup(asked, span);
        },
      };
      return differential.map((e) => {
        const [left, right] = withBareZero(asQuantity(evaluate(e.left, inner), e.left.span), asQuantity(evaluate(e.right, inner), e.right.span), e.left, e.right);
        if (!sameDim(left.dim, right.dim)) fail('E-UNIT-MISMATCH', e.span, { operator: '==', left: baseUnitSymbol(left.dim), right: baseUnitSymbol(right.dim) });
        return left.si - right.si;
      });
    };
    const zero = curves.map(() => 0);
    const base = residualsWith(zero);
    const columns = curves.map((_, j) => {
      const r = residualsWith(zero.map((_, i) => (i === j ? 1 : 0)));
      return r.map((v, i) => v - base[i]!);
    });
    const matrix = base.map((_, i) => columns.map((column) => column[i]!));
    const solved = solveLinear(matrix, base.map((v) => -v));
    if (!solved) fail('E-ODE-FORM', statement.span, { name: first });
    return solved!;
  };

  // All conditions at one point, one for each state, and nothing sought: the curves go out from there both ways.
  const direct = parameters.length === 0 && conditions.every((c) => c.order < c.curve.order && Math.abs(c.at - conditions[0]!.at) <= 1e-12 * (b - a));
  const origin = direct ? Math.min(b, Math.max(a, conditions[0]!.at)) : a;
  const before = origin <= a ? 0 : origin >= b ? ODE_STEPS : Math.min(ODE_STEPS - 1, Math.max(1, Math.round((ODE_STEPS * (origin - a)) / (b - a))));

  const integrate = (steps: number, start: readonly number[], p: readonly number[]): Grid => {
    const left = before * (steps / ODE_STEPS);
    const xs = Array.from({ length: steps + 1 }, (_, i) => (i <= left ? (left === 0 ? a : a + ((origin - a) * i) / left) : origin + ((b - origin) * (i - left)) / (steps - left)));
    const ys = new Array<number[]>(steps + 1);
    const ds = new Array<number[]>(steps + 1);
    const f = (x: number, y: readonly number[]): { slope: number[]; top: number[] } => {
      const top = highest(x, y, p);
      const slope = new Array<number>(size);
      curves.forEach((curve, c) => {
        for (let k = 0; k < curve.order - 1; k++) slope[curve.first + k] = y[curve.first + k + 1]!;
        slope[curve.first + curve.order - 1] = top[c]!;
      });
      return { slope, top };
    };
    const go = (from: number, to: number) => {
      const [x, y, h] = [xs[from]!, ys[from]!, xs[to]! - xs[from]!];
      const k1 = f(x, y);
      ds[from] = k1.top;
      const k2 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k1.slope[j]!)).slope;
      const k3 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k2[j]!)).slope;
      const k4 = f(x + h, y.map((v, j) => v + h * k3[j]!)).slope;
      const next = y.map((v, j) => v + (h / 6) * (k1.slope[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!));
      if (!next.every(Number.isFinite)) fail('E-ODE-SINGULAR', statement.span, { name: first, at: `${variable} = ${Number(x.toPrecision(4))}` });
      ys[to] = next;
    };
    ys[left] = [...start];
    for (let i = left; i < steps; i++) go(i, i + 1);
    ds[steps] = f(xs[steps]!, ys[steps]!).top;
    for (let i = left; i > 0; i--) go(i, i - 1);
    if (left > 0) ds[0] = f(xs[0]!, ys[0]!).top;
    return { xs, ys, ds, left };
  };

  const locate = (grid: Grid, x: number): number => {
    const steps = grid.xs.length - 1;
    const found = x < origin ? Math.floor(((x - a) / (origin - a)) * grid.left) : grid.left === steps ? steps - 1 : grid.left + Math.floor(((x - origin) / (b - origin)) * (steps - grid.left));
    return Math.min(steps - 1, Math.max(0, found));
  };
  /** The k-th derivative of a curve at x: cubic Hermite between the grid points, the highest one linear. */
  const at = (grid: Grid, curve: Curve, c: number, k: number, x: number): number => {
    const i = locate(grid, x);
    const h = grid.xs[i + 1]! - grid.xs[i]!;
    const t = (x - grid.xs[i]!) / h;
    if (k >= curve.order) return grid.ds[i]![c]! * (1 - t) + grid.ds[i + 1]![c]! * t;
    const value = (j: number) => grid.ys[j]![curve.first + k]!;
    const slope = (j: number) => (k + 1 < curve.order ? grid.ys[j]![curve.first + k + 1]! : grid.ds[j]![c]!);
    const [t2, t3] = [t * t, t * t * t];
    return (2 * t3 - 3 * t2 + 1) * value(i) + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * value(i + 1) + (t3 - t2) * h * slope(i + 1);
  };

  // What the conditions say at the origin; the rest from zero, the numbers from their guesses.
  const startState = new Array<number>(size).fill(0);
  for (const c of conditions) if (c.order < c.curve.order && Math.abs(c.at - origin) <= 1e-12 * (b - a)) startState[c.curve.first + c.order] = c.value;
  const startValues = [...startState, ...guesses.map((g) => g.si)];

  const residuals = (steps: number, values: readonly number[]) => {
    const grid = integrate(steps, values.slice(0, size), values.slice(size));
    return { grid, r: conditions.map((c) => at(grid, c.curve, curves.indexOf(c.curve), c.order, c.at) - c.value) };
  };

  const solveOn = (steps: number, from: readonly number[]): { grid: Grid; values: number[] } => {
    if (direct) return { grid: integrate(steps, from.slice(0, size), []), values: [...from] };
    let values = [...from];
    let current = residuals(steps, values);
    const scales = conditions.map((c) => {
      const curve = c.curve;
      let big = Math.abs(c.value);
      for (const y of current.grid.ys) big = Math.max(big, Math.abs(y[curve.first + Math.min(c.order, curve.order - 1)]!));
      return big || 1;
    });
    for (let iteration = 0; iteration < MAX_NEWTON; iteration++) {
      const holds = current.r.every((r, i) => Math.abs(r) <= 1e-9 * scales[i]!);
      if (holds && iteration > 0) return { grid: current.grid, values };
      const before = current.r;
      const columns = values.map((p, j) => {
        const step = 1e-4 * Math.max(Math.abs(p), Math.abs(startValues[j]!) * 1e-2, 1e-6);
        const moved = [...values];
        moved[j] = p + step;
        return residuals(steps, moved).r.map((v, i) => (v - before[i]!) / step);
      });
      const matrix = before.map((_, i) => values.map((__, j) => columns[j]![i]!));
      const delta = solveLinear(matrix, before.map((v) => -v));
      if (!delta) {
        if (holds) return { grid: current.grid, values };
        return fail('E-ODE-CONDITIONS', statement.span, { name: first, order: size + parameters.length, found: conditions.length });
      }
      // A step that makes things worse is cut, as a shot too far may leave where the equation has a value.
      let damping = 1;
      const norm = (r: readonly number[]) => Math.hypot(...r.map((v, i) => v / scales[i]!));
      for (;;) {
        const trial = values.map((v, j) => v + damping * delta[j]!);
        try {
          const next = residuals(steps, trial);
          if (damping < 1 / 64 || norm(next.r) < norm(before) * 1.5 || iteration === 0) {
            values = trial;
            current = next;
            break;
          }
        } catch (err) {
          if (!(err instanceof CalcError) || damping < 1 / 64) throw err;
        }
        damping /= 2;
      }
    }
    if (current.r.every((r, i) => Math.abs(r) <= 1e-7 * scales[i]!)) return { grid: current.grid, values };
    return fail('E-SOLVE-NO-CONVERGENCE', statement.span, {});
  };

  // Twice as many steps until the curves no longer change.
  let solved = solveOn(ODE_STEPS, startValues);
  let steps = ODE_STEPS;
  let difference = Infinity;
  while (steps < MAX_STEPS && difference > TOLERANCE) {
    const finer = solveOn(steps * 2, solved.values);
    const change = gridChange(solved.grid, finer.grid, size);
    const slowly = change > difference / 8;
    difference = change;
    solved = finer;
    steps *= 2;
    if (slowly && difference <= ACCEPTABLE) break;
  }
  if (difference > ACCEPTABLE) ctx.warnings.push(diagnostic('W-ODE-ACCURACY', statement.span, { name: first, steps }));

  const values = new Map<string, Value>();
  const grid = solved.grid;
  const inside = (q: Value, span: Span, name: string): number => {
    const x = asQuantity(q, span);
    if (!sameDim(x.dim, dimX)) fail('E-UNIT-MISMATCH', span, { operator: '(', left: baseUnitSymbol(x.dim), right: baseUnitSymbol(dimX) });
    const slack = 1e-9 * (b - a);
    if (x.si < a - slack || x.si > b + slack) fail('E-DOMAIN', span, { function: name });
    return Math.min(b, Math.max(a, x.si));
  };
  curves.forEach((curve, c) => {
    const fn: FunctionValue = {
      type: 'function',
      name: curve.name,
      params: [variable],
      body: { kind: 'variable', name: variable, span: statement.span },
      captured: new Map(),
      native: (args, span) => quantity(at(grid, curve, c, 0, inside(args[0]!, span, curve.name)), curve.dim!),
      derivative: (order, arg, span) => {
        if (order > curve.order) fail('E-ODE-ORDER', span, { name: curve.name, order: curve.order });
        return quantity(at(grid, curve, c, order, inside(arg, span, curve.name)), dimOf(curve, order));
      },
    };
    values.set(curve.name, fn);
  });
  parameters.forEach((name, i) => {
    const guess = guesses[i] as Quantity;
    values.set(name, quantity(solved.values[size + i]!, guess.dim, guess.hint ? { hint: guess.hint } : {}));
  });
  return { values, info: { order: Math.max(...curves.map((c) => c.order)), low, high, steps } };
}

/** How far the curves moved when the steps were doubled, each state against its own largest value. */
function gridChange(coarse: Grid, fine: Grid, size: number): number {
  let worst = 0;
  for (let k = 0; k < size; k++) {
    let big = Number.MIN_VALUE;
    for (const y of fine.ys) big = Math.max(big, Math.abs(y[k]!));
    coarse.ys.forEach((y, i) => (worst = Math.max(worst, Math.abs(y[k]! - fine.ys[2 * i]![k]!) / big)));
  }
  return worst;
}

function solveLinear(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] | undefined {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    const big = Math.max(...m.map((row) => Math.abs(row[col]!)));
    if (big === 0 || !(Math.abs(m[pivot]![col]!) > 1e-14 * big)) return undefined;
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
