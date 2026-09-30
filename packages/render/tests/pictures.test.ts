import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, formatPicture, parsePicture } from '@calccanvas/core';
import { catalogFor } from '@calccanvas/i18n';
import { buildPrintDocument, renderBlockHtml } from '../src/index.js';

const cs = catalogFor('cs');

describe('pictures in the sheet', () => {
  it('are read and written as Markdown picture lines', () => {
    expect(parsePicture('![Schéma nosníku](images/sheet/nosnik.png){width=60%}')).toEqual({ caption: 'Schéma nosníku', path: 'images/sheet/nosnik.png', width: 60 });
    expect(parsePicture('![](images/sheet/a.png)')).toEqual({ caption: '', path: 'images/sheet/a.png' });
    expect(parsePicture('![a](b.png){width=150%}')).toBeUndefined();
    expect(formatPicture({ caption: 'Řez [A]', path: 'images/sheet/rez.png', width: 42.4 })).toBe('![Řez  A](images/sheet/rez.png){width=42%}');
  });

  it('are numbered, sized and shown from the files of the sheet', () => {
    const source = '# T\n![Schéma](images/sheet/s.png){width=50%}\n![](images/sheet/bez.png)\n![Řez](images/sheet/chybi.png)\nL := 5 m';
    const result = evaluateSheet(source);
    expect(result.diagnostics).toEqual([]);
    const doc = buildPrintDocument(result, {
      catalog: cs,
      registry: defaultRegistry,
      digits: 4,
      title: 'X',
      resolveFile: (path) => (path.includes('chybi') ? undefined : `data:${path}`),
    });
    const html = doc.blocks.filter((b) => b.kind === 'picture').map((b) => renderBlockHtml(b, cs));
    expect(html[0]).toContain('style="width:50%"');
    expect(html[0]).toContain('src="data:images/sheet/s.png"');
    expect(html[0]).toContain('Obr. 1:');
    expect(html[1]).not.toContain('figcaption');
    expect(html[2]).toContain('Obr. 2:');
    expect(html[2]).toContain('chybí');
  });

  it('report a malformed picture line', () => {
    expect(evaluateSheet('![Schéma](images/a.png){width=abc}').diagnostics.map((d) => d.code)).toEqual(['E-PICTURE-SYNTAX']);
  });
});
