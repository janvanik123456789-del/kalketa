import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  contentHash,
  freezeRevision,
  matchHash,
  newDocument,
  nextRevisionLabel,
  readSheetFile,
  removeRevision,
  revisionDocument,
  revisionState,
  shortHash,
  writeSheetFile,
} from '../src/index.js';

const NOW = new Date('2026-10-01T10:00:00Z');

describe('revisions', () => {
  it('are labelled A, B, … Z, AA', () => {
    const r = (label: string) => ({ label, created: '', hash: '', entries: new Map() });
    expect(nextRevisionLabel([])).toBe('A');
    expect(nextRevisionLabel([r('A'), r('P1')])).toBe('B');
    expect(nextRevisionLabel([r('Z')])).toBe('AA');
    expect(nextRevisionLabel([r('AZ')])).toBe('BA');
  });

  it('freeze the content with its fingerprint; the sheet goes on', async () => {
    let doc = newDocument('Nosník', 'L := 5 m', NOW);
    doc = await freezeRevision(doc, { note: 'k odevzdání', now: NOW });
    const a = doc.revisions[0]!;
    expect(a.label).toBe('A');
    expect(a.hash).toBe(await contentHash(doc));
    expect((await revisionState(doc)).changed).toBe(false);
    expect((await revisionState(doc)).current?.label).toBe('A');

    doc = { ...doc, source: 'L := 6 m' };
    const state = await revisionState(doc);
    expect(state.changed).toBe(true);
    expect(state.current).toBeUndefined();
    // The frozen sheet is as it was.
    expect((await revisionDocument(a)).document!.source).toBe('L := 5 m');
    await expect(freezeRevision(doc, { label: 'A' })).rejects.toThrow();
    expect((await freezeRevision(doc, { now: NOW })).revisions.map((r) => r.label)).toEqual(['A', 'B']);
  });

  it('are saved in the file and read back; the fingerprint of the sheet ignores them', async () => {
    const doc = await freezeRevision(newDocument('Nosník', 'L := 5 m', NOW), { note: 'k odevzdání', now: NOW });
    const bytes = await writeSheetFile(doc);
    const names = Object.keys(unzipSync(bytes));
    expect(names).toContain('revisions/A/revision.json');
    expect(names).toContain('revisions/A/sheet.cc');
    const read = await readSheetFile(bytes);
    expect(read.diagnostics).toEqual([]);
    const back = read.document!;
    expect(back.revisions.map((r) => [r.label, r.note, r.hash])).toEqual([['A', 'k odevzdání', doc.revisions[0]!.hash]]);
    expect(back.files.size).toBe(0);
    expect(await contentHash(back)).toBe(doc.revisions[0]!.hash);
    expect((await writeSheetFile(back)).length).toBe(bytes.length);
    expect(removeRevision(back, 'A').revisions).toEqual([]);
  });

  it('report a revision changed outside the program', async () => {
    const doc = await freezeRevision(newDocument('Nosník', 'L := 5 m', NOW), { now: NOW });
    const raw = unzipSync(await writeSheetFile(doc));
    raw['revisions/A/sheet.cc'] = strToU8('L := 4 m');
    const read = await readSheetFile(zipSync(raw));
    expect(read.diagnostics.map((d) => [d.code, d.params])).toEqual([['W-REVISION-HASH', { revision: 'A' }]]);
    expect(strFromU8(read.document!.revisions[0]!.entries.get('sheet.cc')!)).toBe('L := 4 m');
  });

  it('are found by the fingerprint printed in the footer', async () => {
    const hash = await contentHash(newDocument('Nosník', 'L := 5 m', NOW));
    const printed = shortHash(hash);
    expect(printed).toMatch(/^[0-9a-f]{4} [0-9a-f]{4}$/);
    expect(matchHash(hash, printed.toUpperCase())).toBe(true);
    expect(matchHash(hash, '0000 0000')).toBe(false);
    expect(matchHash(hash, printed.slice(0, 4))).toBe(false);
  });
});
