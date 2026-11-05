/**
 * Beams and plane frames by the stiffness method (a textbook method, written anew for this program), exact at the
 * nodes: no grid of a differential equation, any number of spans, hinges, overhangs and point loads.
 *
 *   N := beam(L: 10 m, EI: 20 MN·m^2, pins: [0 m, 6 m], fixed: [10 m], hinges: [8 m], q: 5 kN/m, at: [3 m], F: [20 kN])
 *   beam_M(N, x), beam_V(N, x), beam_w(N, x), N.R, N.M_max
 *
 * Downward loads and deflections are positive, sagging moments too, and dM/dx = V. Everything comes with the equilibrium
 * of the whole checked, which is the one thing that can be said in print of what is otherwise a black box.
 */

import { diagnostic, fail, type Span } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { dim, isDimensionless, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { Table } from '../tables/table.js';
import { columnIndex } from '../tables/table.js';
import { quantity, type FunctionValue, type Quantity, type RecordValue, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import type { EvalContext } from './evaluator.js';
import { applyToValues } from './userFunctions.js';

type CallExpr = Extract<Expr, { kind: 'call' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

const LENGTH = dim({ L: 1 });
const FORCE = dim({ M: 1, L: 1, T: -2 });
const MOMENT = dim({ M: 1, L: 2, T: -2 });
const PER_LENGTH = dim({ M: 1, T: -2 });
const STIFFNESS = dim({ M: 1, L: 3, T: -2 });
const AXIAL = FORCE;
const SUBSTEPS = 64;

const KNOWN_BEAM = new Set(['L', 'EI', 'pins', 'fixed', 'hinges', 'q', 'at', 'F', 'moments_at', 'M']);

/** Gaussian elimination with pivoting; undefined for a mechanism. */
function solved(a: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  let scale = 0;
  for (const row of a) for (const x of row) scale = Math.max(scale, Math.abs(x));
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i]![k]!) > Math.abs(m[p]![k]!)) p = i;
    if (Math.abs(m[p]![k]!) <= 1e-11 * scale) return undefined;
    [m[k], m[p]] = [m[p]!, m[k]!];
    for (let i = k + 1; i < n; i++) {
      const f = m[i]![k]! / m[k]![k]!;
      if (f !== 0) for (let j = k; j <= n; j++) m[i]![j]! -= f * m[k]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = m[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= m[i]![j]! * x[j]!;
    x[i] = s / m[i]![i]!;
  }
  return x;
}

export function beamCall(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const positional = call.args[0];
  if (positional) fail('E-NAMED-ARG', positional.span, { function: call.name, argument: '', problem: 'positional' });
  for (const n of call.named) if (!KNOWN_BEAM.has(n.name)) fail('E-NAMED-ARG', n.nameSpan, { function: call.name, argument: n.name, problem: 'unknown' });
  const named = (name: string) => call.named.find((n) => n.name === name);
  const number = (name: string, dimension: Dimension): Quantity => {
    const arg = named(name);
    if (!arg) return fail('E-NAMED-ARG', call.span, { function: call.name, argument: name, problem: 'missing' });
    const q = asQuantity(evaluate(arg.value, ctx), arg.value.span);
    return checked(q, dimension, arg.value.span, name);
  };
  const checked = (q: Quantity, dimension: Dimension, span: Span, name: string): Quantity => {
    if (!sameDim(q.dim, dimension)) fail('E-UNIT-MISMATCH', span, { operator: name, left: baseUnitSymbol(dimension), right: q.hint?.symbol ?? baseUnitSymbol(q.dim) });
    return q;
  };
  const list = (name: string, dimension: Dimension): number[] => {
    const arg = named(name);
    if (!arg) return [];
    const value = evaluate(arg.value, ctx);
    const items = value.type === 'vector' ? value.items : [asQuantity(value, arg.value.span)];
    return items.map((q) => {
      if (q.im) fail('E-COMPLEX-ARG', arg.value.span);
      return checked(q, dimension, arg.value.span, name).si;
    });
  };
  const length = number('L', LENGTH).si;
  const ei = number('EI', STIFFNESS).si;
  if (!(length > 0)) fail('E-DOMAIN', named('L')!.value.span, { function: call.name });
  if (!(ei > 0)) fail('E-DOMAIN', named('EI')!.value.span, { function: call.name });
  const pins = list('pins', LENGTH);
  const fixed = list('fixed', LENGTH);
  const hinges = list('hinges', LENGTH);
  const forcesAt = list('at', LENGTH);
  const forces = list('F', FORCE);
  const momentsAt = list('moments_at', LENGTH);
  const moments = list('M', MOMENT);
  if (forcesAt.length !== forces.length) fail('E-VECTOR-LENGTH', call.span, { left: forcesAt.length, right: forces.length });
  if (momentsAt.length !== moments.length) fail('E-VECTOR-LENGTH', call.span, { left: momentsAt.length, right: moments.length });
  const inside = (x: number) => x >= -1e-12 * length && x <= length * (1 + 1e-12);
  if (![...pins, ...fixed, ...hinges, ...forcesAt, ...momentsAt].every(inside)) fail('E-BEAM-OUTSIDE', call.span);

  // The load per length: a number, or a function of x of the sheet.
  const qArg = named('q');
  const qGiven = qArg ? evaluate(qArg.value, ctx) : undefined;
  const qOf = (x: number): number => {
    if (!qGiven) return 0;
    if (qGiven.type === 'function') {
      const value = asQuantity(applyToValues(qGiven, [quantity(x, LENGTH)], call, ctx, (e, c) => evaluate(e, c)), qArg!.value.span);
      return checked(value, PER_LENGTH, qArg!.value.span, 'q').si;
    }
    return checked(asQuantity(qGiven, qArg!.value.span), PER_LENGTH, qArg!.value.span, 'q').si;
  };

  // Nodes at every place something happens.
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * length;
  const xs = [0, length, ...pins, ...fixed, ...hinges, ...forcesAt, ...momentsAt].sort((a, b) => a - b).filter((x, i, all) => i === 0 || !near(x, all[i - 1]!));
  const has = (places: readonly number[], x: number) => places.some((p) => near(p, x));
  let count = 0;
  const dofs = xs.map((x) => {
    const w = has(pins, x) || has(fixed, x) ? -1 : count++;
    const left = has(fixed, x) ? -1 : count++;
    const right = has(hinges, x) && !has(fixed, x) ? count++ : left;
    return { w, left, right };
  });
  const K = Array.from({ length: count }, () => new Array<number>(count).fill(0));
  const f = new Array<number>(count).fill(0);
  const elements = xs.slice(0, -1).map((x, e) => {
    const h = xs[e + 1]! - x;
    // The loads at the ends that do the same work as q along the element, by Gauss over parts of it.
    const load: [number, number, number, number] = [0, 0, 0, 0];
    const PANELS = 32;
    const G = [-0.906179845938664, -0.538469310105683, 0, 0.538469310105683, 0.906179845938664];
    const W = [0.236926885056189, 0.478628670499366, 0.568888888888889, 0.478628670499366, 0.236926885056189];
    if (qGiven) {
      for (let p = 0; p < PANELS; p++) {
        G.forEach((g, i) => {
          const t = (p + (g + 1) / 2) / PANELS;
          const weight = (W[i]! / 2 / PANELS) * h * qOf(x + t * h);
          load[0] += weight * (1 - 3 * t * t + 2 * t ** 3);
          load[1] += weight * h * (t - 2 * t * t + t ** 3);
          load[2] += weight * (3 * t * t - 2 * t ** 3);
          load[3] += weight * h * (t ** 3 - t * t);
        });
      }
    }
    const c = ei / h ** 3;
    const k = [
      [12 * c, 6 * h * c, -12 * c, 6 * h * c],
      [6 * h * c, 4 * h * h * c, -6 * h * c, 2 * h * h * c],
      [-12 * c, -6 * h * c, 12 * c, -6 * h * c],
      [6 * h * c, 2 * h * h * c, -6 * h * c, 4 * h * h * c],
    ];
    const map = [dofs[e]!.w, dofs[e]!.right, dofs[e + 1]!.w, dofs[e + 1]!.left];
    map.forEach((p, i) => {
      if (p < 0) return;
      f[p]! += load[i]!;
      map.forEach((q, j) => {
        if (q >= 0) K[p]![q]! += k[i]![j]!;
      });
    });
    return { x, h, k, load, map };
  });
  xs.forEach((x, i) => {
    const d = dofs[i]!;
    forcesAt.forEach((at, n) => {
      if (near(at, x) && d.w >= 0) f[d.w]! += forces[n]!;
    });
    momentsAt.forEach((at, n) => {
      if (near(at, x) && d.right >= 0) f[d.right]! += moments[n]!;
    });
  });
  const u = count > 0 ? solved(K, f) : [];
  if (!u) return fail('E-BEAM-UNSTABLE', call.span);
  const dof = (p: number) => (p >= 0 ? u[p]! : 0);

  // Reactions and the forces at the left end of each element, then along it by the equations of a beam.
  const reactions = new Map<number, { force: number; moment: number }>();
  const add = (node: number, force: number, moment: number) => {
    const r = reactions.get(node) ?? { force: 0, moment: 0 };
    reactions.set(node, { force: r.force + force, moment: r.moment + moment });
  };
  const grids = elements.map((el, e) => {
    const d = el.map.map(dof);
    const ends = el.k.map((row, i) => row.reduce((s, v, j) => s + v * d[j]!, 0) - el.load[i]!);
    add(e, -ends[0]!, ends[1]!);
    add(e + 1, -ends[2]!, ends[3]!);
    // V, M, θ, w along the element, Runge-Kutta steps exact for the polynomials a load gives.
    const step = el.h / SUBSTEPS;
    const states: [number, number, number, number][] = [[-ends[0]!, ends[1]!, d[1]!, d[0]!]];
    for (let i = 0; i < SUBSTEPS; i++) states.push(advance(states[i]!, el.x + i * step, step, qOf, ei));
    return { step, states };
  });
  const at = (x: number): [number, number, number, number] => {
    let e = 0;
    while (e < elements.length - 1 && x >= elements[e + 1]!.x - 1e-12 * length) e++;
    const el = elements[e]!;
    const grid = grids[e]!;
    const i = Math.min(SUBSTEPS - 1, Math.max(0, Math.floor((x - el.x) / grid.step)));
    return advance(grid.states[i]!, el.x + i * grid.step, x - el.x - i * grid.step, qOf, ei);
  };

  // The reactions, up positive, and the equilibrium of the whole: what can be said of a result no one calculates by hand here.
  const R: number[] = [];
  const Rm: number[] = [];
  const places: number[] = [];
  xs.forEach((x, i) => {
    if (!has(pins, x) && !has(fixed, x)) return;
    const applied = forcesAt.reduce((s, at0, n) => s + (near(at0, x) ? forces[n]! : 0), 0);
    const appliedMoment = momentsAt.reduce((s, at0, n) => s + (near(at0, x) ? moments[n]! : 0), 0);
    const r = reactions.get(i) ?? { force: 0, moment: 0 };
    // The force of the support is what the elements take from the node, with the load that stands on it.
    R.push(applied + r.force);
    Rm.push(has(fixed, x) ? r.moment - appliedMoment : 0);
    places.push(x);
  });
  const totalLoad = elements.reduce((s, el) => s + el.load[0]! + el.load[2]!, 0) + forces.reduce((s, v) => s + v, 0);
  const totalR = R.reduce((s, v) => s + v, 0);
  if (Math.abs(totalR - totalLoad) > 1e-6 * Math.max(Math.abs(totalLoad), Math.abs(totalR), 1e-300)) ctx.warnings.push(diagnostic('W-BEAM-EQUILIBRIUM', call.span, {}));

  const unit = (symbol: string) => ctx.registry.resolve(symbol);
  const forceSize = Math.max(Math.abs(totalLoad), ...R.map(Math.abs));
  const forceUnit = forceSize >= 1e6 ? unit('MN') : forceSize >= 1e3 ? unit('kN') : unit('N');
  const hint = (u: { symbol: string; factor: number; dim: Dimension } | undefined, d: Dimension) => (u && sameDim(u.dim, d) ? { hint: u } : {});
  const momentHint = forceSize >= 1e3 ? { hint: { symbol: 'kN·m', factor: 1e3, dim: MOMENT } } : { hint: { symbol: 'N·m', factor: 1, dim: MOMENT } };
  const fnOf = (name: string, pick: (s: readonly [number, number, number, number]) => number, make: (v: number) => Quantity): FunctionValue => ({
    type: 'function',
    name,
    params: ['x'],
    body: { kind: 'variable', name: 'x', span: call.span },
    captured: new Map(),
    native: (args, span) => {
      const x = asQuantity(args[0]!, span);
      if (!sameDim(x.dim, LENGTH)) fail('E-UNIT-MISMATCH', span, { operator: '(', left: 'm', right: baseUnitSymbol(x.dim) });
      if (x.si < -1e-9 * length || x.si > length * (1 + 1e-9)) fail('E-DOMAIN', span, { function: name });
      return make(pick(at(Math.min(length, Math.max(0, x.si)))));
    },
  });
  const asV = (v: number) => quantity(v, FORCE, hint(forceUnit, FORCE));
  const asM = (v: number) => quantity(v, MOMENT, momentHint);
  const asW = (v: number) => quantity(v, LENGTH, hint(unit('mm'), LENGTH));
  const all = grids.flatMap((g) => g.states);
  const extreme = (k: number, sign: number) => all.reduce((best, s) => (sign * s[k]! > sign * best ? s[k]! : best), all[0]![k]!);
  const values = new Map<string, Value>([
    ['V', fnOf('V', (s) => s[0], asV)],
    ['M', fnOf('M', (s) => s[1], asM)],
    ['θ', fnOf('θ', (s) => s[2], (v) => quantity(v))],
    ['w', fnOf('w', (s) => s[3], asW)],
    ['R', { type: 'vector', items: R.map(asV) }],
    ['R_M', { type: 'vector', items: Rm.map(asM) }],
    ['R_at', { type: 'vector', items: places.map((x) => quantity(x, LENGTH)) }],
    ['M_max', asM(extreme(1, 1))],
    ['M_min', asM(extreme(1, -1))],
    ['V_max', asV(all.reduce((best, s) => Math.max(best, Math.abs(s[0])), 0))],
    ['w_max', asW(all.reduce((best, s) => (Math.abs(s[3]) > Math.abs(best) ? s[3] : best), 0))],
  ]);
  const shown = R.map((v) => Number((v / (forceUnit?.factor ?? 1)).toPrecision(5))).join('; ');
  const record: RecordValue = { type: 'record', block: 'beam', version: `R = ${shown} ${forceUnit?.symbol ?? 'N'}`, inputs: new Map(), values };
  return record;
}

function advance(s: readonly number[], x: number, h: number, q: (x: number) => number, ei: number): [number, number, number, number] {
  const f = (at: number, y: readonly number[]) => [-q(at), y[0]!, -y[1]! / ei, y[2]!];
  const k1 = f(x, s);
  const k2 = f(x + h / 2, s.map((v, i) => v + (h / 2) * k1[i]!));
  const k3 = f(x + h / 2, s.map((v, i) => v + (h / 2) * k2[i]!));
  const k4 = f(x + h, s.map((v, i) => v + h * k3[i]!));
  return s.map((v, i) => v + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!)) as [number, number, number, number];
}

/**
 * A plane frame or truss from two tables:
 *   nodes:   x, y, and as wanted fix_x, fix_y, fix_r (1 fixed), F_x, F_y, M
 *   members: i, j (rows of nodes, from 1), EA, and EI (a truss member without it), q (across, in the direction of the
 *            member turned to the right)
 * Gives per node ux, uy, r, R_x, R_y, R_M; per member N (tension +), V_i, M_i, V_j, M_j.
 */
export function frameCall(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const tableOf = (name: string): Table => {
    const arg = call.named.find((n) => n.name === name);
    if (!arg) return fail('E-NAMED-ARG', call.span, { function: call.name, argument: name, problem: 'missing' });
    const value = evaluate(arg.value, ctx);
    return value.type === 'table' ? value.table : fail('E-TYPE', arg.value.span, { expected: 'table', found: value.type === 'quantity' ? 'number' : value.type });
  };
  for (const n of call.named) if (n.name !== 'nodes' && n.name !== 'members') fail('E-NAMED-ARG', n.nameSpan, { function: call.name, argument: n.name, problem: 'unknown' });
  const nodes = tableOf('nodes');
  const members = tableOf('members');
  const column = (table: Table, name: string, dimension: Dimension | undefined, needed: boolean): number[] => {
    const index = columnIndex(table, name);
    if (index < 0) return needed ? fail('E-TABLE-COLUMN', call.span, { table: table.name, column: name }) : table.rows.map(() => 0);
    return table.rows.map((row) => {
      const cell = row[index];
      if (!cell) return needed ? fail('E-TABLE-EMPTY', call.span, { table: table.name, column: name, row: '' }) : 0;
      if (cell.type !== 'quantity') return fail('E-TYPE', call.span, { expected: 'number', found: cell.type });
      if (dimension ? !sameDim(cell.dim, dimension) : !isDimensionless(cell.dim)) fail('E-UNIT-MISMATCH', call.span, { operator: name, left: dimension ? baseUnitSymbol(dimension) : '1', right: cell.hint?.symbol ?? baseUnitSymbol(cell.dim) });
      return cell.si;
    });
  };
  const [X, Y] = [column(nodes, 'x', LENGTH, true), column(nodes, 'y', LENGTH, true)];
  const [fixX, fixY, fixR] = [column(nodes, 'fix_x', undefined, false), column(nodes, 'fix_y', undefined, false), column(nodes, 'fix_r', undefined, false)];
  const [Fx, Fy, Mz] = [column(nodes, 'F_x', FORCE, false), column(nodes, 'F_y', FORCE, false), column(nodes, 'M', MOMENT, false)];
  const [I, J] = [column(members, 'i', undefined, true), column(members, 'j', undefined, true)];
  const EA = column(members, 'EA', AXIAL, true);
  const EI = column(members, 'EI', STIFFNESS, false);
  const Q = column(members, 'q', PER_LENGTH, false);
  const n = X.length;
  const size = 3 * n;
  const K = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const f = new Array<number>(size).fill(0);
  X.forEach((_, i) => {
    f[3 * i] = Fx[i]!;
    f[3 * i + 1] = Fy[i]!;
    f[3 * i + 2] = Mz[i]!;
  });
  const parts = I.map((iRaw, m) => {
    const [a, b] = [iRaw - 1, J[m]! - 1];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n || a === b) fail('E-INDEX', call.span, { index: iRaw, length: n });
    const [dx, dy] = [X[b]! - X[a]!, Y[b]! - Y[a]!];
    const L = Math.hypot(dx, dy);
    if (L === 0) fail('E-BEAM-OUTSIDE', call.span);
    const [c, s] = [dx / L, dy / L];
    const [ea, ei, q] = [EA[m]!, EI[m]!, Q[m]!];
    const [k0, k1, k2, k3] = [ea / L, (12 * ei) / L ** 3, (6 * ei) / L ** 2, (4 * ei) / L];
    // In the axes of the member: along it, across it (to the left of its direction), turning.
    const local = [
      [k0, 0, 0, -k0, 0, 0],
      [0, k1, k2, 0, -k1, k2],
      [0, k2, k3, 0, -k2, k3 / 2],
      [-k0, 0, 0, k0, 0, 0],
      [0, -k1, -k2, 0, k1, -k2],
      [0, k2, k3 / 2, 0, -k2, k3],
    ];
    const T = [
      [c, s, 0, 0, 0, 0],
      [-s, c, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0],
      [0, 0, 0, -s, c, 0],
      [0, 0, 0, 0, 0, 1],
    ];
    // q across, to the right of the direction: −q in the local axis; a member without EI carries it straight to its ends.
    const fixedLoad = [0, (-q * L) / 2, ei > 0 ? (-q * L * L) / 12 : 0, 0, (-q * L) / 2, ei > 0 ? (q * L * L) / 12 : 0];
    const map = [3 * a, 3 * a + 1, 3 * a + 2, 3 * b, 3 * b + 1, 3 * b + 2];
    const global = T.map((_, r) => T.map((__, t) => {
      let sum = 0;
      for (let u = 0; u < 6; u++) for (let v = 0; v < 6; v++) sum += T[u]![r]! * local[u]![v]! * T[v]![t]!;
      return sum;
    }));
    map.forEach((p, r) => {
      f[p]! += T.reduce((sum, row, u) => sum + row[r]! * fixedLoad[u]!, 0);
      map.forEach((q2, t) => (K[p]![q2]! += global[r]![t]!));
    });
    return { local, T, fixedLoad, map, L, q, ei };
  });
  // Fixed degrees of freedom go, and so does the turning of a node only truss members meet.
  const fixedDof = (p: number) => {
    const node = Math.floor(p / 3);
    const kind = p % 3;
    return kind === 0 ? fixX[node] !== 0 : kind === 1 ? fixY[node] !== 0 : fixR[node] !== 0 || K[p]![p] === 0;
  };
  const free = Array.from({ length: size }, (_, p) => p).filter((p) => !fixedDof(p));
  const x = solved(free.map((p) => free.map((q) => K[p]![q]!)), free.map((p) => f[p]!));
  if (!x) return fail('E-BEAM-UNSTABLE', call.span);
  const u = new Array<number>(size).fill(0);
  free.forEach((p, i) => (u[p] = x[i]!));
  const reaction = Array.from({ length: size }, (_, p) => (fixedDof(p) ? K[p]!.reduce((sum, v, q) => sum + v * u[q]!, 0) - f[p]! : 0));
  const ends = parts.map((m) => {
    const d = m.map.map((p) => u[p]!);
    const local = m.T.map((row) => row.reduce((sum, v, t) => sum + v * d[t]!, 0));
    return m.local.map((row, r) => row.reduce((sum, v, t) => sum + v * local[t]!, 0) - m.fixedLoad[r]!);
  });
  const series = (values: readonly number[], d: Dimension): Value => ({ type: 'vector', items: values.map((v) => quantity(v, d)) });
  const pick = (values: readonly number[], kind: number) => X.map((_, i) => values[3 * i + kind]!);
  const fieldsTotal = [Fx.reduce((s, v) => s + v, 0), Fy.reduce((s, v) => s + v, 0)];
  // The loads along the members, in global axes.
  const along = (first: number, second: number) => parts.reduce((s, m) => s + m.T.reduce((sum, row, u) => sum + (row[first]! + row[second]!) * m.fixedLoad[u]!, 0), 0);
  const [qx, qy] = [along(0, 3), along(1, 4)];
  const sum = (kind: number) => pick(reaction, kind).reduce((s, v) => s + v, 0);
  const off = Math.hypot(sum(0) + fieldsTotal[0]! + qx, sum(1) + fieldsTotal[1]! + qy);
  const big = Math.max(...reaction.map(Math.abs), ...Fx.map(Math.abs), ...Fy.map(Math.abs), 1e-300);
  if (off > 1e-6 * big) ctx.warnings.push(diagnostic('W-BEAM-EQUILIBRIUM', call.span, {}));
  const values = new Map<string, Value>([
    ['ux', series(pick(u, 0), LENGTH)],
    ['uy', series(pick(u, 1), LENGTH)],
    ['r', series(pick(u, 2), dim({}))],
    ['R_x', series(pick(reaction, 0), FORCE)],
    ['R_y', series(pick(reaction, 1), FORCE)],
    ['R_M', series(pick(reaction, 2), MOMENT)],
    ['N', series(ends.map((e) => -e[0]!), FORCE)],
    ['V_i', series(ends.map((e) => e[1]!), FORCE)],
    ['M_i', series(ends.map((e) => -e[2]!), MOMENT)],
    ['V_j', series(ends.map((e) => -e[4]!), FORCE)],
    ['M_j', series(ends.map((e) => e[5]!), MOMENT)],
  ]);
  return { type: 'record', block: 'frame', version: `${X.length}/${I.length}`, inputs: new Map(), values } satisfies RecordValue;
}
