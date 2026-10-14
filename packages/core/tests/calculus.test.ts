import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';
import { codes, expectValue, last } from './helpers.js';

describe('integral', () => {
  it('integrates smooth functions to full accuracy', () => {
    expectValue('integral(x², x: 0 .. 3)', 9, '', 12);
    expectValue('integral(exp(x), x: 0 .. 1)', Math.E - 1, '', 12);
    expectValue('integral(sin(x), x: 0 .. π)', 2, '', 12);
    // Bounds the other way round give the opposite sign.
    expectValue('integral(x, x: 2 .. 0)', -2, '', 12);
  });

  it('settles a result near zero by the size of the values (a work over a turn), without a warning', () => {
    // Parts that cancel: the result is zero up to rounding, no digits of it to chase.
    expect(codes('integral(sin(x), x: 0 .. 2·π)')).toEqual([]);
    // A kink and parts that cancel exactly: ∫|x − 0,3| dx = 0,29 on 0 .. 1.
    expect(codes('integral(abs(x - 0.3) - 0.29, x: 0 .. 1)')).toEqual([]);
    expect(Math.abs(last('integral(sin(x) - 0.25, x: 0 .. 2·π) + π/2').value)).toBeLessThan(1e-9);
  });

  it('gives the unit of the integrand times the variable', () => {
    // A uniform load over the span: kN/m · m = kN.
    expectValue('q := 12 kN/m\nL := 5 m\nintegral(q, x: 0 m .. L)', 60, 'kN');
    // ∫ M dx of a simply supported beam: q·L³/12.
    expectValue('q := 12 kN/m\nL := 5 m\nM(x) := q·x·(L - x)/2\nintegral(M(x), x: 0 m .. L) | kN·m²', (12 * 125) / 12, 'kN·m²');
    expect(codes('integral(x, x: 0 m .. 5 s)')).toEqual(['E-UNIT-MISMATCH']);
  });

  it('has a variable of its own, even one that spells a unit', () => {
    // x of the sheet is neither read nor changed; t is time here, not tonnes.
    expectValue('x := 100\nintegral(x, x: 0 .. 2)', 2, '', 12);
    expectValue('x := 100\nI := integral(x, x: 0 .. 2)\nx =', 100, '', 12);
    expectValue('integral(3·t², t: 0 s .. 2 s) | s³', 8, 's³', 12);
  });

  it('works inside user functions and handles a weak singularity', () => {
    expectValue('F(b) := integral(x, x: 0 .. b)\nF(4)', 8, '', 12);
    expectValue('integral(1/sqrt(x), x: 0 .. 1)', 2, '', 6);
  });

  it('tells how to write it', () => {
    expect(codes('integral(x²)')).toEqual(['E-CALCULUS-FORM']);
    expect(codes('integral(x², x: 2)')).toEqual(['E-CALCULUS-FORM']);
  });
});

describe('derivative', () => {
  it('first and second derivative', () => {
    expectValue('derivative(x³, x: 2)', 12, '', 8);
    expectValue('derivative(sin(x), x: 0)', 1, '', 9);
    expectValue('derivative(x³, x: 2, order: 2)', 12, '', 6);
    expectValue('f(x) := exp(2·x)\nderivative(f(x), x: 0.5)', 2 * Math.exp(1), '', 8);
  });

  it('gives the unit of the expression over the variable', () => {
    // A deflection line w(x) in mm along x in m: the slope in mm/m.
    expectValue('w(x) := 2 mm·(x/(1 m))²\nderivative(w(x), x: 1 m)', 4, 'mm/m', 7);
    // The curvature, second derivative: mm/m².
    expectValue('w(x) := 2 mm·(x/(1 m))²\nderivative(w(x), x: 1 m, order: 2)', 4, 'mm/m²', 5);
    expect(codes('derivative(x², x: 1, order: 3)')).toEqual(['E-DOMAIN']);
  });
});

describe('sum with a variable', () => {
  it('sums an expression over whole numbers', () => {
    expectValue('sum(k, k: 1 .. 100)', 5050, '', 12);
    expectValue('n := 10\nsum(2^k, k: 0 .. n)', 2047, '', 12);
    expect(last('sum(1/k², k: 1 .. 100000)').value).toBeCloseTo(Math.PI ** 2 / 6, 4);
    // The series form is still there.
    expectValue('sum([1, 2, 3] kN)', 6, 'kN');
    expect(codes('sum(k, k: 1.5 .. 3)')).toEqual(['E-DOMAIN']);
  });

  it('keeps the sheet free of the variable', () => {
    const result = evaluateSheet('S := sum(k, k: 1 .. 3)\nk =');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E-UNDEFINED']);
  });
});
