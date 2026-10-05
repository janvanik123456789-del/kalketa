import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, formatPicture, parsePicture } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlockHtml, renderBlocksHtml } from '../src/index.js';

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

  it('read a side and write the options together', () => {
    expect(parsePicture('![S](a.png){width=40% side=right}')).toEqual({ caption: 'S', path: 'a.png', width: 40, side: 'right' });
    expect(parsePicture('![S](a.png){side=left}')).toEqual({ caption: 'S', path: 'a.png', side: 'left' });
    expect(parsePicture('![S](a.png){side=top}')).toBeUndefined();
    expect(parsePicture('![S](a.png){wrap=right width=30%}')).toEqual({ caption: 'S', path: 'a.png', width: 30, wrap: 'right' });
    expect(parsePicture('![S](a.png){side=left wrap=right}')).toBeUndefined();
    expect(parsePicture('![S](a.png){width=35% align=right}')).toEqual({ caption: 'S', path: 'a.png', width: 35, align: 'right' });
    expect(parsePicture('![S](a.png){align=right wrap=left}')).toBeUndefined();
    expect(formatPicture({ caption: 'S', path: 'a.png', align: 'left' })).toBe('![S](a.png){align=left}');
    expect(formatPicture({ caption: 'S', path: 'a.png', width: 30, wrap: 'right' })).toBe('![S](a.png){width=30% wrap=right}');
    expect(formatPicture({ caption: 'S', path: 'a.png', width: 35, side: 'left' })).toBe('![S](a.png){width=35% side=left}');
  });

  it('set the lines that follow beside a side picture, up to a blank line or a heading', () => {
    const source = '## Zadání\n![Schéma](images/sheet/s.png){width=40% side=right}\nL := 5 m\nq := 12 kN/m\n\nM := q·L²/8\n## Dál';
    const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'X', resolveFile: (path) => `data:${path}` });
    const picture = doc.blocks.find((b) => b.kind === 'picture');
    expect(picture?.kind === 'picture' && picture.beside).toEqual([3, 4]);
    const html = renderBlocksHtml(doc.blocks, cs);
    const group = html.slice(html.indexOf('<div class="side-group side-right" style="--side:40%">'));
    const rows = group.slice(0, group.indexOf('<div class="side-picture">'));
    expect(rows).toContain('data-line="3"');
    expect(rows).toContain('data-line="4"');
    expect(rows).not.toContain('data-line="6"');
  });

  it('end the flow around a wrapped picture at @clear', () => {
    const result = evaluateSheet('![S](images/sheet/s.png){width=35% wrap=right}\nL := 5 m\n@clear\n## Výpočet');
    expect(result.diagnostics).toEqual([]);
    const html = renderBlocksHtml(buildPrintDocument(result, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'X' }).blocks, cs);
    expect(html).toContain('wrap-right');
    expect(html.indexOf('<div class="clear"></div>')).toBeLessThan(html.indexOf('Výpočet'));
  });

  it('place a wrapped picture freely: from its edge and below its line', () => {
    expect(parsePicture('![S](a.png){width=35% wrap=right dx=20% dy=15mm}')).toEqual({ caption: 'S', path: 'a.png', width: 35, wrap: 'right', dx: 20, dy: 15 });
    expect(parsePicture('![S](a.png){width=35% dx=20%}')).toBeUndefined();
    expect(parsePicture('![S](a.png){wrap=left dx=120%}')).toBeUndefined();
    expect(formatPicture({ caption: 'S', path: 'a.png', width: 35, wrap: 'left', dx: 12.4, dy: 8.6 })).toBe('![S](a.png){width=35% wrap=left dx=12% dy=9mm}');
    const result = evaluateSheet('L := 5 m\n![S](images/sheet/s.png){width=35% wrap=right dx=20% dy=15mm}\nq := 12 kN/m');
    expect(result.diagnostics).toEqual([]);
    const html = renderBlocksHtml(buildPrintDocument(result, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'X' }).blocks, cs);
    expect(html).toContain('<div class="wrap-stop wrap-right" style="height:15mm"></div><figure');
    expect(html).toContain('style="width:35%;margin-right:20%;clear:right"');
  });

  it('never flow around a picture marked wrap=none', () => {
    expect(parsePicture('![S](a.png){align=right wrap=none}')).toEqual({ caption: 'S', path: 'a.png', align: 'right', noWrap: true });
    expect(parsePicture('![S](a.png){wrap=none wrap=right}')).toBeUndefined();
    expect(parsePicture('![S](a.png){side=left wrap=none}')).toBeUndefined();
    expect(formatPicture({ caption: 'S', path: 'a.png', width: 30, align: 'left', noWrap: true })).toBe('![S](a.png){width=30% align=left wrap=none}');
    expect(evaluateSheet('![S](images/sheet/s.png){wrap=none}').diagnostics).toEqual([]);
  });
});
