import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, type ImportedValue } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { addLayer, appendixLayers, evaluateDocument, newDocument, updateLayer, type Layer } from '@kalketa/sheet';
import { buildPrintDocument, notesHtml, notesImages, printHtml } from '../src/index.js';

const cs = catalogFor('cs');

describe('notes', () => {
  it('render headings, paragraphs, lists, citations, figures and links', () => {
    const html = notesHtml(
      '# Teorie ohybu\nNormálové napětí je\nrozloženo lineárně.\n\n- pružné chování\n- malé průhyby\n\n> ČSN EN 1993-1-1, čl. 6.2.5\n\n![Obr. 1: průřez](layers/l4/images/obr1.png)\n\nViz [norma](https://example.org/en1993) a **pozor** na *klopení*.',
      { resolveFile: (p) => (p.endsWith('obr1.png') ? 'data:image/png;base64,AA' : undefined) },
    );
    expect(html).toContain('<h2>Teorie ohybu</h2>');
    expect(html).toContain('<p>Normálové napětí je<br>rozloženo lineárně.</p>');
    expect(html).toContain('<ul><li>pružné chování</li><li>malé průhyby</li></ul>');
    expect(html).toContain('<blockquote class="citation">ČSN EN 1993-1-1, čl. 6.2.5</blockquote>');
    expect(html).toContain('<img src="data:image/png;base64,AA" alt="Obr. 1: průřez"><figcaption>Obr. 1: průřez</figcaption>');
    expect(html).toContain('<a href="https://example.org/en1993">norma</a>');
    expect(html).toContain('<strong>pozor</strong> na <em>klopení</em>');
  });

  it('never pass HTML or unsafe links through', () => {
    const html = notesHtml('<script>alert(1)</script>\n[x](javascript:alert(1))\n![a](x.png" onerror="y)');
    expect(html).not.toMatch(/<script|href="javascript|onerror="/);
  });

  it('mark missing pictures and list the pictures used', () => {
    expect(notesHtml('![a](layers/x/images/b.png)')).toContain('class="missing-image"');
    expect(notesImages('text\n![a](p1.png)\n![b](p2.jpg)')).toEqual(['p1.png', 'p2.jpg']);
  });
});

describe('values from auxiliary layers in print', () => {
  it('say where they come from', () => {
    const imports = new Map<string, ImportedValue>([['q', { value: evaluateSheet('q := 12 kN/m').values.get('q')!, layer: 'l4', layerName: 'Zatížení' }]]);
    const result = evaluateSheet('L := 5 m\nM := q·L²/8', { imports });
    const doc = buildPrintDocument(result, { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T', importSource: () => 'Příloha A: Zatížení' });
    expect(doc.blocks[1]).toMatchObject({ kind: 'equation', imported: ['q (Příloha A: Zatížení)'] });
    expect(doc.blocks[0]).not.toHaveProperty('imported');
  });
});

describe('appendices', () => {
  function document() {
    const base = newDocument('Nosník', '# Nosník\nL := 5 m\nM := q·L²/8 | kN·m');
    let calc = addLayer(base.layers, 'calc', 'Zatížení');
    let layers: Layer[] = updateLayer(calc.layers, calc.id, { text: 'q := 1.35·3.5 kN/m + 1.5·8 kN/m' });
    const unused = addLayer(layers, 'calc', 'Varianta B');
    layers = updateLayer(unused.layers, unused.id, { text: 'x := 1 m' });
    const notes = addLayer(layers, 'sources', 'Teorie');
    layers = updateLayer(notes.layers, notes.id, { text: '> ČSN EN 1990', appendix: true });
    const hiddenNotes = addLayer(layers, 'sources', 'Soukromé');
    layers = updateLayer(hiddenNotes.layers, hiddenNotes.id, { text: 'nepatří do tisku' });
    return { ...base, layers };
  }

  it('are the used auxiliary calculations and the layers marked for print, in layer order', () => {
    const doc = document();
    const { evaluation } = evaluateDocument(doc, defaultRegistry);
    const appendices = appendixLayers(doc.layers, evaluation, (l) => l.kind);
    expect(appendices.map((a) => [a.kind, a.name])).toEqual([
      ['calc', 'Zatížení'],
      ['notes', 'Teorie'],
    ]);
  });

  it('are printed after the sheet with titles, and the sheet points to them', () => {
    const doc = document();
    const { result, evaluation } = evaluateDocument(doc, defaultRegistry);
    const html = printHtml(result, { catalog: cs, registry: defaultRegistry, title: 'Nosník', appendices: appendixLayers(doc.layers, evaluation, (l) => l.kind) });
    const sheet = html.indexOf('<main>');
    const first = html.indexOf('Příloha A: Zatížení</h1>');
    const second = html.indexOf('Příloha B: Teorie</h1>');
    expect(sheet).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(sheet);
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('Převzaté hodnoty: q (Příloha A: Zatížení)');
    expect(html).toContain('<blockquote class="citation">ČSN EN 1990</blockquote>');
    expect(html).not.toContain('nepatří do tisku');
    expect(html).not.toContain('Varianta B');
  });
});
