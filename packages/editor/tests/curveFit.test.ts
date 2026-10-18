import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { applyEdits, APPROXIMATE, curveName, fitCharts, fitEdits, fitLines, fits, fitSeries, INTERPOLATE, readFit, type FitChoice } from '../src/logic/curveFit.js';

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

describe('Fit a curve: into a chart of the sheet, and a curve read back to be edited', () => {
  const CHARTED = `${SHEET}L := fit(Y, x: X)\nplot(Y, L(u), u: X, title: "Body a přímka")\n`;
  const result = evaluateSheet(CHARTED);
  const series = fitSeries(result);
  const [, , X, Y] = series;

  it('finds the charts of the sheet and adds a curve to one: the curve above it, its call in it', () => {
    const charts = fitCharts(result);
    expect(charts.map((c) => [c.line, c.label, c.binder])).toEqual([[13, 'Body a přímka', 'u']]);
    const choice: FitChoice = { x: X!, y: Y!, method: 'spline', degree: 2, name: 'Y_spl', steps: false, chart: true };
    const { text, touched } = applyEdits(CHARTED, fitEdits(choice, { kind: 'chart', chart: charts[0]! }));
    expect(text.split('\n').slice(12, 14)).toEqual(['Y_spl(x) := spline(X, Y, x)', 'plot(Y, L(u), Y_spl(u), u: X, title: "Body a přímka")']);
    expect(touched).toEqual([13, 14]);
    const after = evaluateSheet(text);
    expect(after.diagnostics).toEqual([]);
    expect(after.statements.find((s) => s.plot)?.plot?.series).toHaveLength(3);
  });

  it('puts a new curve and its chart after the line asked, or in place of the one edited', () => {
    const choice: FitChoice = { x: X!, y: Y!, method: 'pchip', degree: 2, name: 'Y_pch', steps: false, chart: true };
    expect(applyEdits('a := 1\nb := 2', fitEdits(choice, { kind: 'new', after: 1 }))).toEqual({ text: 'a := 1\nY_pch(x) := pchip(X, Y, x)\nplot(Y, Y_pch(x), x: X)\nb := 2', touched: [2, 3] });
    expect(applyEdits('a := 1\nold\nb := 2', fitEdits(choice, { kind: 'replace', start: 2, end: 2 }))).toEqual({ text: 'a := 1\nY_pch(x) := pchip(X, Y, x)\nb := 2', touched: [2] });
  });

  it('reads back every curve it writes, and leaves others to the hand', () => {
    for (const method of [...APPROXIMATE, ...INTERPOLATE]) {
      if (!fits(method, X!, Y!, 3)) continue;
      const choice: FitChoice = { x: X!, y: Y!, method, degree: 3, name: 'C', steps: method === 'poly', chart: false };
      const sheet = `${SHEET}${fitLines(choice)[0]}\n`;
      const own = evaluateSheet(sheet).statements.at(-1)!.statement;
      const read = readFit(own, sheet, series);
      expect(read?.choice, method).toEqual({ ...choice, degree: method === 'poly' ? 3 : 2 });
      expect([read?.start, read?.end]).toEqual([12, 12]);
    }
    const other = `${SHEET}C(x) := interp1(X, Y, x, "nearest")\n`;
    expect(readFit(evaluateSheet(other).statements.at(-1)!.statement, other, series)).toBeUndefined();
  });
});
