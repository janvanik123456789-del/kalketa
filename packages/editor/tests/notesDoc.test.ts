import { describe, expect, it } from 'vitest';
import { notesHtml } from '@kalketa/render';
import { docToNotes, notesToDoc } from '../src/logic/notesDoc.js';

const roundTrip = (text: string) => docToNotes(notesToDoc(text));

describe('notes between Markdown and the word-processor editor', () => {
  it('keeps every kind of block as it was written', () => {
    const text = [
      '## Klopení {#T3}',
      '',
      'Klopení je **ztráta stability** ohýbaného *nosníku*, viz `M_cr` a [EN 1993](https://example.org/en1993).',
      'Druhý řádek odstavce.',
      '',
      '- první',
      '  - vnořená',
      '- druhá',
      '',
      '> ČSN EN 1990, tab. A1.2(B)',
      '',
      '```',
      'M := q·L²/8',
      '```',
      '',
      '```kalk',
      'w := 5·q·L^4/(384·E·I)',
      '```',
      '',
      '---',
      '',
      '![Schéma nosníku](layers/layer3/images/schema.png)',
      '',
      '| Profil | G |',
      '|---|---:|',
      '| IPE 200 | **22.4** |',
      '',
    ].join('\n');
    expect(roundTrip(text)).toBe(text);
  });

  it('gives headings their level and the id of the theory section', () => {
    const doc = notesToDoc('# A\n\n### B {#T7}');
    expect(doc.content).toEqual([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A' }] },
      { type: 'heading', attrs: { level: 3, tid: 'T7' }, content: [{ type: 'text', text: 'B' }] },
    ]);
  });

  it('escapes typed characters that would read as markup, and prints them as typed', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '# není nadpis, 2*3*4 a [x]' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '- není odrážka | ani > citace' }] },
      ],
    };
    const text = docToNotes(doc);
    expect(text).toBe('\\# není nadpis, 2\\*3\\*4 a \\[x\\]\n\n\\- není odrážka | ani > citace\n');
    expect(notesToDoc(text)).toEqual(doc);
    // As the page shows it: character entities are the characters typed.
    const shown = notesHtml(text).replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
    expect(shown).toBe('<p># není nadpis, 2*3*4 a [x]</p>\n<p>- není odrážka | ani &gt; citace</p>');
  });

  it('keeps a pipe inside a table cell', () => {
    const doc = notesToDoc('| a | b |\n|---|---|\n| x \\| y | 2 |');
    expect(docToNotes(doc)).toBe('| a | b |\n|---|---|\n| x \\| y | 2 |\n');
    expect(notesHtml(docToNotes(doc))).toContain("<td>x &#124; y</td>");
  });

  it('starts an empty note with one empty paragraph and saves nothing for it', () => {
    expect(notesToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(docToNotes(notesToDoc(''))).toBe('');
  });
});
