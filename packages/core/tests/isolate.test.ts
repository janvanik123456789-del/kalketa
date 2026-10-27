import { describe, expect, it } from 'vitest';
import { evaluateSheet, formatExpr } from '../src/index.js';

const solved = (source: string) => {
  const sheet = evaluateSheet(source);
  const r = sheet.statements.at(-1)!;
  return { sheet, solution: r.solutions?.[0], codes: sheet.diagnostics.map((d) => d.code) };
};

describe('solve expresses one unknown as a formula', () => {
  it('undoes the operations around the unknown, and the unit comes from the formula', () => {
    const { solution, codes } = solved('M_Ed := 37.5 kN·m\nq := 12 kN/m\nsolve L: M_Ed == q·L²/8');
    expect(codes).toEqual([]);
    expect(formatExpr(solution!.formula!)).toBe('sqrt(8·M_Ed/q)');
    expect(solution!.display.value).toBeCloseTo(5);
    expect(solution!.display.unit).toBe('m');
  });

  it('cancels two minuses: a payment of a loan is D/(…), not −−D/(…) (F4 of the samples)', () => {
    const { solution } = solved('D := 50000 CZK\ni := 8 %\nsolve x: D == x/(1 + i) + x/(1 + i)^2');
    expect(formatExpr(solution!.formula!)).toBe('D/(1/(1 + i) + 1/(1 + i)^2)');
    expect(solution!.display.value).toBeCloseTo(28038.46, 2);
  });

  it('expresses a diameter from the shear stress, with a cube root', () => {
    const { solution, codes } = solved('M_k := 98.79 N·m\nτ_dov := 60 MPa\nsolve d: τ_dov == 16·M_k/(π·d^3)');
    expect(codes).toEqual([]);
    expect(formatExpr(solution!.formula!)).toBe('cbrt(16·M_k/(τ_dov·π))');
    expect(solution!.value.si).toBeCloseTo(0.02032, 5);
  });

  it('solves an unknown written twice when the equation is linear', () => {
    const { solution, codes } = solved('a := 3\nb := 4\nc := 1\ne := 10\nsolve x: a·x + b == c·x + e');
    expect(codes).toEqual([]);
    expect(solution!.value.si).toBeCloseTo(3);
  });

  it('picks of two roots the one in the interval, else the only positive one, and names both when it cannot', () => {
    expect(solved('solve x: x² + 2·x == 8 in 0 .. 10').solution!.value.si).toBeCloseTo(2);
    expect(solved('solve x: x² + 2·x == 8 in -10 .. 0').solution!.value.si).toBeCloseTo(-4);
    expect(solved('solve x: x² + 2·x == 8').solution!.value.si).toBeCloseTo(2);
    const both = solved('solve x: x² - 5·x == -6');
    expect(both.codes).toEqual(['E-SOLVE-ROOTS']);
    expect(both.sheet.diagnostics[0]!.params['roots']).toBe('3; 2');
  });

  it('goes on numerically where no formula exists, as before', () => {
    const { solution, codes } = solved('solve x: x·exp(x) == 3 in 0 .. 2');
    expect(codes).toEqual([]);
    expect(solution!.formula).toBeUndefined();
    expect(solution!.value.si).toBeCloseTo(1.0499, 4);
  });

  it('keeps the unit of an interval', () => {
    const { solution } = solved('s := 100 m\nv := 5 m/s\nsolve t: s == v·t in 0 min .. 60 min');
    expect(solution!.display.unit).toBe('min');
    expect(solution!.display.value).toBeCloseTo(1 / 3);
  });
});

describe('formatExpr', () => {
  it('writes an expression back with brackets only where needed', () => {
    const line = (text: string) => {
      const s = evaluateSheet(`a := 1\nb := 2\nc := 3\nx := ${text}`).sheet.statements.at(-1)!;
      return s.kind === 'definition' ? formatExpr(s.expr) : '';
    };
    expect(line('a - (b - c)')).toBe('a - (b - c)');
    expect(line('a/(b·c)')).toBe('a/(b·c)');
    expect(line('(a + b)^2')).toBe('(a + b)^2');
    expect(line('-(a + b)')).toBe('-(a + b)');
    expect(line('2·(5 m)')).toBe('2·(5 m)');
  });
});
