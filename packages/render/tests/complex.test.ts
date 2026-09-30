import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@calccanvas/core';
import { catalogFor, formatValue } from '@calccanvas/i18n';
import { buildPrintDocument, toText } from '../src/index.js';

const cs = catalogFor('cs');
const plain = (text: string) => text.replace(/\s+/g, ' ');

describe('complex values in print', () => {
  it('are written with j, in parentheses before a unit', () => {
    const doc = buildPrintDocument(evaluateSheet('Z := (3 + 4j) Ω\nI := 230 V / Z'), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const current = doc.blocks[1]!;
    const lines = current.kind === 'equation' ? current.lines.map((l) => plain(toText(l.rhs))) : [];
    expect(lines.at(-1)).toBe('(27,6−36,8j) A');
    // The substitution puts the complex value in parentheses.
    expect(lines[1]).toContain('(3+4j) Ω');
  });

  it('are formatted the same way in text', () => {
    expect(formatValue(27.6, -36.8, 'A', cs)).toBe('(27,6 − 36,8j) A');
    expect(formatValue(0, 5, 'Ω', cs)).toBe('5j Ω');
    expect(formatValue(3, 4, '', cs)).toBe('3 + 4j');
  });
});
