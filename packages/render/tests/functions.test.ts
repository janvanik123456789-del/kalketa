import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@calccanvas/core';
import { catalogFor } from '@calccanvas/i18n';
import { buildPrintDocument, printHtml, toText } from '../src/index.js';

const cs = catalogFor('cs');

describe('user functions in print', () => {
  const result = evaluateSheet('σ(M, W) := M/W\nσ_Ed := σ(37.5 kN·m, 194.3 cm³) | MPa');

  it('show the definition once, without substitution or result', () => {
    const doc = buildPrintDocument(result, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const definition = doc.blocks[0]!;
    expect(definition).toMatchObject({ kind: 'equation' });
    expect(definition.kind === 'equation' && definition.lines.map((l) => l.role)).toEqual(['formula']);
  });

  it('write the head as σ(M; W) in Czech and compute the call', () => {
    const doc = buildPrintDocument(result, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const head = doc.blocks[0]!.kind === 'equation' ? doc.blocks[0]!.lines[0]!.lhs : undefined;
    expect(head && toText(head)).toBe('σ(M;W)');
    expect(printHtml(result, { catalog: cs, registry: defaultRegistry, title: 'T' })).toContain('193');
  });
});
