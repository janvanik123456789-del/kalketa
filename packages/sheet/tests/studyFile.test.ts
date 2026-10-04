import { describe, expect, it } from 'vitest';
import { chapterPages, htmlChapters, isStudyFile, librarySections, markdownChapters, parsePageRanges, parseStudySettings, selectedPages, studyAdvice, studyLibrary, type StudyContent } from '../src/index.js';

const page = (n: number) => `Text stránky ${n}: ohybový moment a průhyb nosníku, dost slov na stránku.`;
const book: StudyContent = {
  kind: 'pdf',
  fileName: 'Pružnost a pevnost.pdf',
  title: 'Pružnost a pevnost',
  pages: Array.from({ length: 80 }, (_, i) => page(i + 1)),
  labels: Array.from({ length: 80 }, (_, i) => (i < 4 ? ['i', 'ii', 'iii', 'iv'][i]! : String(i - 3))),
  outline: [
    { title: '1 Tah a tlak', level: 1, page: 5 },
    { title: '1.1 Napětí', level: 2, page: 6 },
    { title: '2 Ohyb', level: 1, page: 20 },
    { title: '2.1 Průhyb', level: 2, page: 25 },
    { title: '3 Krut', level: 1, page: 60 },
  ],
  contentHash: 'sha256:abc',
  modified: '2026-10-04T10:00:00.000Z',
};

describe('study files', () => {
  it('are PDF, HTML and Markdown', () => {
    expect(['a.pdf', 'b.HTML', 'c.htm', 'd.md', 'e.kalkt', 'a.pdf.kalketa.json'].map(isStudyFile)).toEqual([true, true, true, true, false, false]);
  });

  it('read pages as printed, ranges and single ones', () => {
    // Label "17" is page 21 of the file, "3" is page 7.
    expect(parsePageRanges('17–18, iv, 3', 80, book.labels)).toEqual([4, 7, 21, 22]);
    expect(parsePageRanges('5-6; x', 10)).toEqual([5, 6]);
  });

  it('give a chapter its pages, up to the next chapter of its level', () => {
    expect(chapterPages(book.outline!, 2, 80)).toEqual(Array.from({ length: 41 }, (_, i) => 20 + i));
    expect(chapterPages(book.outline!, 3, 80)).toEqual(Array.from({ length: 36 }, (_, i) => 25 + i));
    expect(chapterPages(book.outline!, 4, 80)).toEqual(Array.from({ length: 21 }, (_, i) => 60 + i));
  });

  it('read the whole book unless chapters or pages are chosen', () => {
    expect(selectedPages(book, {})).toHaveLength(80);
    expect(selectedPages(book, { chapters: [3], pages: '1' })).toEqual([5, ...Array.from({ length: 36 }, (_, i) => 25 + i)]);
    expect(studyAdvice(book, {})).toEqual({ pages: 80, selected: 80, large: true, noText: false });
    expect(studyAdvice(book, { chapters: [3] }).large).toBe(false);
  });

  it('become a library: a section per page, titled by chapter and printed page', () => {
    const library = studyLibrary(book, { chapters: [3] });
    expect(library.manifest.key).toBe('PP');
    expect(library.manifest.id).toMatch(/^study-[0-9a-f]{8}$/);
    expect(library.manifest.id).toBe(studyLibrary(book).manifest.id);
    const sections = librarySections(library);
    expect(sections).toHaveLength(36);
    expect(sections[0]).toEqual({ id: 'PP:T25', title: '2.1 Průhyb – s. 21', text: page(25) });
  });

  it('take key, title and source from the card', () => {
    const library = studyLibrary(book, parseStudySettings({ key: 'PAP', title: 'PaP', source: { title: 'Pružnost a pevnost', edition: '3. vyd.' }, chapters: [0, -1, 'x'], pages: ' ' }));
    expect(library.manifest.key).toBe('PAP');
    expect(library.manifest.source).toEqual({ title: 'Pružnost a pevnost', edition: '3. vyd.' });
    expect(parseStudySettings({ key: 'bad key', chapters: [] })).toEqual({});
  });

  it('keep a line starting with # as text', () => {
    const { labels: _labels, ...plain } = book;
    const library = studyLibrary({ ...plain, pages: ['# not a heading\nmore text here', ''], outline: [] });
    const sections = librarySections(library);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.id).toBe('PP:T1');
  });

  it('split HTML by its headings', () => {
    const html = '<html><head><title>Klopení &amp; stabilita</title></head><body><p>Úvod.</p><h1>Klopení</h1><p>Ztráta stability&nbsp;ohýbaného nosníku.</p><h2 id="x">Součinitel</h2><ul><li>χ<sub>LT</sub></li></ul><script>x()</script></body></html>';
    const read = htmlChapters(html);
    expect(read.title).toBe('Klopení & stabilita');
    expect(read.outline).toEqual([
      { title: 'Klopení & stabilita', level: 1, page: 1 },
      { title: 'Klopení', level: 1, page: 2 },
      { title: 'Součinitel', level: 2, page: 3 },
    ]);
    expect(read.pages).toEqual(['Úvod.', 'Ztráta stability ohýbaného nosníku.', '- χLT']);
    const sections = librarySections(studyLibrary({ kind: 'html', fileName: 'k.html', ...read, contentHash: 'h', modified: book.modified }));
    expect(sections.map((s) => `${s.id} ${s.title}`)).toEqual(['KS:T1 Klopení & stabilita', 'KS:T2 Klopení', 'KS:T3 Součinitel']);
  });

  it('split Markdown by its headings', () => {
    const read = markdownChapters('# Ocel\n\nÚvod.\n\n## Mez kluzu {#T3}\n\nf_y = 235 MPa\n');
    expect(read.title).toBe('Ocel');
    expect(read.outline.map((c) => c.title)).toEqual(['Ocel', 'Mez kluzu']);
    expect(read.pages).toEqual(['Úvod.', 'f_y = 235 MPa']);
  });
});
