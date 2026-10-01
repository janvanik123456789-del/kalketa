import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { printHtml, revisionFooter } from '../src/index.js';

const cs = catalogFor('cs');

describe('the footer of a printout', () => {
  it('names the revision, a draft after it, or just the fingerprint', () => {
    expect(revisionFooter(cs, { hash: '3f9c 21ab', revision: { label: 'A', created: '2026-10-01T10:00:00Z' } })).toBe('Revize A (1. 10. 2026) · otisk 3f9c 21ab');
    expect(revisionFooter(cs, { hash: '3f9c 21ab', after: 'B' })).toBe('Rozpracováno po revizi B · otisk 3f9c 21ab');
    expect(revisionFooter(cs, { hash: '3f9c 21ab' })).toBe('Otisk 3f9c 21ab');
  });

  it('is printed at the bottom left of every page', () => {
    const html = printHtml(evaluateSheet('a := 1'), { catalog: cs, registry: defaultRegistry, title: 'T', footer: 'Otisk 3f9c 21ab' });
    expect(html).toContain('@bottom-left { content: "Otisk 3f9c 21ab"');
  });
});
