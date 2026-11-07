/** A chart over temperatures in °C calculates as an integral over them does (found by sample R47). */
import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

describe('a chart over temperatures in °C', () => {
  const sheet = ['a := 120.4 J/(mol·K)', 'b := 99.6e-3 J/(mol·K^2)', 'c_p(T) := a + b·T', 't_1 := 25 °C', 't_2 := 427 °C'];

  it('warns of no absolute temperature at each point, as the integral does not', () => {
    const r = evaluateSheet([...sheet, 'plot(c_p(T)/T, T: t_1 .. t_2, area: t_1 .. t_2) | J/(mol·K^2)', 'S := integral(c_p(T)/T, T: t_1 .. t_2) | J/(mol·K)'].join('\n'));
    expect(r.diagnostics.map((d) => d.code)).toEqual([]);
    const plot = r.statements.find((s) => s.plot)?.plot;
    const first = plot?.series[0]?.ys[0];
    // At 25 °C: (a + b·298.15 K)/298.15 K.
    expect(first).toBeCloseTo((120.4 + 99.6e-3 * 298.15) / 298.15, 6);
  });
});
