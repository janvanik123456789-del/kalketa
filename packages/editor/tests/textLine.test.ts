import { describe, expect, it } from 'vitest';
import { formatTextLine, marksOf, parseTextLine, recolor, runsOf } from '../src/logic/textLine.js';

describe('a line of text edited as in a word processor', () => {
  it('reads the words with their bold and italic parts, the marks of the line apart, and writes them back', () => {
    const line = parseTextLine('"Mez pevnosti **oceli** a *litiny*" [T1] {size=12 align=center}  \' poznámka')!;
    expect(line.level).toBe(0);
    expect(line.runs).toEqual([{ text: 'Mez pevnosti ' }, { text: 'oceli', bold: true }, { text: ' a ' }, { text: 'litiny', italic: true }]);
    expect([...line.attributes]).toEqual([['size', '12'], ['align', 'center']]);
    expect(formatTextLine(line)).toBe('"Mez pevnosti **oceli** a *litiny*" [T1] {size=12 align=center}  \' poznámka');
  });

  it('reads a heading, mends a text whose closing quote got lost, keeps quotes out of the words', () => {
    expect(formatTextLine(parseTextLine('## Zadání {pos}')!)).toBe('## Zadání {pos}');
    const broken = parseTextLine('"Koeficient dynamiky namáhání {font=serif italic}')!;
    expect(formatTextLine(broken)).toBe('"Koeficient dynamiky namáhání" {font=serif italic}');
    expect(formatTextLine({ ...parseTextLine('""')!, runs: [{ text: 'řekl "ano"' }] })).toBe('"řekl ”ano”"');
    expect(parseTextLine('F := 1600 N')).toBeUndefined();
    expect(runsOf('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }]);
    expect(runsOf('***obojí***')).toEqual([{ text: 'obojí', bold: true, italic: true }]);
  });

  it('gives a colour to the marked words only, written {red}…{/}', () => {
    const runs = runsOf('Koeficient **dynamiky** namáhání');
    const red = recolor(runs, 11, 28, 'red');
    expect(marksOf(red)).toBe('Koeficient {red}**dynamiky** namáhání{/}');
    expect(runsOf(marksOf(red))).toEqual(red);
    expect(marksOf(recolor(red, 19, 28, undefined))).toBe('Koeficient {red}**dynamiky**{/} namáhání');
  });
});
