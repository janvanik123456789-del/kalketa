import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlockHtml } from '../src/index.js';

const printed = (source: string) => {
  const doc = buildPrintDocument(evaluateSheet(source), { catalog: catalogFor('en'), registry: defaultRegistry, digits: 4, title: '' });
  return doc.blocks.map((b) => renderBlockHtml(b, catalogFor('en'))).join('\n').replace(/<[^>]+>/g, ' ').replace(/[\s\u2009\u00a0]+/g, ' ');
};

describe('what the print rounds away', () => {
  it('tells different items of a series apart', () => {
    expect(printed('V := [10.000172, 10.000116] V')).toContain('10.0002');
    expect(printed('V := [10.000172, 10.000116] V')).toContain('10.0001');
  });

  it('leaves a series whose items differ in what is shown, and places asked for', () => {
    expect(printed('V := [1.23456, 7.5] V')).toContain('1.235');
    expect(printed('V := [10.000172, 10.000116] V {decimals=2}')).toContain('10.00');
  });

  it('keeps the whole part of money in a series and a matrix', () => {
    expect(printed('M := [697123 USD, 2 USD | 3 USD, 4 USD]\nx := M')).toMatch(/697,123/);
    expect(printed('S := [697123 USD, 2 USD]\nx := S')).toMatch(/697,123/);
  });

  it('writes out a whole number calculated exactly', () => {
    expect(printed('n := 8^9 - 8')).toMatch(/134,217,720/);
  });
});
