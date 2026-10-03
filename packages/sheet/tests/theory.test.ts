import { describe, expect, it } from 'vitest';
import { addLayer, defaultLayers, theorySections, updateLayer, withTheoryIds, type Layer } from '../src/index.js';

function withSources(...texts: string[]): Layer[] {
  let layers: Layer[] = defaultLayers();
  for (const text of texts) {
    const added = addLayer(layers, 'sources', 'Podklady');
    layers = updateLayer(added.layers, added.id, { text });
  }
  return layers;
}

describe('theory in the sources layers', () => {
  it('gives each heading the next free id, across layers', () => {
    const layers = withTheoryIds(withSources('Úvod bez nadpisu.\n## Klopení\nText o klopení.\n### Štíhlost {#T7}\nλ ≤ 2', '# Průhyb\nw ≤ L/250'));
    const sections = theorySections(layers);
    expect(sections.map((s) => [s.id, s.title])).toEqual([
      [undefined, 'Podklady'],
      ['T8', 'Klopení'],
      ['T7', 'Štíhlost'],
      ['T9', 'Průhyb'],
    ]);
    expect(sections[1]!.text).toBe('Text o klopení.');
    expect(layers[2]!.text).toContain('## Klopení {#T8}');
  });

  it('never renumbers, and changes nothing when every heading has its id', () => {
    const once = withTheoryIds(withSources('## A\nx\n## B\ny'));
    const twice = withTheoryIds(once);
    expect(twice.map((l) => l.text)).toEqual(once.map((l) => l.text));
    expect(twice.every((l, i) => l === once[i])).toBe(true);
    // A heading added between keeps the others as they were.
    const inserted = updateLayer(once, once[2]!.id, { text: once[2]!.text!.replace('## B', '## Nový\nz\n## B') });
    expect(theorySections(withTheoryIds(inserted)).map((s) => `${s.id} ${s.title}`)).toEqual(['T1 A', 'T3 Nový', 'T2 B']);
  });

  it('gives a copied heading with a used id a new one', () => {
    const sections = theorySections(withTheoryIds(withSources('## A {#T1}\nx\n## A kopie {#T1}\ny')));
    expect(sections.map((s) => s.id)).toEqual(['T1', 'T2']);
  });
});
