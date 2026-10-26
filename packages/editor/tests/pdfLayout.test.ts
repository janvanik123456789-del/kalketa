import { describe, expect, it } from 'vitest';
import { decoration, inkBounds, linesOf, pageLayout, type LayoutLine, type TextPart } from '../src/logic/pdfLayout.js';
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
    expect(pageLayout([line(60, 'Text skenované stránky.')], [{ top: 0, bottom: 842, left: 0, right: 595 }], page)).toEqual([{ kind: 'text', text: 'Text skenované stránky.', box: { top: 60, bottom: 72, left: 70, right: 520 } }]);
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

describe('lines of a PDF page from its pieces of text', () => {
  // A piece on baseline y (downwards), letters of the given size, about half a size wide per letter.
  const part = (x: number, y: number, text: string, size = 11): TextPart => ({ x, right: x + text.length * size * 0.5, y, size, text });

  it('writes exponents and indexes into their line instead of losing them as scraps', () => {
    // "I = 21,4·10⁻⁶ m⁴." as VUT's script sets it: the exponents 5 pt above the line, in 7 pt letters.
    const lines = linesOf([part(100, 300, 'I = 21,4·10'), part(160.5, 295, '-6', 7), part(168, 300, ' m'), part(175, 295, '4', 7), part(179, 300, '.')]);
    expect(lines.map((l) => l.text)).toEqual(['I = 21,4·10⁻⁶ m⁴.']);
    expect(linesOf([part(100, 300, 'M'), part(106, 302.8, 'a', 6.5), part(112, 300, ' = 0 kNm')]).map((l) => l.text)).toEqual(['M_a = 0 kNm']);
    expect(linesOf([part(100, 300, 'Δt'), part(108, 302.8, 'h,a-b', 6.5)]).map((l) => l.text)).toEqual(['Δt_(h,a-b)']);
    expect(linesOf([part(100, 300, 'e'), part(106, 295, 'x+1', 7)]).map((l) => l.text)).toEqual(['e^(x+1)']);
  });

  it('reads a small fraction set in the line, but not an index with an exponent', () => {
    expect(linesOf([part(100, 300, 'r = '), part(122, 295, 'R', 7), part(122, 304, 'M', 7)]).map((l) => l.text)).toEqual(['r = R/M']);
    expect(linesOf([part(100, 300, 'x'), part(106, 302.8, '1', 6.5), part(106, 295, '2', 7)]).map((l) => l.text)).toEqual(['x_1²']);
  });

  it('keeps lines of small letters that are lines of their own', () => {
    // A footnote under the text and a line of the same size above it are not exponents.
    const lines = linesOf([part(100, 300, 'Text odstavce.'), part(100, 318, 'Poznámka pod čarou.', 7), part(100, 287, 'Řádek nad ním.')]);
    expect(lines.map((l) => l.text)).toEqual(['Řádek nad ním.', 'Text odstavce.', 'Poznámka pod čarou.']);
  });
});

describe('decoration of a page', () => {
  it('is an artifact or a light see-through shape, not a drawing', () => {
    // The watermark "KKE/TM" of ZČU's exercises: grey at half opacity.
    expect(decoration({ artifact: false, alpha: 0.502, fill: '#c0c0c0' })).toBe(true);
    expect(decoration({ artifact: true, alpha: 1, fill: '#000000' })).toBe(true);
    expect(decoration({ artifact: false, alpha: 1, fill: '#c0c0c0' })).toBe(false);
    // A dark see-through area of a chart is part of it.
    expect(decoration({ artifact: false, alpha: 0.5, fill: '#1f3a93' })).toBe(false);
    expect(decoration({ artifact: false, alpha: 0.8, fill: '#eeeeee' })).toBe(false);
  });
});
