import { describe, expect, it } from 'vitest';
import { aiMemoryOf, entriesOf, withEntries, conversationsOf, newDocument, readSheetFile, withAiMemory, withConversation, withoutConversation, writeSheetFile, type Conversation } from '../src/index.js';

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
});
