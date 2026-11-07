import { describe, expect, it } from 'vitest';
import { MAX_FAVOURITES, readFavourites, toggleFavourite } from '../src/logic/formulaFavourites.js';

describe('favourite formulas', () => {
  it('reads what was stored, leaving out what is no id', () => {
    expect(readFavourites('["ohybove-napeti", 3, "ohybove-napeti", "Bad Id", "blasius"]')).toEqual(['ohybove-napeti', 'blasius']);
    expect(readFavourites('not json')).toEqual([]);
    expect(readFavourites(null)).toEqual([]);
    expect(readFavourites('{"a": 1}')).toEqual([]);
  });

  it('adds and takes away, never beyond the limit', () => {
    expect(toggleFavourite([], 'a')).toEqual(['a']);
    expect(toggleFavourite(['a', 'b'], 'a')).toEqual(['b']);
    const full = Array.from({ length: MAX_FAVOURITES }, (_, i) => `f${i}`);
    expect(toggleFavourite(full, 'new')).toEqual(full);
    expect(toggleFavourite(full, 'f0')).toHaveLength(MAX_FAVOURITES - 1);
  });
});
