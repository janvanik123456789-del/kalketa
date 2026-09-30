import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { defaultRegistry } from '@calccanvas/core';
import {
  addLayer,
  defaultLayers,
  evaluateDocument,
  FORMAT_VERSION,
  LayerSessions,
  moveLayer,
  newDocument,
  readSheetFile,
  removeLayer,
  tablesByLayer,
  updateLayer,
  withAiLayer,
  writeSheetFile,
  type SheetDocument,
} from '../src/index.js';

describe('layer list', () => {
  it('starts with the printed sheet, a database and AI notes', () => {
    expect(defaultLayers().map((l) => [l.id, l.kind])).toEqual([
      ['main', 'sheet'],
      ['data', 'data'],
      ['ai', 'ai'],
    ]);
  });

  it('adds, renames, moves and removes layers; the sheet stays first', () => {
    let { layers, id } = addLayer(defaultLayers(), 'sources', 'Teorie');
    expect(layers.at(-1)).toMatchObject({ id, kind: 'sources', name: 'Teorie', text: '', visible: true, locked: false, appendix: false });
    layers = updateLayer(layers, id, { name: 'Teorie ohybu', locked: true });
    expect(layers.at(-1)).toMatchObject({ name: 'Teorie ohybu', locked: true });
    layers = moveLayer(layers, id, -1);
    expect(layers.map((l) => l.id)).toEqual(['main', 'data', id, 'ai']);
    expect(moveLayer(layers, 'data', -1).map((l) => l.id)).toEqual(['main', 'data', id, 'ai']);
    expect(removeLayer(layers, 'main').map((l) => l.id)).toContain('main');
    expect(removeLayer(layers, id).map((l) => l.id)).toEqual(['main', 'data', 'ai']);
  });

  it('always has exactly one AI notes layer, which cannot be removed', () => {
    expect(removeLayer(defaultLayers(), 'ai').map((l) => l.id)).toContain('ai');
    const without = defaultLayers().filter((l) => l.kind !== 'ai');
    expect(withAiLayer(without).filter((l) => l.kind === 'ai')).toHaveLength(1);
    expect(withAiLayer(defaultLayers())).toEqual(defaultLayers());
    // @ts-expect-error people cannot add another AI layer
    addLayer(defaultLayers(), 'ai', 'AI 2');
  });

  it('keeps tables of a removed data layer', () => {
    let { layers, id } = addLayer(defaultLayers(), 'data', 'Měření');
    layers = updateLayer(layers, id, { tables: ['Mereni'] });
    expect(tablesByLayer(removeLayer(layers, id), ['Mereni', 'Profily']).get('data')).toEqual(['Mereni', 'Profily']);
  });

  it('assigns tables not listed anywhere to the first data layer', () => {
    const { layers, id } = addLayer(defaultLayers(), 'data', 'Katalog');
    const withTables = updateLayer(layers, id, { tables: ['Profily'] });
    const byLayer = tablesByLayer(withTables, ['Profily', 'Materialy']);
    expect(byLayer.get('data')).toEqual(['Materialy']);
    expect(byLayer.get(id)).toEqual(['Profily']);
  });
});

describe('auxiliary calculation layers', () => {
  function sheetWithLoads(): SheetDocument {
    const base = newDocument('Test', 'L := 5 m\nM := q·L²/8 | kN·m');
    let { layers, id } = addLayer(base.layers, 'calc', 'Zatížení');
    layers = updateLayer(layers, id, { text: 'g_k := 3.5 kN/m\nq_k := 8 kN/m\nq := 1.35·g_k + 1.5·q_k' });
    const second = addLayer(layers, 'calc', 'Nepoužito');
    layers = updateLayer(second.layers, second.id, { text: 'x := 1 m' });
    return { ...base, layers };
  }

  it('feed the printed sheet', () => {
    const { result, evaluation } = evaluateDocument(sheetWithLoads(), defaultRegistry);
    expect(result.diagnostics).toEqual([]);
    expect(result.values.get('M')).toMatchObject({ si: expect.closeTo((1.35 * 3500 + 1.5 * 8000) * 25 / 8, 6) });
    expect(evaluation.aux.size).toBe(2);
  });

  it('know which of them the sheet uses', () => {
    const doc = sheetWithLoads();
    const { evaluation } = evaluateDocument(doc, defaultRegistry);
    expect([...evaluation.used]).toEqual([doc.layers[3]!.id]);
  });

  it('see earlier auxiliary layers, and the sheet sees what they use indirectly', () => {
    const base = newDocument('Test', 'y := b · 2');
    let a = addLayer(base.layers, 'calc', 'A');
    let layers = updateLayer(a.layers, a.id, { text: 'a := 3 m' });
    const b = addLayer(layers, 'calc', 'B');
    layers = updateLayer(b.layers, b.id, { text: 'b := a + 1 m' });
    const { result, evaluation } = evaluateDocument({ ...base, layers }, defaultRegistry);
    expect(result.values.get('y')).toMatchObject({ si: 8 });
    expect([...evaluation.used].sort()).toEqual([a.id, b.id].sort());
  });

  it('are recalculated incrementally per layer', () => {
    const sessions = new LayerSessions(defaultRegistry);
    const doc = sheetWithLoads();
    sessions.evaluate(doc.source, doc.layers, []);
    const again = sessions.evaluate(doc.source, doc.layers, []);
    expect(again.main.stats.evaluated).toBe(0);
    expect([...again.aux.values()].every((r) => r.stats.evaluated === 0)).toBe(true);
  });
});

describe('.calc format version 2', () => {
  it('round-trips layers, their texts and settings', async () => {
    const base = newDocument('Test', 'a := 1');
    let calc = addLayer(base.layers, 'calc', 'Zatížení');
    let layers = updateLayer(calc.layers, calc.id, { text: 'q := 2 kN/m', appendix: true });
    const notes = addLayer(layers, 'sources', 'Teorie');
    layers = updateLayer(notes.layers, notes.id, { text: '# Ohyb\n> ČSN EN 1993-1-1, čl. 6.2.5', locked: true, visible: false });
    const doc: SheetDocument = { ...base, layers, files: new Map([[`layers/${notes.id}/images/obr1.png`, new Uint8Array([1, 2])]]) };

    const bytes = await writeSheetFile(doc);
    const entries = Object.keys(unzipSync(bytes)).sort();
    expect(entries).toContain(`layers/${calc.id}/sheet.cc`);
    expect(entries).toContain(`layers/${notes.id}/notes.md`);
    expect(entries).toContain('layers.json');

    const read = await readSheetFile(bytes);
    expect(read.diagnostics).toEqual([]);
    expect(read.document!.layers).toEqual(doc.layers);
    expect([...read.document!.files.keys()]).toEqual([`layers/${notes.id}/images/obr1.png`]);
    expect(JSON.parse(new TextDecoder().decode(unzipSync(bytes)['manifest.json'])).formatVersion).toBe(FORMAT_VERSION);
  });

  it('opens version 1 files with the three default layers', async () => {
    const v1 = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'calccanvas-sheet', formatVersion: 1, title: 'Old', created: '', modified: '', generator: 'x' })),
      'sheet.cc': strToU8('a := 1'),
    });
    const read = await readSheetFile(v1);
    expect(read.diagnostics).toEqual([]);
    expect(read.document!.layers).toEqual(defaultLayers().map((l) => (l.kind === 'ai' ? { ...l, text: '' } : l)));
  });

  it('adds the AI notes layer to files that lack it', async () => {
    const good = await writeSheetFile(newDocument('T'));
    const entries = unzipSync(good);
    entries['layers.json'] = strToU8(JSON.stringify([{ id: 'main', kind: 'sheet' }, { id: 'ai', kind: 'calc', name: 'Moje' }]));
    const read = await readSheetFile(zipSync(entries));
    // Edited outside the program: only the content hash warning.
    expect(read.diagnostics.map((d) => d.code)).toEqual(['W-FILE-HASH']);
    expect(read.document!.layers.map((l) => [l.id, l.kind])).toEqual([
      ['main', 'sheet'],
      ['ai', 'calc'],
      ['ai2', 'ai'],
    ]);
  });

  it('rejects a damaged layer list', async () => {
    const good = await writeSheetFile(newDocument('T'));
    const entries = unzipSync(good);
    entries['layers.json'] = strToU8(JSON.stringify([{ id: 'x', kind: 'calc' }]));
    expect((await readSheetFile(zipSync(entries))).diagnostics.map((d) => d.params['problem'])).toEqual(['json']);
  });
});
