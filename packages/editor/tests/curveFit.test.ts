import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { APPROXIMATE, curveName, fitLines, fits, fitSeries, INTERPOLATE, type FitChoice } from '../src/logic/curveFit.js';

const SHEET = 'table NTC:\n    | T [°C] | R [kΩ] | pozn |\n    | 0 | 33.62 | a |\n    | 10 | 20.17 | |\n    | 20 | 12.54 | |\n    | 30 | 8.037 | |\n    | 40 | 5.301 | |\n    | 50 | 3.588 | |\nX := [1, 2, 3, 4, 5]\nY := [2.1, 3.9, 4.2, 6.2, 9.1]\nc := 5\n';

describe('Insert > Fit a curve', () => {
  const result = evaluateSheet(SHEET);
  const series = fitSeries(result);

  it('offers the numeric columns of tables and the series of numbers, not text or single numbers', () => {
    expect(series.map((s) => s.expr)).toEqual(['NTC.T', 'NTC.R', 'X', 'Y']);
    expect(series[0]).toMatchObject({ column: 'T', length: 6 });
    expect(series[2]!.column).toBeUndefined();
  });

  it('writes a curve and its chart for every method, and the core evaluates them without a word', () => {
    const [T, R, X, Y] = series as [NonNullable<(typeof series)[0]>, NonNullable<(typeof series)[0]>, NonNullable<(typeof series)[0]>, NonNullable<(typeof series)[0]>];
    for (const method of [...APPROXIMATE, ...INTERPOLATE]) {
      for (const [x, y] of [[T, R], [X, Y]] as const) {
        if (!fits(method, x, y, 3)) continue;
        const choice: FitChoice = { x, y, method, degree: 3, name: curveName(y, method, new Set()), steps: true, chart: true };
        const lines = fitLines(choice);
        const sheet = evaluateSheet(`${SHEET}${lines.join('\n')}\n`);
        expect(sheet.diagnostics.map((d) => d.code), `${method} ${lines.join(' | ')}`).toEqual([]);
        expect(lines).toHaveLength(2);
      }
    }
  });

  it('writes the lines a user would: fit for an approximation, a function of x for an interpolation', () => {
    const [T, R] = series;
    expect(fitLines({ x: T!, y: R!, method: 'poly', degree: 2, name: 'R_fit', steps: true, chart: false })).toEqual(['R_fit := fit(NTC.R, x: NTC.T, kind: "poly2", steps: true)']);
    expect(fitLines({ x: T!, y: R!, method: 'exp', degree: 2, name: 'R_fit', steps: true, chart: false })).toEqual(['R_fit := fit(NTC.R, x: NTC.T, kind: "exp")']);
    expect(fitLines({ x: T!, y: R!, method: 'spline', degree: 2, name: 'R_spl', steps: false, chart: true })).toEqual(['R_spl(T) := spline(NTC.T, NTC.R, T)', 'plot(NTC.R, R_spl(T), T: NTC.T)']);
    expect(fitLines({ x: T!, y: R!, method: 'lagrange', degree: 2, name: 'R_lag', steps: false, chart: false })).toEqual(['R_lag := polyfit(NTC.T, NTC.R, 5)']);
  });

  it('names the curve after y without taking a name of the sheet, and knows how many points a method needs', () => {
    expect(curveName(series[1]!, 'spline', new Set(['R_spl']))).toBe('R_spl2');
    expect(curveName(series[3]!, 'line', new Set())).toBe('Y_fit');
    const [T, R, X, Y] = series;
    expect(fits('poly', X!, Y!, 3)).toBe(true);
    expect(fits('poly', X!, Y!, 4)).toBe(false);
    expect(fits('lagrange', X!, Y!)).toBe(true);
    // A temperature in °C (and its 0 °C) takes no logarithm; exp works on the reading.
    expect(fits('power', T!, R!)).toBe(false);
    expect(fits('log', T!, R!)).toBe(false);
    expect(fits('exp', T!, R!)).toBe(true);
    expect(fits('power', X!, Y!)).toBe(true);
    expect(fits('spline', T!, Y!)).toBe(false);
  });
});
