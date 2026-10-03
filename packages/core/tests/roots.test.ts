import { describe, expect, it } from 'vitest';
import { codes, expectValue } from './helpers.js';

describe('roots', () => {
  it('cube root as ∛x and cbrt(x), real for negative numbers', () => {
    expectValue('∛27', 3, '', 12);
    expectValue('∛(-8)', -2, '', 12);
    expectValue('cbrt(64)', 4, '', 12);
    expectValue('2·∛8', 4, '', 12);
    // The unit goes under the root too.
    expectValue('V := 27 m³\n∛V', 3, 'm', 12);
    expectValue('∛(8000 cm³) | cm', 20, 'cm', 9);
  });

  it('n-th root root(x, n)', () => {
    expectValue('root(16, 4)', 2, '', 12);
    expectValue('root(-32, 5)', -2, '', 12);
    expectValue('root(81 m⁴, 4)', 3, 'm', 12);
    expect(codes('root(-16, 4)')).toEqual(['E-DOMAIN']);
    expect(codes('root(16, 2.5)')).toEqual(['E-DOMAIN']);
    expect(codes('root(16, 1)')).toEqual(['E-DOMAIN']);
    expect(codes('root(16, 2 m)')).toEqual(['E-FUNC-ARG-DIM']);
  });
});
