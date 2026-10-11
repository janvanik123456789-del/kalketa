import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

const BEAM = ['q := 10 kN/m', 'L := 6 m', 'E := 210 GPa', 'I := 8360 cm^4', 'M(x) := q·x·(L - x)/2'];
const value = (source: string, name: string) => evaluateSheet(source).values.get(name);

describe('differential equations with boundary conditions', () => {
  it('give the deflection line of a simple beam as the textbook formula does', () => {
    const source = [...BEAM, 'solve w(x): E·I·w″ == -M(x) in 0 m .. L', '    w(0 m) == 0 m', '    w(L) == 0 m', 'w_s := w(L/2)', 'φ_A := w′(0 m)', 'M_s := -E·I·w″(L/2)'].join('\n');
    const r = evaluateSheet(source);
    expect(r.diagnostics).toEqual([]);
    expect((r.values.get('w_s') as { si: number }).si).toBeCloseTo((5 * 10e3 * 6 ** 4) / (384 * 210e9 * 8360e-8), 9);
    // The slope at the support: q·L³/(24·E·I); the moment back from the curve: q·L²/8.
    expect((r.values.get('φ_A') as { si: number }).si).toBeCloseTo((10e3 * 6 ** 3) / (24 * 210e9 * 8360e-8), 8);
    expect((r.values.get('M_s') as { si: number }).si).toBeCloseTo(45e3, 0);
  });

  it('solve a fourth order equation of a cantilever with its conditions at both ends, and one of first order', () => {
    const cantilever = [...BEAM, 'solve v(x): E·I·v⁗ == q in 0 m .. L', '    v(0 m) == 0 m', '    v′(0 m) == 0', '    v″(L) == 0 m^-1', '    v‴(L) == 0 m^-2', 'v_L := v(L)'].join('\n');
    expect((value(cantilever, 'v_L') as { si: number }).si).toBeCloseTo((10e3 * 6 ** 4) / (8 * 210e9 * 8360e-8), 9);
    expect((value('solve y(t): y′ == -y/(2 s) in 0 s .. 4 s\n    y(0 s) == 1\nz := y(4 s)', 'z') as { si: number }).si).toBeCloseTo(Math.exp(-2), 8);
  });

  it('say what is missing: conditions, the interval, a point outside it', () => {
    const codes = (source: string) => evaluateSheet(source).diagnostics.map((d) => d.code);
    expect(codes([...BEAM, 'solve w(x): E·I·w″ == -M(x) in 0 m .. L', '    w(0 m) == 0 m'].join('\n'))).toContain('E-ODE-CONDITIONS');
    expect(codes([...BEAM, 'solve w(x): E·I·w″ == -M(x)', '    w(0 m) == 0 m', '    w(L) == 0 m'].join('\n'))).toContain('E-ODE-RANGE');
    expect(codes([...BEAM, 'solve w(x): E·I·w″ == -M(x) in 0 m .. L', '    w(0 m) == 0 m', '    w(L) == 0 m', 'u := w(7 m)'].join('\n'))).toContain('E-DOMAIN');
  });
});
