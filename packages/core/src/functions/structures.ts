/** What reads the result of beam(…), and the properties of a rolled section (eval/structures.ts computes the rest). */

import { fail } from '../diagnostics.js';
import { dim, sameDim } from '../units/dimension.js';
import { quantity, type Value } from '../values/value.js';
import type { Args, FunctionDef } from './registry.js';

const LENGTH = dim({ L: 1 });

function curveOf(name: string, part: string): FunctionDef {
  return {
    name,
    module: 'calculus',
    params: 'N, x',
    arity: [2, 2],
    call: (a) => {
      const beam = a.value(0);
      if (beam.type !== 'record' || beam.block !== 'beam') return fail('E-TYPE', a.expr(0).span, { expected: 'beam', found: beam.type === 'quantity' ? 'number' : beam.type });
      const curve = beam.values.get(part);
      if (curve?.type !== 'function' || !curve.native) return fail('E-TYPE', a.expr(0).span, { expected: 'beam', found: beam.type });
      const x = a.value(1);
      if (x.type === 'vector') return { type: 'vector', items: x.items.map((q) => curve.native!([q], a.expr(1).span) as Extract<Value, { type: 'quantity' }>) };
      return curve.native([a.quantity(1)], a.expr(1).span);
    },
  };
}

function lengthOf(a: Args, index: number): number {
  const q = a.quantity(index);
  if (!sameDim(q.dim, LENGTH)) fail('E-UNIT-MISMATCH', a.expr(index).span, { operator: a.name, left: 'm', right: q.hint?.symbol ?? '' });
  if (!(q.si >= 0)) a.domain(index);
  return q.si;
}

/** Properties of a rolled I section from its sizes, the fillets included when r is given. */
function iSection(h: number, b: number, tw: number, tf: number, r: number): Record<'A' | 'I_y' | 'I_z' | 'W_y' | 'W_pl' | 'S_y' | 'i_y', number> {
  const fillet = (1 - Math.PI / 4) * r * r;
  // From the corner of a fillet to its centre of gravity.
  const c = r * ((10 - 3 * Math.PI) / (12 - 3 * Math.PI));
  const web = h - 2 * tf;
  const A = 2 * b * tf + web * tw + 4 * fillet;
  // A square without a quarter circle, about the edge through the corner: r⁴/3 − (π/4 − 2/3 + π/16)·r⁴.
  const ownFillet = (1 - (5 * Math.PI) / 16) * r ** 4 - fillet * c * c;
  const armY = web / 2 - c;
  const armZ = tw / 2 + c;
  const I_y = (b * h ** 3 - (b - tw) * web ** 3) / 12 + 4 * (ownFillet + fillet * armY * armY);
  const I_z = (2 * tf * b ** 3 + web * tw ** 3) / 12 + 4 * (ownFillet + fillet * armZ * armZ);
  const S_y = b * tf * ((h - tf) / 2) + (tw * web * web) / 8 + 2 * fillet * armY;
  return { A, I_y, I_z, W_y: I_y / (h / 2), W_pl: 2 * S_y, S_y, i_y: Math.sqrt(I_y / A) };
}

const MILLI_POWERS: Readonly<Record<string, readonly [string, number, number]>> = {
  A: ['mm²', 1e-6, 2],
  I_y: ['cm⁴', 1e-8, 4],
  I_z: ['cm⁴', 1e-8, 4],
  W_y: ['cm³', 1e-6, 3],
  W_pl: ['cm³', 1e-6, 3],
  S_y: ['cm³', 1e-6, 3],
  i_y: ['mm', 1e-3, 1],
};

export const STRUCTURES: readonly FunctionDef[] = [
  { name: 'beam', module: 'calculus', params: 'L: …, EI: …, pins: […], fixed: […], hinges: […], q: …, at: […], F: […], moments_at: […], M: […]', arity: [0, 0] },
  { name: 'frame', module: 'calculus', params: 'nodes: T, members: T', arity: [0, 0] },
  curveOf('beam_M', 'M'),
  curveOf('beam_V', 'V'),
  curveOf('beam_w', 'w'),
  curveOf('beam_slope', 'θ'),
  {
    name: 'i_section',
    module: 'calculus',
    params: 'h, b, t_w, t_f, r',
    arity: [4, 5],
    call: (a) => {
      const [h, b, tw, tf] = [lengthOf(a, 0), lengthOf(a, 1), lengthOf(a, 2), lengthOf(a, 3)];
      const r = a.count > 4 ? lengthOf(a, 4) : 0;
      if (!(2 * tf < h) || !(tw < b)) a.domain();
      const found = iSection(h, b, tw, tf, r);
      const values = new Map<string, Value>();
      for (const [name, value] of Object.entries(found)) {
        const [symbol, factor, power] = MILLI_POWERS[name]!;
        const d = dim({ L: power });
        values.set(name, quantity(value, d, { hint: { symbol, factor, dim: d } }));
      }
      return { type: 'record', block: 'i_section', version: '', inputs: new Map(), values };
    },
  },
];
