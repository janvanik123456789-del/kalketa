import { describe, expect, it } from 'vitest';
import { newDocument, readSheetFile, writeSheetFile } from '../src/index.js';

describe('pictures in the calculation file', () => {
  it('travel inside the file with the sheet', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const doc = { ...newDocument('T', '![Schéma](images/sheet/schema.png){width=60%}\nL := 5 m'), files: new Map([['images/sheet/schema.png', png]]) };
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(read.document!.source).toContain('![Schéma](images/sheet/schema.png){width=60%}');
    expect([...read.document!.files.get('images/sheet/schema.png')!]).toEqual([...png]);
  });
});
