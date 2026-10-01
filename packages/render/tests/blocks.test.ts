import { describe, expect, it } from 'vitest';
import { defaultRegistry } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { blockAppendices, evaluateDocument, newDocument } from '@kalketa/sheet';
import { printHtml } from '../src/index.js';

describe('blocks in print', () => {
  it('print each use after the sheet, and the sheet points to it', () => {
    const doc = {
      ...newDocument('Hala', 'N1 := Prosty_nosnik(L: 6 m)\nM := N1.M_max | kN·m'),
      blocks: new Map([['Prosty_nosnik', { source: 'input L := 5 m\ninput q := 12 kN/m\nM_max := q·L²/8 | kN·m', version: '1.2' }]]),
    };
    const { result } = evaluateDocument(doc, defaultRegistry);
    const html = printHtml(result, { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'Hala', appendices: blockAppendices(result) });
    expect(html).toContain('Výpočet bloku: Příloha A: Prosty nosnik – N1');
    expect(html).toContain('Příloha A: Prosty nosnik – N1</h1>');
    expect(html).toContain('<mtext>Prosty nosnik 1.2</mtext>');
    expect(html).toContain('<mtext>Prosty nosnik</mtext>');
    expect(html).toContain('54');
    // N1.M_max is printed as M_max(N1).
    expect(html).toMatch(/<msub><mi>M<\/mi><mi[^>]*>max<\/mi><\/msub><mrow><mo>\(<\/mo><mi[^>]*>N1<\/mi><mo>\)<\/mo><\/mrow>/);
  });
});
