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
