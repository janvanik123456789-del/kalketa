import { describe, expect, it } from 'vitest';
import { studyNotes, type StudyContent } from '@kalketa/sheet';
import { suggestChapters } from '../src/logic/studySuggest.js';

const topic = (p: number) =>
  p >= 21 && p <= 40 ? (p >= 25 ? 'Průhyb prostého nosníku z rovnice ohybové čáry.' : 'Ohybový moment nosníku a napětí v ohybu.') : p > 40 ? 'Kroutící moment namáhá hřídel smykem.' : 'Tah a tlak prutu, normálové napětí.';
const book: StudyContent = {
  kind: 'pdf',
  fileName: 'Pruznost.pdf',
  title: 'Pružnost a pevnost',
  pages: Array.from({ length: 60 }, (_, i) => `Strana ${i + 1}. ${topic(i + 1)}`),
  outline: [
    { title: '1 Tah a tlak', level: 1, page: 1 },
    { title: '2 Ohyb', level: 1, page: 21 },
    { title: '2.1 Průhyb nosníku', level: 2, page: 25 },
    { title: '3 Krut', level: 1, page: 41 },
  ],
  contentHash: 'h',
  modified: '2026-10-04T10:00:00.000Z',
};
const beam = ['# Posouzení nosníku', "L := 5 m ' rozpětí prostého nosníku", 'w := 5·q·L⁴/(384·E·I)', 'check "Průhyb": w ≤ w_lim'].join('\n');

describe('chapters for a calculation', () => {
  it('are the ones sharing its words, the section rather than the whole chapter', () => {
    expect(suggestChapters(book, beam)).toEqual([2]);
  });

  it('are none when nothing fits', () => {
    expect(suggestChapters(book, 'Fotovoltaická elektrárna, střídač')).toEqual([]);
  });

  it('go into the sources by chapter, with their pages', () => {
    const notes = studyNotes({ ...book, pages: book.pages.slice(0, 27) }, { chapters: [1] });
    const headings = notes.split('\n').filter((l) => l.startsWith('#'));
    expect(headings).toEqual(['## 2 Ohyb (s. 21–24)', '### 2.1 Průhyb nosníku (s. 25–27)']);
    // Page 41, where the next chapter starts, goes only when asked for itself.
    const until = (pages: string) =>
      studyNotes(book, { chapters: [1], ...(pages ? { pages } : {}) })
        .split('\n')
        .filter((l) => l.startsWith('#'));
    expect(until('')).toEqual(['## 2 Ohyb (s. 21–24)', '### 2.1 Průhyb nosníku (s. 25–40)']);
    expect(until('41')).toEqual(['## 2 Ohyb (s. 21–24)', '### 2.1 Průhyb nosníku (s. 25–40)', '## 3 Krut (s. 41)']);
    expect(notes).toContain('Strana 26. Průhyb prostého nosníku');
  });
});
