import { describe, expect, it } from 'vitest';
import { inkBounds, pageLayout, type LayoutLine } from '../src/logic/pdfLayout.js';
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
    // The formula and the scrap under it are one cut-out: up to the text around it (a line and a half at most), across the column.
    expect(formula).toMatchObject({ box: { top: 282, bottom: 346, left: 66, right: 524 } });
  });

  it('finds a drawing made of shapes, not the bar of a fraction or the lines of a table', () => {
    const items = pageLayout(
      [line(60, 'Text nad obrázkem.'), line(330, 'Obr. 40 Vetknutý nosník'), line(400, 'Text pod tabulkou.')],
      [],
      page,
      [
        // The beam, the wall, an arrow head, and the dimension line that touches them.
        { top: 150, bottom: 160, left: 120, right: 420 },
        { top: 120, bottom: 200, left: 100, right: 120 },
        { top: 130, bottom: 150, left: 400, right: 412 },
        { top: 230, bottom: 230.5, left: 120, right: 420 },
        { top: 160, bottom: 230.4, left: 419.7, right: 420 },
        // A fraction bar and a table rule: thin and alone.
        { top: 280, bottom: 280.5, left: 200, right: 260 },
        { top: 380, bottom: 380.4, left: 70, right: 520 },
      ],
    );
    expect(items.map((i) => (i.kind === 'text' ? i.text : i.why))).toEqual(['Text nad obrázkem.', 'picture', 'Obr. 40 Vetknutý nosník', 'Text pod tabulkou.']);
    expect(items[1]).toMatchObject({ box: { top: 116, bottom: 234.5, left: 96, right: 424 } });
  });

  it('takes a scanned page for no picture, and joins a figure drawn in pieces', () => {
    expect(pageLayout([line(60, 'Text skenované stránky.')], [{ top: 0, bottom: 842, left: 0, right: 595 }], page)).toEqual([{ kind: 'text', text: 'Text skenované stránky.' }]);
    const pieces = pageLayout([], [{ top: 100, bottom: 200, left: 100, right: 200 }, { top: 203, bottom: 300, left: 100, right: 200 }, { top: 0, bottom: 5, left: 0, right: 5 }], page);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ kind: 'cut', why: 'picture', box: { top: 96, bottom: 304 } });
  });

  it('trims a cut-out to its ink', () => {
    // 6×4 pixels, white, with two dark pixels at (2,1) and (4,2).
    const pixels = new Uint8ClampedArray(6 * 4 * 4).fill(255);
    for (const [x, y] of [[2, 1], [4, 2]]) pixels.set([20, 20, 20, 255], (y! * 6 + x!) * 4);
    expect(inkBounds(pixels, 6, 4)).toEqual({ top: 1, bottom: 3, left: 2, right: 5 });
    expect(inkBounds(new Uint8ClampedArray(16).fill(255), 2, 2)).toBeUndefined();
  });
});
