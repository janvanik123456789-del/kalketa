import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

const last = (source: string) => {
  const sheet = evaluateSheet(source);
  return { result: sheet.statements.at(-1)!, codes: sheet.diagnostics.map((d) => d.code) };
};
const items = (source: string) => {
  const { result } = last(source);
  return result.value?.type === 'vector' ? result.value.items.map((q) => [Number(q.si.toFixed(9)), Number((q.im ?? 0).toFixed(9))]) : undefined;
};

describe('roots of a polynomial', () => {
  it('finds all real roots, in order', () => {
    expect(items('r := roots(x^3 - 6·x^2 + 11·x - 6, x)')).toEqual([[1, 0], [2, 0], [3, 0]]);
    // x = 0 for the missing lowest power.
    expect(items('r := roots(x^3 - 4·x, x)')).toEqual([[-2, 0], [0, 0], [2, 0]]);
  });

  it('finds complex roots, the real ones first', () => {
    expect(items('r := roots((x - 1)·(x^2 + 4), x)')).toEqual([[1, 0], [0, 2], [0, -2]]);
  });

  it('gives the variable the unit that makes every term of one dimension', () => {
    const { result, codes } = last('k := 200 N/m\nm := 2 kg\nr := roots(k - m·ω^2, ω)');
    expect(codes).toEqual([]);
    expect(result.displayList?.map((d) => [Number(d.value.toFixed(6)), d.unit])).toEqual([
      [-10, 'Hz'],
      [10, 'Hz'],
    ]);
  });

  it('reports what is no polynomial', () => {
    expect(last('r := roots(sin(x), x)').codes).toEqual(['E-ROOTS-POLYNOMIAL']);
    expect(last('r := roots(x^2 + 1/x, x)').codes).toEqual(['E-ROOTS-POLYNOMIAL']);
  });
});

describe('minimize and maximize', () => {
  it('find where a function is smallest or largest in the interval, with its unit', () => {
    const { result, codes } = last('q := 12 kN/m\nL := 5 m\nM(x) := q·x·(L - x)/2\nx_max := maximize(M(x), x: 0 m .. L)');
    expect(codes).toEqual([]);
    expect(result.display?.value).toBeCloseTo(2.5, 6);
    expect(result.display?.unit).toBe('m');
  });

  it('find the global extreme in the interval, not the nearest local one', () => {
    // Two minima at x ≈ −1.036 and x ≈ 0.96 (4x³ − 4x + 0.3 = 0); the lower one is at −1.036.
    const { result } = last('x_min := minimize(x^4 - 2·x^2 + 0.3·x, x: -2 .. 2)');
    expect(result.value?.type === 'quantity' && result.value.si).toBeCloseTo(-1.03558, 4);
  });

  it('find the extreme of an integral up to x of a function with jumps in reasonable time', () => {
    // E grows while the work done is positive (up to π), then falls; f jumps at π and 2π.
    const start = performance.now();
    const { result, codes } = last('M_j(t) := if(sin(t) > 0, 3·sin(t)^2 + 1, -2)\nE(x) := integral(M_j(t), t: 0 .. x)\nx_e := maximize(E(x), x: 0 .. 2·π)');
    expect(codes).toEqual([]);
    expect(result.value?.type === 'quantity' && result.value.si).toBeCloseTo(Math.PI, 6);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});

describe('systems without a good first guess', () => {
  it('try other starting values when Newton does not converge from 1', () => {
    // From x = y = 1 the Jacobian is singular; from other starts Newton finds x = 3, y = −3.
    const { result, codes } = last('solve (x, y): x + y == 0, x·y == -9');
    expect(codes).toEqual([]);
    expect(result.solutions?.map((s) => Math.abs(Number(s.value.si.toFixed(6))))).toEqual([3, 3]);
  });
});
