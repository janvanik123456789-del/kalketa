import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';
import { codes } from './helpers.js';

const value = (source: string, name: string) => (evaluateSheet(source).values.get(name) as { si: number } | undefined)?.si;
const shown = (source: string, name: string) => {
  const d = evaluateSheet(source).statements.find((r) => r.statement.kind === 'definition' && r.statement.name === name)?.display;
  return d ? `${Number(d.value.toPrecision(4))} ${d.unit}` : '';
};

describe('distributions of measured data', () => {
  it('give quantiles and distribution functions as SciPy does', () => {
    // scipy.stats.t.ppf(0.975, 21), norm.ppf(0.975), t.ppf(0.995, 3), t.ppf(0.025, 1), norm.ppf(1e-6), t.ppf(0.975, 2.5)
    expect(value('k := tinv(0.975, 21)', 'k')).toBeCloseTo(2.0796138447276795, 10);
    expect(value('z := norminv(0.975)', 'z')).toBeCloseTo(1.959963984540054, 10);
    expect(value('k := tinv(0.995, 3)', 'k')).toBeCloseTo(5.840909309733355, 9);
    expect(value('k := tinv(0.025, 1)', 'k')).toBeCloseTo(-12.706204736174705, 8);
    expect(value('z := norminv(1e-6)', 'z')).toBeCloseTo(-4.753424308822899, 9);
    expect(value('k := tinv(0.975, 2.5)', 'k')).toBeCloseTo(3.5746548420036817, 9);
    expect(value('p := tcdf(2.0796, 21)', 'p')).toBeCloseTo(0.974999304273018, 10);
    expect(value('p := normcdf(1.96)', 'p')).toBeCloseTo(0.9750021048517795, 12);
    expect(value('p := normcdf(-8)', 'p')).toBeCloseTo(6.22096057427178e-16, 25);
  });

  it('take only probabilities between 0 and 1, positive degrees of freedom and plain numbers', () => {
    expect(codes('k := tinv(1, 21)')).toEqual(['E-DOMAIN']);
    expect(codes('k := tinv(0.975, 0)')).toEqual(['E-DOMAIN']);
    expect(codes('z := norminv(0)')).toEqual(['E-DOMAIN']);
    expect(codes('z := normcdf(2 m)')).toEqual(['E-FUNC-ARG-DIM']);
  });
});

describe('the middle of absolute temperatures', () => {
  it('is an absolute temperature, their spread a difference (NIST TN 1900, E2)', () => {
    const sheet = 't := [18.75, 28.25, 25.75] °C\nt_avg := mean(t)\nt_med := median(t)\ns := stdev(t)\nU := tinv(0.975, 2)·s/sqrt(3)\nt_high := t_avg + U';
    expect(codes(sheet)).toEqual([]);
    expect(shown(sheet, 't_avg')).toBe('24.25 °C');
    expect(shown(sheet, 't_med')).toBe('25.75 °C');
    expect(shown(sheet, 's')).toBe('4.924 Δ°C');
    expect(shown(sheet, 't_high')).toMatch(/ °C$/);
  });
});

describe('a series of temperatures', () => {
  it('written with °C after the brackets is of temperatures, as 20 °C is', () => {
    const sheet = 't := [20, 25] °C\na := t[1] | K\nd := t[2] - t[1]';
    expect(value(sheet, 'a')).toBeCloseTo(293.15, 9);
    expect(shown(sheet, 'd')).toBe('5 Δ°C');
  });
});

describe('principal stresses', () => {
  it('keep the unit of a stress tensor (VŠB Pružnost a pevnost, příklad 9.1)', () => {
    const sheet = ['T := [80, 40, 0 | 40, 20, 0 | 0, 0, -15] MPa', 'σ := eigenvals(T)', 's_1 := max(σ)'].join(String.fromCharCode(10));
    expect(shown(sheet, 's_1')).toBe('100 MPa');
  });
});

