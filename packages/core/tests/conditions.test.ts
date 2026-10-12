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

describe('a quadratic written as a function of the sheet', () => {
  it('is written out into the equation and solved as one: y(x) := a·x² + b·x + c, solve x ∈ ℝ: y(x) == 0', () => {
    const found = roots(`${coefficients(-10)}y(x) := a·x^2 + b·x + c\nsolve x ∈ ℝ, x > 0: y(x) == 0`);
    expect(found.discriminant).toBe(216);
    expect(found.roots.map((r) => r.kept)).toEqual([true, false]);
    // Without conditions too: the one positive root.
    const r = evaluateSheet(`${coefficients(-10)}y(x) := a·x^2 + b·x + c\nsolve u: y(u) == 0`);
    expect((r.values.get('u') as Quantity).si).toBeCloseTo(1.0697, 3);
  });
});

describe('the y axis of a chart set by hand', () => {
  it('gives the range in the unit of the curves, smaller first', () => {
    const r = evaluateSheet('y(x) := 5·x^2 + 4·x - 10\nplot(y(x), x: -3 .. 2, ylim: -15 .. 15)');
    expect(r.statements.at(-1)!.plot?.yRange).toEqual([-15, 15]);
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, ylim: 5 .. 1)').diagnostics.map((d) => d.code)).toContain('E-PLOT-YLIM');
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, ylim: 0 m .. 1 m)').diagnostics.map((d) => d.code)).toContain('E-PLOT-UNITS');
  });
});

describe('the roots of a curve in a chart', () => {
  it('are found where it crosses the x axis, refined to the exact value', () => {
    const r = evaluateSheet('y(x) := 5·x^2 + 4·x - 10\nplot(y(x), x: -3 .. 2, roots: true)');
    const roots = r.statements.at(-1)!.plot!.series[0]!.roots!;
    expect(roots.map((x) => Number(x.toFixed(6)))).toEqual([-1.869694, 1.069694]);
    expect(evaluateSheet('plot(x^2 + 1, x: -3 .. 2, roots: true)').statements.at(-1)!.plot!.series[0]!.roots).toBeUndefined();
  });
});
