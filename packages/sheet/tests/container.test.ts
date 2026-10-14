import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { defaultRegistry } from '@kalketa/core';
import {
  evaluateDocument,
  FORMAT_VERSION,
  isSafePath,
  newDocument,
  readSheetFile,
  writeSheetFile,
  type SheetDocument,
} from '../src/index.js';

const R1 = join(import.meta.dirname, '../../../reference/04_Stavebnictvi_a_pozemni_stavby/R1-nosnik');
const NOW = new Date('2026-09-29T12:00:00Z');

/** The reference beam sheet as a document, plus an image and an unknown file. */
function r1Document(): SheetDocument {
  const base = newDocument('Nosník N1', readFileSync(join(R1, 'nosnik.cc'), 'utf8'), NOW);
  const tables = new Map(
    readdirSync(join(R1, 'tables')).map((name) => [
      name,
      {
        schemaJson: readFileSync(join(R1, 'tables', name, 'schema.json'), 'utf8'),
        dataCsv: readFileSync(join(R1, 'tables', name, 'data.csv'), 'utf8'),
      },
    ]),
  );
  const files = new Map([
    ['images/Profily_IPE/IPE_200.svg', strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['future/something.bin', new Uint8Array([1, 2, 3])],
  ]);
  return { ...base, manifest: { ...base.manifest, language: 'cs', author: 'Test' }, tables, files };
}

async function rezip(bytes: Uint8Array, change: (entries: Record<string, Uint8Array>) => void): Promise<Uint8Array> {
  const entries = unzipSync(bytes);
  change(entries);
  return zipSync(entries);
}

describe('.calc container', () => {
  it('round-trips a document without losing anything', async () => {
    const doc = r1Document();
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(read.diagnostics).toEqual([]);
    const back = read.document!;
    expect(back.source).toBe(doc.source);
    expect(back.layout).toEqual(doc.layout);
    expect([...back.tables]).toEqual([...doc.tables]);
    expect([...back.files.keys()].sort()).toEqual([...doc.files.keys()].sort());
    expect(back.files.get('future/something.bin')).toEqual(new Uint8Array([1, 2, 3]));
    expect(back.manifest).toMatchObject({ title: 'Nosník N1', language: 'cs', author: 'Test', formatVersion: FORMAT_VERSION });
    expect(back.manifest.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('gives the same results after saving and loading', async () => {
    const doc = r1Document();
    const before = evaluateDocument(doc, defaultRegistry).result;
    const after = evaluateDocument((await readSheetFile(await writeSheetFile(doc))).document!, defaultRegistry).result;
    expect(after.diagnostics).toEqual([]);
    expect([...after.values.keys()]).toEqual([...before.values.keys()]);
    for (const [name, value] of before.values) {
      if (value.type === 'quantity') expect(after.values.get(name)).toMatchObject({ si: value.si });
    }
    expect(after.checks.map((c) => [c.label, c.passed, c.utilization])).toEqual(before.checks.map((c) => [c.label, c.passed, c.utilization]));
  });

  it('writes identical bytes for identical content', async () => {
    const doc = r1Document();
    expect(await writeSheetFile(doc)).toEqual(await writeSheetFile(r1Document()));
  });

  it('keeps everything readable without Kalketa', async () => {
    const entries = unzipSync(await writeSheetFile(r1Document()));
    expect(Object.keys(entries).sort()).toEqual([
      'future/something.bin',
      'images/Profily_IPE/IPE_200.svg',
      'layers.json',
      'layout.json',
      'manifest.json',
      'sheet.cc',
      'tables/Materialy/data.csv',
      'tables/Materialy/schema.json',
      'tables/Profily_IPE/data.csv',
      'tables/Profily_IPE/schema.json',
    ]);
    expect(new TextDecoder().decode(entries['sheet.cc'])).toContain('check "Ohyb"');
  });

  it('warns when the content was changed outside the program', async () => {
    const bytes = await rezip(await writeSheetFile(r1Document()), (e) => {
      e['sheet.cc'] = strToU8('L := 6 m');
    });
    const read = await readSheetFile(bytes);
    expect(read.diagnostics.map((d) => d.code)).toEqual(['W-FILE-HASH']);
    expect(read.document!.source).toBe('L := 6 m');
  });

  it('refuses files from a newer format version', async () => {
    const bytes = await rezip(await writeSheetFile(r1Document()), (e) => {
      const manifest = JSON.parse(new TextDecoder().decode(e['manifest.json']));
      e['manifest.json'] = strToU8(JSON.stringify({ ...manifest, formatVersion: FORMAT_VERSION + 1 }));
    });
    const read = await readSheetFile(bytes);
    expect(read.document).toBeUndefined();
    expect(read.diagnostics.map((d) => d.code)).toEqual(['E-FILE-VERSION']);
  });

  it('rejects damaged and foreign files', async () => {
    const codes = async (bytes: Uint8Array) => (await readSheetFile(bytes)).diagnostics.map((d) => [d.code, d.params['problem']]);
    expect(await codes(strToU8('hello'))).toEqual([['E-FILE-INVALID', 'not-zip']]);
    expect(await codes(zipSync({ 'a.txt': strToU8('x') }))).toEqual([['E-FILE-INVALID', 'missing']]);
    expect(await codes(zipSync({ 'manifest.json': strToU8('{') }))).toEqual([['E-FILE-INVALID', 'json']]);
    expect(await codes(zipSync({ 'manifest.json': strToU8('{"format":"other"}') }))).toEqual([['E-FILE-INVALID', 'format']]);
    const incomplete = await rezip(await writeSheetFile(r1Document()), (e) => {
      delete e['tables/Materialy/data.csv'];
    });
    expect(await codes(incomplete)).toEqual([['E-FILE-INVALID', 'table']]);
  });

  it('rejects paths that could escape the folder when unpacked', async () => {
    const bytes = await rezip(await writeSheetFile(r1Document()), (e) => {
      e['../evil.txt'] = strToU8('x');
    });
    expect((await readSheetFile(bytes)).diagnostics.map((d) => d.params['problem'])).toEqual(['path']);
    expect(['a/b.png', 'images/x.svg'].every(isSafePath)).toBe(true);
    expect(['../a', '/etc/x', 'C:/x', 'a\\b', 'a/./b', ''].some(isSafePath)).toBe(false);
  });
});
