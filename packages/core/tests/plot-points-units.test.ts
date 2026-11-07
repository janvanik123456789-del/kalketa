/** A point of a chart written out [x, y] takes x and y in their own units (found by a local model, sheet of a pump). */
import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

describe('points of a chart in brackets', () => {
  const sheet = ['a := 69440 s^2/m^5', 'H_0 := 46 m', 'H_p(Q) := H_0 - a·Q^2 | m', 'Q_b := 10.77 L/s', 'H_b := H_p(Q_b) | m'];

  it('take a flow and a height', () => {
    const r = evaluateSheet([...sheet, 'plot(H_p(Q), Q: 0 L/s .. 15 L/s, points: [Q_b, H_b])'].join('\n'));
    expect(r.diagnostics.map((d) => d.code)).toEqual([]);
    const plot = r.statements.find((s) => s.plot)?.plot;
    expect(JSON.stringify(plot)).toContain('10.77');
  });

  it('row by row too, and still say which point does not fit the axes', () => {
    expect(evaluateSheet([...sheet, 'plot(H_p(Q), Q: 0 L/s .. 15 L/s, points: [Q_b, H_b | 5 L/s, H_p(5 L/s)])'].join('\n')).diagnostics.map((d) => d.code)).toEqual([]);
    expect(evaluateSheet([...sheet, 'plot(H_p(Q), Q: 0 L/s .. 15 L/s, points: [H_b, Q_b])'].join('\n')).diagnostics.map((d) => d.code)).toEqual(['E-PLOT-POINTS']);
  });
});

describe('a citation by title', () => {
  it('is reported as a citation, a citation by its section passes', () => {
    expect(evaluateSheet('"Napětí je moment dělený modulem." [Ohybové napětí v I-průřezu]').diagnostics.map((d) => d.code)).toEqual(['E-CITATION']);
    expect(evaluateSheet('"Napětí je moment dělený modulem." [T6]').diagnostics).toEqual([]);
    expect(evaluateSheet('"Napětí." [PP:T3][T1]').diagnostics).toEqual([]);
  });
});
