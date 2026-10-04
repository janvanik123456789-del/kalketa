import { describe, expect, it } from 'vitest';
import type { Conversation } from '@kalketa/sheet';
import { aiSources } from '../src/logic/aiSources.js';

const conversations: Conversation[] = [
  {
    id: 'c1',
    started: '2026-10-04T08:00:00Z',
    turns: [
      { role: 'user', text: 'Proč?' },
      { role: 'assistant', text: '…', time: '2026-10-04T08:01:00Z', citations: [{ id: 'T2', status: 'ok' }, { id: 'PP:T3', status: 'ok' }, { id: 'T99', status: 'unknown' }] },
    ],
  },
  {
    id: 'c2',
    started: '2026-10-04T09:00:00Z',
    turns: [{ role: 'assistant', text: '…', time: '2026-10-04T09:01:00Z', citations: [{ id: 'T2', status: 'misquoted', quote: 'x' }] }],
  },
];

describe('where the AI drew from', () => {
  it('groups the citations of all answers by source, with how they were checked', () => {
    const groups = aiSources(
      conversations,
      [{ id: 'T1', title: 'Klopení' }, { id: 'T2', title: 'Průhyb' }],
      [{ key: 'PP', title: 'Pružnost a pevnost', source: 'Skripta, 2. vyd.', sections: [{ id: 'PP:T3', title: 'Smyk', text: '…' }] }],
    );
    expect(groups).toEqual([
      { kind: 'sheet', title: '', sections: [{ id: 'T2', title: 'Průhyb', checked: 1, unsupported: 1, last: '2026-10-04T09:01:00Z' }] },
      { kind: 'library', key: 'PP', title: 'Pružnost a pevnost', source: 'Skripta, 2. vyd.', sections: [{ id: 'PP:T3', title: 'Smyk', checked: 1, unsupported: 0, last: '2026-10-04T08:01:00Z' }] },
      { kind: 'unknown', title: '', sections: [{ id: 'T99', title: '', checked: 0, unsupported: 1, last: '2026-10-04T08:01:00Z' }] },
    ]);
  });

  it('is empty without citations', () => {
    expect(aiSources([], [], [])).toEqual([]);
  });
});
