import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@calccanvas/core';
import { catalogFor } from '@calccanvas/i18n';
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

  it('uses "=" even where definitions use "≔"', () => {
    const html = renderBlockHtml(block, cs, { defineOperator: '≔' });
    expect(html).not.toContain('≔');
  });
});
