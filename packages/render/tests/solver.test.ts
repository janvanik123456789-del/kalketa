import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlockHtml, toText } from '../src/index.js';

const cs = catalogFor('cs');

describe('solve in print', () => {
  const result = evaluateSheet('solve (x, y): x² + y² == 25, y == x + 1 guess x = 1, y = 1');
  const doc = buildPrintDocument(result, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
  const block = doc.blocks[0]!;

  it('shows the equations and then the values found', () => {
    expect(block.kind === 'equation' && block.lines.map((l) => [l.role, l.lhs && toText(l.lhs), l.op, toText(l.rhs)])).toEqual([
      ['formula', 'x^2+y^2', '=', '25'],
      ['formula', 'y', '=', 'x+1'],
      ['result', 'x', '=', '3'],
      ['result', 'y', '=', '4'],
    ]);
  });

  it('shows the interval of a single unknown', () => {
    const one = buildPrintDocument(evaluateSheet('solve x: x² + 2·x == 8 in 0 .. 10'), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks[0]!;
    expect(one.kind === 'equation' && one.lines.map((l) => toText(l.rhs))).toEqual(['8', '0≤x≤10', '2']);
  });

  it('puts in the values of its own position where a later position defines the names again', () => {
    // E4 of the samples: R_3 and I_3 of Pos. 1 are other values in Pos. 2.
    const sheet = evaluateSheet(['## A {pos}', 'R := 10 Ω', 'I := 2 A', 'U := R·I', '## B {pos}', 'R := 3 Ω', 'I := 5 A'].join('\n'));
    const u = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks.find((b) => b.kind === 'equation' && b.line === 4)!;
    expect(u.kind === 'equation' && u.lines.map((l) => toText(l.rhs).replace(/\s/g, ' '))).toEqual(['R·I', '10 Ω·2 A', '20 V']);
  });

  it('gives a linear system with exact coefficients its exact solution', () => {
    const sheet = evaluateSheet(['solve (I_1, I_2, I_3): {exact}', '    I_1 + I_2 - I_3 == 0', '    0.5 Ω·I_1 - 1.5 Ω·I_2 == 1.5 V', '    1.5 Ω·I_2 + 10 Ω·I_3 == 4.5 V', '    guess I_1 = 1 A, I_2 = 1 A, I_3 = 1 A'].join('\n'));
    const solve = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks[0]!;
    expect(solve.kind === 'equation' && solve.lines.filter((l) => l.role === 'result').map((l) => toText(l.rhs).replace(/\s/g, ' '))).toEqual(['96/83 A≐1,157 A', '−51/83 A≐−0,6145 A', '45/83 A≐0,5422 A']);
  });

  it('writes out a function of the sheet in an equation solved numerically, before its interval', () => {
    // E(y_0) = E(y_1) is a cubic in y_0: no formula, but the function is still written out (H4 of the samples).
    const sheet = evaluateSheet(['q := 4.3 m²/s', 'g := 9.81 m/s²', 'E(y) := y + q^2/(2·g·y^2)', 'y_1 := 0.3726 m', 'solve y_0: E(y_0) == E(y_1) in 1.3 m .. 20 m'].join('\n'));
    const solve = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks.at(-1)!;
    expect(solve.kind === 'equation' && solve.lines.map((l) => toText(l.rhs).replace(/\s/g, ' '))).toEqual(['E(y_1)', 'y_0+(q^2)/(2·g·y_0^2)=y_1+(q^2)/(2·g·y_1^2)', '1,3 m≤y_0≤20 m', '7,142 m']);
  });

  it('shows the formula the unknown was expressed by, with the values put in, then the result', () => {
    const sheet = evaluateSheet('M_Ed := 37.5 kN·m\nq := 12 kN/m\nsolve L: M_Ed == q·L²/8');
    const solve = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks.at(-1)!;
    expect(solve.kind === 'equation' && solve.lines.map((l) => [l.role, l.lhs && toText(l.lhs), toText(l.rhs).replace(/\s/g, ' ')])).toEqual([
      ['formula', 'M_Ed', '(q·L^2)/8'],
      ['formula', 'L', '√((8·M_Ed)/q)'],
      ['substitution', undefined, '√((8·37,5 kN·m)/(12 kN/m))'],
      ['result', undefined, '5 m'],
    ]);
  });

  it('writes the coefficients of a quadratic without "+ −" and "·−", its roots in the unit of the condition', () => {
    const sheet = evaluateSheet(
      ['m_1 := 9 kg', 'm_2 := 1 kg', 'k_1 := 38 N/m', 'k_2 := 2 N/m', 'k_3 := 3 N/m', 'solve Ω ∈ ℝ, Ω > 0 s^-2: (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0'].join('\n'),
    );
    const solve = buildPrintDocument(sheet, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks.at(-1)!;
    const lines = solve.kind === 'equation' ? solve.lines.map((l) => toText(l.rhs)) : [];
    expect(lines.some((l) => /\+−|·−/.test(l))).toBe(false);
    const roots = solve.kind === 'equation' ? solve.lines.filter((l) => l.role === 'result' && l.lhs && /Ω_[12]/.test(toText(l.lhs))).map((l) => toText(l.rhs).replace(/\s/g, ' ')) : [];
    expect(roots).toEqual(['5,444 s⁻²', '4 s⁻²']);
  });

  it('uses "=" even where definitions use "≔"', () => {
    const html = renderBlockHtml(block, cs, { defineOperator: '≔' });
    expect(html).not.toContain('≔');
  });
});

describe("a sheet's own units in print", () => {
  it('show a unit given by a value as an assumption, and errors of unit lines', () => {
    const doc = buildPrintDocument(evaluateSheet('dimension Mena\nunit CZK: Mena\nunit EUR := 25 CZK\nunit X: Nic'), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    expect(doc.blocks.map((b) => b.kind)).toEqual(['equation', 'error']);
    const rate = doc.blocks[0]!;
    const plain = (text: string) => text.replace(/\s+/g, ' ');
    expect(rate.kind === 'equation' && rate.lines.map((l) => [l.lhs && plain(toText(l.lhs)), l.op, plain(toText(l.rhs))])).toEqual([['1 EUR', '=', '25 CZK']]);
  });
});

describe('a conversion in print', () => {
  it('shows both units', () => {
    const doc = buildPrintDocument(evaluateSheet('100 EUR | CZK =\n5 m =', { }), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    // EUR is not known here: the first line is an error; a plain value keeps one line.
    expect(doc.blocks[1]!.kind === 'equation' && doc.blocks[1]!.lines.length).toBe(1);
    const converted = buildPrintDocument(evaluateSheet('1.5 km | m ='), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks[0]!;
    expect(converted.kind === 'equation' && converted.lines.map((l) => toText(l.rhs).replace(/\s+/g, ' '))).toEqual(['1,5 km', '1 500 m']);
  });
});
