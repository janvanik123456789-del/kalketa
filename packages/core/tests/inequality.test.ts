import { describe, expect, it } from 'vitest';
import { evaluateSheet, formatExpr } from '../src/index.js';

const solved = (source: string) => {
  const sheet = evaluateSheet(source);
  return { solution: sheet.statements.at(-1)!.solutions?.[0], codes: sheet.diagnostics.map((d) => d.code) };
};

describe('solve with an inequality', () => {
  it('gives the bound of the unknown and its side, as the textbook: S ≤ π·d²/4 ⇒ d ≥ √(4·S/π)', () => {
    const { solution, codes } = solved('S_min := 23.53 mm²\nsolve d: S_min ≤ π·d²/4');
    expect(codes).toEqual([]);
    expect(solution!.relation).toBe('>=');
    expect(formatExpr(solution!.formula!)).toBe('sqrt(4·S_min/π)');
    expect(solution!.display.value).toBeCloseTo(5.4735, 3);
    expect(solution!.display.unit).toBe('mm');
  });

  it('keeps a strict inequality strict and turns the sign where a negative factor is divided out', () => {
    expect(solved('solve x: 2·x + 1 < 7').solution!.relation).toBe('<');
    const turned = solved('solve x: -2·x <= 4').solution!;
    expect(turned.relation).toBe('>=');
    expect(turned.value.si).toBeCloseTo(-2);
  });

  it('finds the side numerically where no formula exists', () => {
    const { solution, codes } = solved('solve x: x·exp(x) >= 3 in 0 .. 2');
    expect(codes).toEqual([]);
    expect(solution!.formula).toBeUndefined();
    expect(solution!.relation).toBe('>=');
    expect(solution!.value.si).toBeCloseTo(1.0499, 4);
  });

  it('refuses what has no single side, and inequalities in systems', () => {
    expect(solved('solve x: x^2 >= 0').codes).toEqual(['E-SOLVE-SIDE']);
    expect(solved('solve (x, y): x + y <= 1, x - y == 0 guess x = 0, y = 0').codes).toEqual(['E-SOLVE-INEQUALITY']);
  });
});
