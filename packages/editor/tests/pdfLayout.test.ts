import { describe, expect, it } from 'vitest';
import { pageLayout, type LayoutLine } from '../src/logic/pdfLayout.js';
import { formulaOrScraps } from '../src/logic/pdfText.js';

const page = { width: 595, height: 842 };
const line = (top: number, text: string, left = 70, right = 520): LayoutLine => ({ top, bottom: top + 12, left, right, text });

describe('a PDF page laid out for the sources', () => {
  it('tells formulas and scraps from text', () => {
    expect(formulaOrScraps('= RA- a = RB • b (51)')).toBe('formula');
    expect(formulaOrScraps("M 0 ( x ) =RA-x-q-x--= ^ '-. (56)")).toBe('formula');
    expect(formulaOrScraps('X')).toBe('scraps');
    expect(formulaOrScraps('maximální ohybový moment na celý nosník bude v místě působení síly F, přičemž pro')).toBeUndefined();
    expect(formulaOrScraps('…pro jehož obsah platí vztah podle normy (43)')).toBeUndefined();
  });

  it('cuts out pictures with their labels, and formulas, at their place', () => {
    const items = pageLayout(
      [line(60, 'Text nad obrázkem, který se čte jako text.'), line(150, 'F', 200, 210), line(260, 'Text pod obrázkem a nad vzorcem.'), line(300, 'M = F · a (51)', 250, 330), line(316, 'X', 280, 290), line(360, 'Text pod vzorcem.')],
      [{ top: 100, bottom: 220, left: 150, right: 400 }],
      page,
    );
    expect(items.map((i) => (i.kind === 'text' ? i.text : i.why))).toEqual(['Text nad obrázkem, který se čte jako text.', 'picture', 'Text pod obrázkem a nad vzorcem.', 'formula', 'Text pod vzorcem.']);
    const formula = items.find((i) => i.kind === 'cut' && i.why === 'formula');
    // The formula and the scrap under it are one cut-out, with room around.
    expect(formula).toMatchObject({ box: { top: 296, bottom: 332, left: 246, right: 334 } });
  });

  it('takes a scanned page for no picture, and joins a figure drawn in pieces', () => {
    expect(pageLayout([line(60, 'Text skenované stránky.')], [{ top: 0, bottom: 842, left: 0, right: 595 }], page)).toEqual([{ kind: 'text', text: 'Text skenované stránky.' }]);
    const pieces = pageLayout([], [{ top: 100, bottom: 200, left: 100, right: 200 }, { top: 203, bottom: 300, left: 100, right: 200 }, { top: 0, bottom: 5, left: 0, right: 5 }], page);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ kind: 'cut', why: 'picture', box: { top: 96, bottom: 304 } });
  });
});
