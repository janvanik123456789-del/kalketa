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
    expect(html).toContain('<th class="num"><math display="inline"><mi>T</mi></math> <span class="unit">[°C]</span></th>');
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

  it('writes out the least squares method of a line on request: the sums, the slope and the intercept with numbers', () => {
    const doc = buildPrintDocument(evaluateSheet(`${MEASURED}T_fit := fit(Mereni.T, x: Mereni.t, steps: true)`), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const block = doc.blocks.at(-1)!;
    const lines = block.kind === 'equation' ? block.lines.map((l) => `${l.lhs ? toText(l.lhs) : ''} ${toText(l.rhs)}`.replace(/\s+/g, ' ').trim()) : [];
    expect(lines).toContain('n 4');
    expect(lines).toContain('∑t 60 s');
    expect(lines.find((l) => l.startsWith('b_1 ') && l.includes('n·∑t·T'))).toBeDefined();
    // The numbers put in, then the slope as the fit has it.
    expect(lines.some((l) => l.includes('4·') && l.includes('60 s'))).toBe(true);
    expect(lines).toContain('0,459 Δ°C/s');
    expect(lines.at(-2)).toBe('T_fit(t) 20,39 °C+0,459 Δ°C/s·t');
    // Kinds fitted on logarithms: the result only, and a word why.
    const codes = evaluateSheet(`${MEASURED}P := fit(Mereni.T, x: Mereni.t, kind: "exp", steps: true)`).diagnostics.map((d) => d.code);
    expect(codes).toEqual(['W-FIT-STEPS']);
  });

  it('writes out a polynomial by its normal equations: the sums, the system in letters and in numbers, the coefficients', () => {
    const points = 'table Body:\n    | x | y |\n    | 1 | 2.1 |\n    | 2 | 3.9 |\n    | 3 | 4.2 |\n    | 4 | 6.2 |\n    | 5 | 9.1 |\n';
    const sheet = evaluateSheet(`${points}P := fit(Body.y, x: Body.x, kind: "poly2", steps: true)`);
    expect(sheet.diagnostics).toEqual([]);
    const doc = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'P' });
    const block = doc.blocks.at(-1)!;
    const lines = block.kind === 'equation' ? block.lines.map((l) => `${l.lhs ? toText(l.lhs) : ''} ${l.op ?? ''} ${toText(l.rhs)}`.replace(/\s+/g, ' ').trim()) : [];
    expect(lines).toContain('∑x^4 = 979');
    expect(lines).toContain('∑x^2·y = 382,2');
    expect(lines).toContain('n·b_0+∑x·b_1+∑x^2·b_2 = ∑y');
    expect(lines).toContain('55·b_0+225·b_1+979·b_2 = 382,2');
    // The coefficients from the highest, as the system gives them (verified with numpy.polyfit).
    expect(lines.filter((l) => l.startsWith('b_'))).toEqual(['b_2 = 0,2786', 'b_1 = −0,04143', 'b_0 = 2,16']);
    // A negative coefficient is subtracted in the curve.
    expect(lines.find((l) => l.startsWith('P(x)'))).toBe('P(x) = 2,16−0,04143·x+0,2786·x^2');
  });

  it('prints a fit over a temperature in °C from the zero of the scale, as the reader evaluates it', () => {
    const ntc = 'table NTC:\n    | T [°C] | R [kΩ] |\n    | 0 | 33.62 |\n    | 10 | 20.17 |\n    | 20 | 12.54 |\n    | 30 | 8.037 |\n    | 40 | 5.301 |\n';
    const sheet = evaluateSheet(`${ntc}P := polyfit(NTC.T, NTC.R, 2)\nR_37 := P(37 °C)`);
    expect(sheet.diagnostics).toEqual([]);
    const doc = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'P' });
    const block = doc.blocks.find((b) => b.kind === 'equation' && b.lines.some((l) => l.lhs && toText(l.lhs) === 'P(T)'));
    const lines = block?.kind === 'equation' ? block.lines.map((l) => `${l.lhs ? toText(l.lhs) : ''} ${l.op ?? ''} ${toText(l.rhs)}`.replace(/\s+/g, ' ').trim()) : [];
    expect(lines.find((l) => l.startsWith('P(T)'))).toBe('P(T) = 33,2 kΩ−1,389 kΩ/°C·(T−0 °C)+0,01754 kΩ/°C²·(T−0 °C)^2');
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

describe('a load recapitulation in a sheet table', () => {
  it('calculates a column from its formula, sums the rows of totals, prints both', () => {
    const source = 'γ_G := 1.35\ntable Stale:\n    | polozka | h [mm] | ρ [kN/m³] | g_k [kN/m²] = h·ρ | g_d [kN/m²] = g_k·γ_G |\n    | dlažba | 10 | 22 | | |\n    | beton | 150 | 25 | | |\n    | Celkem | | | Σ | Σ |\ng := sum(Stale.g_d)';
    const result = evaluateSheet(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.statements.at(-1)!.display).toMatchObject({ value: 5.3595, unit: 'kN/m²' });
    const html = printHtml(result, { catalog: cs, registry: defaultRegistry, title: 'T' });
    expect(html).toContain('<tr class="total"><td>Celkem</td><td class="num"></td><td class="num"></td><td class="num">3,97</td><td class="num">5,36</td></tr>');
    expect(html).toContain('<td class="num">0,22</td><td class="num">0,297</td>');
    expect(html).toContain('<div class="formula">= ');
  });
});

describe('positions in print', () => {
  it('put Pos. n before the title and print a value of another position as A (Pos. 1)', () => {
    const html = printHtml(evaluateSheet('## Stropní deska {pos}\nA := 10 kN\n## Průvlak {pos}\nF := Pos1.A'), { catalog: cs, registry: defaultRegistry, title: 'T' });
    expect(html).toContain('<h3 class="position-head"><span class="position">Pos. 1</span> Stropní deska</h3>');
    expect(html).toContain('<mtext>Pos. 1</mtext>');
  });
});
