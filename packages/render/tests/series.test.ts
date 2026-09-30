import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@calccanvas/core';
import { catalogFor } from '@calccanvas/i18n';
import { buildPrintDocument, toText } from '../src/index.js';

const cs = catalogFor('cs');
const resultOf = (source: string) => {
  const block = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks.at(-1)!;
  return block.kind === 'equation' ? toText(block.lines.at(-1)!.rhs).replace(/\s+/g, ' ') : '';
};

describe('series in print', () => {
  it('show all items of a short series, with ";" in Czech', () => {
    expect(resultOf('v := [1.5, 2, 3] m')).toBe('[1,5;2;3] m');
  });

  it('shorten a long series to its start and end, with the count', () => {
    expect(resultOf('t := range(1, 25)')).toBe('[1;2;3;4;5;…;24;25] (25)');
  });

  it('write an item as a subscript', () => {
    const doc = buildPrintDocument(evaluateSheet('CF := [-1000, 300]\nx := CF[2]'), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const line = doc.blocks[1]!;
    expect(line.kind === 'equation' && toText(line.lines[0]!.rhs)).toBe('CF_2');
  });
});

describe('dates in print', () => {
  it('are written as calendar days in the language of the printout', () => {
    expect(resultOf('splatnost := 2026-09-29 + 30 d')).toBe('29. 10. 2026');
    const en = buildPrintDocument(evaluateSheet('d := 2026-09-29'), { catalog: catalogFor('en'), registry: defaultRegistry, digits: 4, title: 'T' }).blocks[0]!;
    expect(en.kind === 'equation' && toText(en.lines.at(-1)!.rhs)).toBe('9/29/2026');
  });
});

describe('a formula with nothing to substitute', () => {
  it('is not printed twice', () => {
    const doc = buildPrintDocument(evaluateSheet('CF := [-1000, 300, 400, 500]\ndoba := payback(CF)'), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const line = doc.blocks[1]!;
    expect(line.kind === 'equation' && line.lines.map((l) => l.role)).toEqual(['formula', 'result']);
  });
});
