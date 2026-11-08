import { describe, expect, it } from 'vitest';
import type { ChangeEntry } from '@kalketa/sheet';
import { shiftedEntries } from '../src/logic/proposalShift.js';

const entry = (id: string, over: Partial<ChangeEntry>): ChangeEntry => ({ id, kind: 'change', time: '2026-11-08T12:00:00Z', from: 1, to: 1, after: [], state: 'open', ...over });
const sheet = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`);

describe('open proposals follow their lines when another one is accepted', () => {
  it('moves insertions and replacements below a line put in, and leaves those above', () => {
    const before = sheet(10);
    const after = [...before.slice(0, 3), 'picture', ...before.slice(3)];
    const entries = [entry('above', { insert: true, from: 2, to: 2 }), entry('below', { insert: true, from: 6, to: 6 }), entry('delete', { from: 8, to: 9, before: ['l8', 'l9'] })];
    expect(shiftedEntries(before.join('\n'), after.join('\n'), entries).map((e) => [e.id, e.from, e.to])).toEqual([
      ['below', 7, 7],
      ['delete', 9, 10],
    ]);
  });

  it('follows lines taken out, an insertion after a line that went goes after the one above it', () => {
    const before = sheet(10);
    const after = [...before.slice(0, 2), ...before.slice(5)];
    const entries = [entry('gone', { insert: true, from: 4, to: 4 }), entry('end', { insert: true, from: 10, to: 10 }), entry('cut', { from: 4, to: 6, before: ['l4', 'l5', 'l6'] })];
    expect(shiftedEntries(before.join('\n'), after.join('\n'), entries).map((e) => [e.id, e.from, e.to])).toEqual([
      ['gone', 2, 2],
      ['end', 7, 7],
    ]);
  });

  it('leaves decided and replaced proposals as they are', () => {
    const before = sheet(5);
    const after = ['new', ...before];
    const entries = [entry('done', { insert: true, from: 3, to: 3, state: 'accepted' }), entry('old', { insert: true, from: 3, to: 3, replacedBy: 'x' })];
    expect(shiftedEntries(before.join('\n'), after.join('\n'), entries)).toEqual([]);
  });
});
