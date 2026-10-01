import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { defaultRegistry } from '@kalketa/core';
import { blockAppendices, evaluateDocument, FORMAT_VERSION, newDocument, readSheetFile, writeSheetFile, type SheetDocument } from '../src/index.js';

const NOSNIK = '# Prostý nosník\n@version 1.2\ninput L := 5 m\ninput q := 12 kN/m\nM_max := q·L²/8 | kN·m';

function sheet(): SheetDocument {
  const base = newDocument('Hala', 'N1 := Prosty_nosnik(L: 6 m)\nN2 := Prosty_nosnik(L: 4 m, q: 8 kN/m)\nM := N1.M_max');
  return { ...base, blocks: new Map([['Prosty_nosnik', { source: NOSNIK, version: '1.2', origin: 'Prosty nosnik.calc' }]]) };
}

describe('blocks in the .calc file', () => {
  it('round-trip with their version and origin', async () => {
    const bytes = await writeSheetFile(sheet());
    const entries = Object.keys(unzipSync(bytes));
    expect(entries).toContain('blocks/Prosty_nosnik/block.cc');
    expect(entries).toContain('blocks/Prosty_nosnik/block.json');
    const read = await readSheetFile(bytes);
    expect(read.diagnostics).toEqual([]);
    expect(read.document!.blocks).toEqual(sheet().blocks);
    expect(FORMAT_VERSION).toBe(3);
  });

  it('are optional: older files open with none', async () => {
    const entries = unzipSync(await writeSheetFile(newDocument('T', 'a := 1')));
    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json'])) as Record<string, unknown>;
    entries['manifest.json'] = strToU8(JSON.stringify({ ...manifest, formatVersion: 2, contentHash: undefined }));
    const read = await readSheetFile(zipSync(entries));
    expect(read.document!.blocks.size).toBe(0);
  });

  it('reject a block without its calculation', async () => {
    const entries = unzipSync(await writeSheetFile(sheet()));
    delete entries['blocks/Prosty_nosnik/block.cc'];
    const read = await readSheetFile(zipSync(entries));
    expect(read.diagnostics.map((d) => d.params['problem'])).toEqual(['block']);
  });
});

describe('blocks in the calculation', () => {
  it('are called from the sheet and printed after it, once per use', () => {
    const { result } = evaluateDocument(sheet(), defaultRegistry);
    expect(result.diagnostics).toEqual([]);
    expect((result.values.get('M') as { si: number }).si).toBeCloseTo((12e3 * 36) / 8);
    const appendices = blockAppendices(result);
    expect(appendices.map((a) => a.name)).toEqual(['Prosty nosnik – N1', 'Prosty nosnik – N2']);
    const second = appendices[1]!;
    expect(second.kind === 'calc' && second.result.values.get('q')).toMatchObject({ si: 8000 });
  });
});
