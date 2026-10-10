import { describe, expect, it } from 'vitest';
import { newDocument, readSheetEntries, readSheetFile, writeSheetFile } from '../src/index.js';

describe('pictures in the calculation file', () => {
  it('travel inside the file with the sheet', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const doc = { ...newDocument('T', '![Schéma](images/sheet/schema.png){width=60%}\nL := 5 m'), files: new Map([['images/sheet/schema.png', png]]) };
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(read.document!.source).toContain('![Schéma](images/sheet/schema.png){width=60%}');
    expect([...read.document!.files.get('images/sheet/schema.png')!]).toEqual([...png]);
  });
});

describe('files from before the rename', () => {
  it('open with the old format name (CalcCanvas) and are written with the new one', async () => {
    const { unzipSync } = await import('fflate');
    const bytes = await writeSheetFile(newDocument('T', 'L := 5 m'));
    const entries = unzipSync(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']!)) as { format: string };
    expect(manifest.format).toBe('kalketa-sheet');
    entries['manifest.json'] = new TextEncoder().encode(JSON.stringify({ ...manifest, format: 'calccanvas-sheet' }));
    const read = await readSheetEntries(entries);
    expect(read.document?.source).toBe('L := 5 m');
  });
});

describe('pictures of the sources no text refers to', () => {
  it('are not saved, others are', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const base = newDocument('T', 'L := 5 m');
    const doc = {
      ...base,
      layers: [...base.layers, { id: 'layer3', kind: 'sources' as const, name: 'Kniha', visible: true, locked: false, appendix: false, text: '![s. 36](layers/layer3/images/obrazek-s36.png)\n\n```kalk\nτ_S := G·γ\n```' }],
      files: new Map([
        ['layers/layer3/images/obrazek-s36.png', png],
        ['layers/layer3/images/vzorec-s37.png', png],
        ['images/sheet/unused.png', png],
      ]),
    };
    const read = await readSheetFile(await writeSheetFile(doc));
    expect([...read.document!.files.keys()].sort()).toEqual(['images/sheet/unused.png', 'layers/layer3/images/obrazek-s36.png']);
  });
});
