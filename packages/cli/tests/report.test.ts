import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { formatReport } from '../src/report.js';

const report = (source: string) => formatReport(evaluateSheet(source), { catalog: catalogFor('cs'), digits: 4 });

describe('the report of the command line', () => {
  it('shows a value as written, a result in significant digits, an angle without a space', () => {
    const text = report('M_r := 39.997 g/mol\nm := 2·M_r\nβ := 120°');
    expect(text).toContain('M_r = 39,997 g/mol');
    expect(text).toContain('m = 79,99 g/mol');
    expect(text).toContain('β = 120°');
  });

  it('says how a differential equation was solved', () => {
    const text = report('solve w(x): w″ == 1/m in 0 m .. 2 m\n    w(0 m) == 0 m\n    w(2 m) == 0 m');
    expect(text).toMatch(/w\(x\) ⇒ numerické řešení \(Runge–Kutta, \d+ kroků\)/);
  });
});

describe('a fitted curve in the report', () => {
  it('shows its equation and R²', () => {
    const text = report('x := [1, 2, 3]\ny := [2, 4, 6.1]\np := polyfit(x, y, 1)');
    expect(text).toContain('p(x) = 2,05·x − 0,06667   R² = 0,9998');
  });
});
