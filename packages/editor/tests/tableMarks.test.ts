import { describe, expect, it } from 'vitest';
import { tableMarksOf, variantKeysOf, withTableMarks } from '../src/logic/sheetTableEdit.js';

const TABLE = ['table Varianty: {across}', '    | varianta | h [mm] |', '    | A        | 300    |', '    | B        | 400    |'].join('\n');

describe('the marks after the head of a table in the sheet', () => {
  it('reads and writes set across and variants together, the rows as they are', () => {
    expect(tableMarksOf(TABLE)).toEqual({ across: true });
    const variants = withTableMarks(TABLE, { across: false, variants: 'B' });
    expect(variants.split('\n')[0]).toBe('table Varianty: {variants=B}');
    expect(variants.split('\n').slice(1)).toEqual(TABLE.split('\n').slice(1));
    expect(tableMarksOf(variants)).toEqual({ across: false, variants: 'B' });
    expect(withTableMarks(variants, { across: false }).split('\n')[0]).toBe('table Varianty:');
  });

  it('names the variants by the first cells of the rows', () => {
    expect(variantKeysOf(TABLE)).toEqual(['A', 'B']);
  });
});
