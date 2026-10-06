import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, printHtml, toText } from '../src/index.js';

const cs = catalogFor('cs');
const MEASURED = 'table Mereni:\n    | t [s] | T [°C] {0.0} | poznamka |\n    | 0 | 20.1 | start |\n    | 10 | 25.3 | |\n    | 20 | 29.8 | tlak |\n    | 30 | 33.9 | |\n';

describe('a table written in the sheet', () => {
  it('is a table of the calculation: columns as series in their units, text as text', () => {
    const sheet = evaluateSheet(`${MEASURED}T_max := max(Mereni.T)\nt_3 := Mereni.t[3]`);
    expect(sheet.diagnostics).toEqual([]);
    expect(sheet.statements.at(-2)!.display).toMatchObject({ unit: '°C' });
    expect(sheet.statements.at(-2)!.display!.value).toBeCloseTo(33.9);
    expect(sheet.statements.at(-1)!.display).toEqual({ value: 20, unit: 's' });
  });

  it('prints as a table: the header with units, numbers in the column format and to the right', () => {
    const html = printHtml(evaluateSheet(MEASURED), { catalog: cs, registry: defaultRegistry, title: 'T' });
    expect(html).toContain('<caption>Mereni</caption>');
    expect(html).toContain('<th class="num">T <span class="unit">[°C]</span></th>');
    expect(html).toContain('<td class="num">25,3</td>');
    expect(html).toContain('<td>tlak</td>');
  });

  it('reports a name taken twice', () => {
    expect(evaluateSheet(`Mereni := 5\n${MEASURED}`).diagnostics.map((d) => d.code)).toEqual(['E-REDEFINED']);
  });
});

describe('fit: a curve through measured points', () => {
  it('gives a function with the coefficients in units, callable, and its R²', () => {
    const sheet = evaluateSheet(`${MEASURED}T_fit := fit(Mereni.T, x: Mereni.t, kind: "linear")\nT_45 := T_fit(45 s)`);
    expect(sheet.diagnostics).toEqual([]);
    const fitted = sheet.statements.at(-2)!.value;
    expect(fitted?.type === 'function' && fitted.fit?.r2).toBeCloseTo(0.99709, 4);
    expect(sheet.statements.at(-1)!.display!.value).toBeCloseTo(41.045, 2);
  });

  it('prints the call, the equation with the numbers found and R²', () => {
    const doc = buildPrintDocument(evaluateSheet(`${MEASURED}T_fit := fit(Mereni.T, x: Mereni.t)`), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const block = doc.blocks.at(-1)!;
    const lines = block.kind === 'equation' ? block.lines.map((l) => [l.lhs && toText(l.lhs), toText(l.rhs).replace(/\s/g, ' ')]) : [];
    expect(lines[1]![0]).toBe('T_fit(t)');
    expect(lines[1]![1]).toBe('20,39 °C+0,459 Δ°C/s·t');
    expect(lines[2]).toEqual(['R^2', '0,9971']);
  });

  it('fits polynomials and refuses what cannot be fitted', () => {
    const poly = evaluateSheet(`${MEASURED}P := fit(Mereni.T, x: Mereni.t, kind: "poly2")`).statements.at(-1)!.value;
    expect(poly?.type === 'function' && poly.fit?.r2).toBeGreaterThan(0.9999);
    const codes = (line: string) => evaluateSheet(`${MEASURED}${line}`).diagnostics.map((d) => d.code);
    expect(codes('F := fit(Mereni.T, x: Mereni.t, kind: "log")')).toEqual(['E-FIT-POSITIVE']);
    expect(codes('F := fit(Mereni.T, x: Mereni.t, kind: "spline")')).toEqual(['E-FIT-KIND']);
    expect(codes('F := fit(Mereni.T, x: Mereni.t, kind: "poly3")')).toEqual(['E-FIT-POINTS']);
  });
});
