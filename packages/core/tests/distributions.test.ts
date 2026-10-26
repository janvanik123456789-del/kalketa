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

describe('zeros without a unit in matrices and series', () => {
  it('take the unit of the other items when they share one, as on paper', () => {
    const nl = String.fromCharCode(10);
    const sheet = ['B := [0, 0, 1 m | 0, 1 m, 0]', 'C := B + [1 m, 2 m, 3 m | 4 m, 5 m, 6 m]', 'v := [0, 2 m, 5 m]', 'w := v + [1 m, 1 m, 1 m]'].join(nl);
    expect(codes(sheet)).toEqual([]);
    // Among items of different units a zero stays plain: [1 m, 0 | 0, 1].
    expect(codes('K := [1 m, 0 | 0, 1]')).toEqual([]);
    expect(codes('v := [1, 2 m]')).toEqual(['E-UNIT-MISMATCH']);
  });
});

describe('discrete distributions', () => {
  it('give counts and probabilities as SciPy does (VŠB příklad 5.1)', () => {
    // scipy.special.comb(8, 3), stats.binom.pmf(3, 8, 0.49), binom.cdf(2, 8, 0.49), poisson.pmf(2, 1.5), poisson.cdf(2, 1.5)
    expect(value('c := nchoosek(8, 3)', 'c')).toBe(56);
    expect(value('c := nchoosek(60, 30)', 'c')).toBe(118264581564861424);
    expect(value('p := binopdf(3, 8, 0.49)', 'p')).toBeCloseTo(0.22731450422743438, 14);
    expect(value('p := binocdf(2, 8, 0.49)', 'p')).toBeCloseTo(0.1580516166573621, 14);
    expect(value('p := poisspdf(2, 1.5)', 'p')).toBeCloseTo(0.25102143016698353, 14);
    expect(value('p := poisscdf(2, 1.5)', 'p')).toBeCloseTo(0.8088468305380585, 14);
    expect(value('p := poisspdf(150, 100)', 'p')).toBeCloseTo(6.511160468786359e-7, 18);
  });

  it('take only whole counts and probabilities from 0 to 1', () => {
    expect(codes('c := nchoosek(3, 5)')).toEqual(['E-DOMAIN']);
    expect(codes('c := nchoosek(8.5, 3)')).toEqual(['E-DOMAIN']);
    expect(codes('p := binopdf(3, 8, 1.2)')).toEqual(['E-DOMAIN']);
  });
});

