import { describe, expect, it } from 'vitest';
import type { ChangeEntry } from '@kalketa/sheet';
import { replacedIds, withoutReplaced } from '../src/logic/proposalReplace.js';

const entry = (id: string, over: Partial<ChangeEntry>): ChangeEntry => ({ id, kind: 'change', time: '2026-11-07T20:00:00Z', from: 2, to: 2, after: [], state: 'open', ...over });

describe('a corrected proposal replaces the one it corrects', () => {
  it('lists the entries of the corrected answer and what they replaced', () => {
    const entries = [entry('c:1:1', {}), entry('c:3:1', { replaces: ['c:1:1'] }), entry('c:3:2', {}), entry('c:5:1', {})];
    expect(replacedIds(entries, 'c:3:')).toEqual(['c:3:1', 'c:1:1', 'c:3:2']);
  });

  it('takes the lines of an accepted insertion out, so the correction goes in once', () => {
    const source = ['a := 1', 'b := 2', 'x := a + b', 'plot(a) {title="x"}', 'c := 3'].join('\n');
    const first = entry('c:1:1', { insert: true, from: 2, to: 2, before: [], after: ['x := a + b', 'plot(a) {title="x"}'], state: 'accepted' });
    const fix = entry('c:3:1', { insert: true, from: 2, to: 2, before: [], after: ['x := a + b'], replaces: ['c:1:1'] });
    expect(withoutReplaced(source, fix, [first, fix])).toEqual({ source: ['a := 1', 'b := 2', 'c := 3'].join('\n'), reverted: ['c:1:1'] });
  });

  it('puts back the lines an accepted replacement replaced, also when lines moved above it', () => {
    const source = ['new top', 'a := 1', 'P := 5 W', 'c := 3'].join('\n');
    const first = entry('c:1:2', { from: 2, to: 3, before: ['P := 4.8 W', 'Q := 1 W'], after: ['P := 5 W'], state: 'accepted' });
    const fix = entry('c:3:1', { from: 2, to: 3, before: ['P := 4.8 W', 'Q := 1 W'], after: [], replaces: ['c:1:2'] });
    expect(withoutReplaced(source, fix, [first, fix]).source).toBe(['new top', 'a := 1', 'P := 4.8 W', 'Q := 1 W', 'c := 3'].join('\n'));
  });

  it('leaves an accepted proposal whose lines were edited since, an open one, and one taken out already', () => {
    const source = ['a := 1', 'x := a + 2', 'c := 3'].join('\n');
    const edited = entry('c:1:1', { insert: true, from: 1, to: 1, before: [], after: ['x := a + 1'], state: 'accepted' });
    const open = entry('c:1:2', { insert: true, from: 1, to: 1, before: [], after: ['c := 3'] });
    const gone = entry('c:1:3', { insert: true, from: 2, to: 2, before: [], after: ['c := 3'], state: 'accepted', replacedBy: '2026-11-07T20:05:00Z' });
    const fix = entry('c:3:1', { insert: true, from: 1, to: 1, before: [], after: ['x := a + 1'], replaces: ['c:1:1', 'c:1:2', 'c:1:3'] });
    expect(withoutReplaced(source, fix, [edited, open, gone, fix])).toEqual({ source, reverted: [] });
  });
});
