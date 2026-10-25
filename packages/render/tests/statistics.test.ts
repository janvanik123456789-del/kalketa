import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, toText } from '../src/index.js';

const lines = (source: string) => {
  const doc = buildPrintDocument(evaluateSheet(source), { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'T' });
  const last = doc.blocks.at(-1)!;
  return last.kind === 'equation' ? last.lines.map((l) => toText(l.rhs).replace(/\s/g, ' ')) : [];
};

describe('statistics of a series in print', () => {
  it('write the mean as t̄ and put in its value, not the function again', () => {
    expect(lines('t_i := [18.60, 18.55, 18.60, 18.70, 18.65] s\nT_k := mean(t_i)/8')).toEqual(['(t̄)/8', '(18,62 s)/8', '2,327 s']);
  });

  it('write the standard deviation as s_t and the count by its value', () => {
    expect(lines('t_i := [18.60, 18.55, 18.60, 18.70, 18.65] s\nu_A := stdev(t_i)/sqrt(len(t_i))')).toEqual(['s_t/√(len(t_i))', '(0,05701 s)/√(5)', '0,0255 s']);
  });

  it('keep the name of the function for an expression that is not a series of the sheet', () => {
    expect(lines('x := mean([1, 2, 6])')[0]).toBe('mean([1;2;6])');
  });
});
