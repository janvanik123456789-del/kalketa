import { describe, expect, it } from 'vitest';
import { lineSourceOf, lineTargetOf, withLineSource, withLineTarget } from '../src/logic/lineFormat.js';

describe('the unit and the source of a line, from the floating toolbar', () => {
  it('reads and sets the unit after "|", keeping attributes and the comment', () => {
    expect(lineTargetOf('M_Ed := q·L^2/8 | kN·m {decimals=2}  \' moment')).toBe('kN·m');
    expect(lineTargetOf('K := [4, -2 | -2, 4] kN/m')).toBeUndefined();
    expect(withLineTarget('M_Ed := q·L^2/8 {decimals=2}  \' moment', 'kN·m')).toBe('M_Ed := q·L^2/8 | kN·m {decimals=2}  \' moment');
    expect(withLineTarget('M_Ed := q·L^2/8 | kN·m', 'N·m')).toBe('M_Ed := q·L^2/8 | N·m');
    expect(withLineTarget('M_Ed := q·L^2/8 | kN·m', undefined)).toBe('M_Ed := q·L^2/8');
    expect(withLineTarget('K := [4, -2 | -2, 4] kN/m', 'N/mm')).toBe('K := [4, -2 | -2, 4] kN/m | N/mm');
  });

  it('reads and sets the source, after the unit and before attributes', () => {
    expect(lineSourceOf('check "Ohyb": σ ≤ f_y   source "EN 1993-1-1, 6.2.5"')).toBe('EN 1993-1-1, 6.2.5');
    expect(withLineSource('check "Ohyb": σ ≤ f_y', 'EN 1993-1-1, 6.2.5')).toBe('check "Ohyb": σ ≤ f_y source "EN 1993-1-1, 6.2.5"');
    expect(withLineSource('M_Ed := q·L^2/8 | kN·m {eq}', 'EN 1990, 6.10')).toBe('M_Ed := q·L^2/8 | kN·m source "EN 1990, 6.10" {eq}');
    expect(withLineSource('check "Ohyb": σ ≤ f_y source "x"', '')).toBe('check "Ohyb": σ ≤ f_y');
    expect(withLineTarget('M := 5 kN·m source "S"', 'N·m')).toBe('M := 5 kN·m | N·m source "S"');
  });
});
