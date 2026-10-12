import { describe, expect, it } from 'vitest';
import { evaluateSheet, type Quantity } from '../src/index.js';

const coefficients = (c: number) => `a := 5\nb := 4\nc := ${c}\n`;

/** The roots of the last line: each value (re, im) and whether it was kept. */
function roots(source: string) {
  const r = evaluateSheet(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const last = r.statements.at(-1)!;
  return {
    roots: last.roots!.roots.map((root) => ({ re: Number(root.value.si.toFixed(4)), im: Number((root.value.im ?? 0).toFixed(4)), kept: root.rejected === undefined })),
    discriminant: last.roots!.quadratic?.discriminant.si,
    values: r.values,
  };
}

describe('the conditions of a solution, as on paper', () => {
  it('gives no real root of a quadratic with D < 0, and its complex roots in ℂ', () => {
    const real = roots(`${coefficients(10)}solve x ∈ ℝ: a·x^2 + b·x + c == 0`);
    expect(real.discriminant).toBe(-184);
    expect(real.roots.every((r) => !r.kept)).toBe(true);
    expect(real.values.has('x')).toBe(false);
    const complex = roots(`${coefficients(10)}solve x ∈ ℂ: a·x^2 + b·x + c == 0`);
    expect(complex.roots).toEqual([{ re: -0.4, im: 1.3565, kept: true }, { re: -0.4, im: -1.3565, kept: true }]);
  });

  it('keeps the roots meeting the conditions: one a value, more a vector', () => {
    const one = roots(`${coefficients(-10)}solve x ∈ ℝ, x > 0: a·x^2 + b·x + c == 0`);
    expect(one.roots).toEqual([{ re: 1.0697, im: 0, kept: true }, { re: -1.8697, im: 0, kept: false }]);
    expect((one.values.get('x') as Quantity).si).toBeCloseTo(1.0697, 3);
    const both = roots(`${coefficients(-10)}solve x ∈ R: a·x^2 + b·x + c == 0`);
    expect(both.values.get('x')?.type).toBe('vector');
  });

  it('writes both values of ±, and solves a quadratic with 0 on one side without conditions', () => {
    const r = evaluateSheet(`${coefficients(-10)}w := (-b ± √(b^2 - 4·a·c))/(2·a)\nsolve u: a·u^2 + b·u + c == 0`);
    const w = r.values.get('w');
    expect(w?.type === 'vector' && w.items.map((q) => Number(q.si.toFixed(4)))).toEqual([1.0697, -1.8697]);
    expect((r.values.get('u') as Quantity).si).toBeCloseTo(1.0697, 3);
  });

  it('allows the domain and the conditions with one unknown and one equation only', () => {
    expect(evaluateSheet('solve (x, y) ∈ ℝ: x + y == 1, x - y == 0').diagnostics.map((d) => d.code)).toContain('E-SOLVE-CONDITIONS');
  });
});
