import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { aiMadeLines, aiMemoryOf, copyWithoutAiRecords, entriesOf, freezeRevision, hasAiRecords, revisionDocument, newSheetsOf, withEntries, conversationsOf, newDocument, readSheetFile, withAiMemory, withConversation, withoutConversation, writeSheetFile, type Conversation } from '../src/index.js';

const first: Conversation = {
  id: 'c1',
  started: '2026-10-04T08:00:00.000Z',
  provider: 'server',
  model: 'qwen',
  turns: [
    { role: 'user', text: 'Proč nevyhovuje průhyb?', time: '2026-10-04T08:00:00.000Z' },
    { role: 'assistant', text: 'Průhyb 23,9 mm překračuje L/250 [T2].', time: '2026-10-04T08:00:20.000Z', model: 'qwen', theory: { sent: ['T2'], total: 3 } },
  ],
};

describe('conversations with the AI in the sheet', () => {
  it('bring the AI notes layer with them and survive saving and opening', async () => {
    const doc = withConversation(newDocument('N1', 'L := 5 m'), first);
    expect(doc.layers.some((l) => l.kind === 'ai')).toBe(true);
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(read.diagnostics).toEqual([]);
    expect(read.document!.layers.some((l) => l.kind === 'ai')).toBe(true);
    expect(conversationsOf(read.document!)).toEqual([first]);
  });

  it('are added, replaced by id and removed', () => {
    let doc = withConversation(newDocument('N1'), first);
    const longer = { ...first, turns: [...first.turns, { role: 'user' as const, text: 'A ohyb?' }] };
    doc = withConversation(doc, longer);
    doc = withConversation(doc, { id: 'c2', started: '2026-10-04T09:00:00.000Z', turns: [] });
    expect(conversationsOf(doc).map((c) => `${c.id}:${c.turns.length}`)).toEqual(['c1:3', 'c2:0']);
    doc = withoutConversation(doc, 'c1');
    expect(conversationsOf(doc).map((c) => c.id)).toEqual(['c2']);
  });

  it('leave no AI notes layer behind when the last one goes', async () => {
    const doc = withoutConversation(withConversation(newDocument('N1'), first), 'c1');
    expect(conversationsOf(doc)).toEqual([]);
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(read.document!.layers.some((l) => l.kind === 'ai')).toBe(false);
  });

  it('keep the memory for the model, which alone keeps the AI notes layer too', async () => {
    const doc = withAiMemory(newDocument('N1'), 'Intent: check beam N1 to EN 1993. Assumed: S235, L/250.');
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(aiMemoryOf(read.document!)).toBe('Intent: check beam N1 to EN 1993. Assumed: S235, L/250.\n');
    expect(read.document!.layers.some((l) => l.kind === 'ai')).toBe(true);
    expect(aiMemoryOf(withAiMemory(read.document!, ''))).toBe('');
  });

  it('stay out of a copy given to others, revisions included, which opens without damage', async () => {
    let doc = withAiMemory(withConversation(newDocument('N1', 'L := 5 m'), first), 'Intent: beam N1.');
    doc = await freezeRevision(doc, { label: 'A', now: new Date('2026-10-05T08:00:00Z') });
    expect(hasAiRecords(doc)).toBe(true);
    const copy = await copyWithoutAiRecords(doc);
    expect(hasAiRecords(copy)).toBe(false);
    expect(copy.layers.some((l) => l.kind === 'ai')).toBe(false);
    expect(copy.source).toBe('L := 5 m');
    const bytes = await writeSheetFile(copy);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).filter((p) => /conversations|memory|entries\.json/.test(p))).toEqual([]);
    expect(Object.values(entries).some((data) => strFromU8(data).includes('Proč nevyhovuje'))).toBe(false);
    const read = await readSheetFile(bytes);
    expect(read.diagnostics).toEqual([]);
    expect(read.document!.revisions.map((r) => r.label)).toEqual(['A']);
    expect(hasAiRecords((await revisionDocument(read.document!.revisions[0]!)).document!)).toBe(false);
    // The sheet itself keeps them.
    expect(conversationsOf(doc)).toEqual([first]);
  });

  it('make no AI notes layer for nothing', () => {
    const doc = newDocument('N1');
    expect(withoutConversation(doc, 'x')).toBe(doc);
  });

  it('keep a journal of proposed changes and what became of them', async () => {
    const proposed = { id: 'c1:1:1', kind: 'change' as const, time: '2026-10-04T10:00:00Z', model: 'qwen', conversation: 'c1', from: 8, to: 8, before: ['profil := pick(Profily_IPE, "IPE 200")'], after: ['profil := pick(Profily_IPE, "IPE 220")'], state: 'open' as const };
    let doc = withEntries(newDocument('N1'), [proposed]);
    doc = withEntries(doc, [{ ...proposed, state: 'accepted', decided: '2026-10-04T10:01:00Z' }]);
    const read = await readSheetFile(await writeSheetFile(doc));
    expect(entriesOf(read.document!)).toEqual([{ ...proposed, state: 'accepted', decided: '2026-10-04T10:01:00Z' }]);
    expect(read.document!.layers.some((l) => l.kind === 'ai')).toBe(true);
    expect(withEntries(doc, [])).toBe(doc);
  });

  it('mark the lines an accepted change brought until someone reviews them', () => {
    const entry = { id: 'c1:1:1', kind: 'change' as const, time: 't', from: 2, to: 2, before: ['b := 2'], after: ['b := 20'], state: 'accepted' as const };
    const source = ['a := 1', 'b := 20', 'c := 3'].join('\n');
    expect([...aiMadeLines(source, [entry]).keys()]).toEqual([2]);
    // A line added above: the mark follows the line.
    expect([...aiMadeLines('x := 0\n' + source, [entry]).keys()]).toEqual([3]);
    // Edited by a person, reviewed, rejected, or still open: no mark.
    expect(aiMadeLines(source.replace('b := 20', 'b := 21'), [entry]).size).toBe(0);
    expect(aiMadeLines(source, [{ ...entry, reviewed: 't2' }]).size).toBe(0);
    expect(aiMadeLines(source, [{ ...entry, state: 'rejected' }]).size).toBe(0);
    expect(aiMadeLines(source, [{ ...entry, state: 'open' }]).size).toBe(0);
    // The same text twice: the one nearest to where it was put.
    const twice = ['b := 20', 'a := 1', 'b := 20', 'c := 3'].join('\n');
    expect([...aiMadeLines(twice, [{ ...entry, from: 3, to: 3 }]).keys()]).toEqual([3]);
    // An insert after line 1 of two lines.
    const insert = { ...entry, from: 1, to: 1, insert: true, after: ['x := 1', 'y := 2'] };
    expect([...aiMadeLines(['a := 1', 'x := 1', 'y := 2'].join('\n'), [insert]).keys()]).toEqual([2, 3]);
  });

  it('keep new sheets beside the changes, neither losing the other', () => {
    const change = { id: 'c1:1:1', kind: 'change' as const, time: 't', from: 1, to: 1, before: ['a := 1'], after: ['a := 2'], state: 'open' as const };
    const sheet = { id: 'c1:1:s1', kind: 'sheet' as const, time: 't', title: 'N2', lines: ['F := 1 kN'], state: 'open' as const };
    let doc = withEntries(withEntries(newDocument('N1'), [change]), [sheet]);
    doc = withEntries(doc, [{ ...change, state: 'accepted' }]);
    expect(entriesOf(doc).map((e) => e.state)).toEqual(['accepted']);
    expect(newSheetsOf(doc)).toEqual([sheet]);
  });

  it('keep the AI mark on the untouched lines of a whole new sheet', () => {
    const lines = ['# N2', '', 'L := 5 m', 'q := 12 kN/m', 'M := q·L²/8', 'check M ≤ 50 kN·m'];
    const whole = { id: 'c1:1:s1:lines', kind: 'change' as const, time: 't', from: 0, to: 0, insert: true, before: [], after: lines, state: 'accepted' as const };
    const edited = ['# N2', '', 'L := 5 m', 'F := 2 kN', 'M := F·L/4', 'check M ≤ 50 kN·m'].join('\n');
    expect([...aiMadeLines(edited, [whole]).keys()].sort((a, b) => a - b)).toEqual([1, 3, 6]);
    expect([...aiMadeLines(lines.join('\n'), [whole]).keys()]).toHaveLength(6);
  });
});
