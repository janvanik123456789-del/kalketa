import { describe, expect, it } from 'vitest';
import { evaluateSheet, type Value } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

/** The value of the last statement, as SI numbers row by row. */
function numbersOf(source: string): number[][] | number[] {
  const result = evaluateSheet(source);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const value = result.statements.at(-1)!.value as Value;
  if (value.type === 'vector') return value.items.map((q) => q.si);
  if (value.type !== 'matrix') throw new Error(`not a matrix: ${value.type}`);
  return Array.from({ length: value.rows }, (_, i) => value.items.slice(i * value.cols, (i + 1) * value.cols).map((q) => q.si));
}

const close = (actual: number[][] | number[], expected: number[][] | number[], digits = 9) => {
  expect(actual.flat().length).toBe(expected.flat().length);
  actual.flat().forEach((a, k) => expect(a).toBeCloseTo(expected.flat()[k]!, digits));
};

describe('matrices', () => {
  it('are written row by row and read by A[i, j]', () => {
    close(numbersOf('A := [1, 2 | 3, 4]\nA ='), [[1, 2], [3, 4]]);
    expectValue('A := [1, 2 | 3, 4]\nA[2, 1]', 3, '');
    expectValue('A := [1, 2 | 3, 4] kN\nA[1, 2]', 2, 'kN');
    expect(codes('[1, 2 | 3]')).toEqual(['E-MATRIX-SHAPE']);
    expect(codes('A := [1, 2 | 3, 4]\nA[3, 1]')).toEqual(['E-INDEX']);
  });

  it('show each item in its unit, or all in a target unit', () => {
    const shown = evaluateSheet('K := [12 kN/m, 6 kN | 6 kN, 4 kN·m]\nK =').statements.at(-1)!.displayMatrix!;
    expect(shown.items.map((d) => d.unit)).toEqual(['kN/m', 'kN', 'kN', 'kN·m']);
    const target = evaluateSheet('A := [1, 2 | 3, 4] kN\nA | N').statements.at(-1)!.displayMatrix!;
    expect(target.items.map((d) => `${d.value} ${d.unit}`)).toEqual(['1000 N', '2000 N', '3000 N', '4000 N']);
  });

  it('add, scale and multiply as matrices', () => {
    close(numbersOf('A := [1, 2 | 3, 4]\nA + A'), [[2, 4], [6, 8]]);
    close(numbersOf('A := [1, 2 | 3, 4]\n2·A'), [[2, 4], [6, 8]]);
    close(numbersOf('[1, 2 | 3, 4]·[5, 6 | 7, 8]'), [[19, 22], [43, 50]]);
    // A·v is a series; v·A too (v as a row).
    close(numbersOf('[1, 2 | 3, 4]·[1, 1]'), [3, 7]);
    close(numbersOf('[1, 1]·[1, 2 | 3, 4]'), [4, 6]);
    close(numbersOf('A := [1, 2 | 3, 4]\nA^2'), [[7, 10], [15, 22]]);
    close(numbersOf('A := [4, 7 | 2, 6]\nA^-1'), [[0.6, -0.7], [-0.2, 0.4]]);
    expect(codes('[1, 2 | 3, 4]·[1, 2, 3]')).toEqual(['E-MATRIX-SHAPE']);
    // Units of a product must add up: kN·m + kN·s is wrong.
    expect(codes('[1 kN, 2 kN | 3 kN, 4 kN]·[1 m, 2 s]')).toEqual(['E-UNIT-MISMATCH']);
  });

  it('det, inverse, transpose and friends', () => {
    expectValue('det([1, 2 | 3, 4])', -2, '', 12);
    close(numbersOf('inverse([4, 7 | 2, 6])'), [[0.6, -0.7], [-0.2, 0.4]]);
    close(numbersOf('transpose([1, 2 | 3, 4])'), [[1, 3], [2, 4]]);
    close(numbersOf('transpose(transpose([1, 2, 3]))'), [1, 2, 3]);
    close(numbersOf('identity(2)'), [[1, 0], [0, 1]]);
    close(numbersOf('diag([1, 2])'), [[1, 0], [0, 2]]);
    close(numbersOf('diag([1, 2 | 3, 4])'), [1, 4]);
    close(numbersOf('row([1, 2 | 3, 4], 2)'), [3, 4]);
    close(numbersOf('col([1, 2 | 3, 4], 2)'), [2, 4]);
    expectValue('rows([1, 2, 3 | 4, 5, 6])', 2, '');
    expectValue('cols([1, 2, 3 | 4, 5, 6])', 3, '');
    expectValue('trace([1, 2 | 3, 4])', 5, '');
    expectValue('dot([1, 2, 3], [4, 5, 6])', 32, '');
    close(numbersOf('cross([1, 0, 0], [0, 1, 0])'), [0, 0, 1]);
    expectValue('norm([3, 4] m)', 5, 'm');
    expect(codes('det([1, 2, 3 | 4, 5, 6])')).toEqual(['E-MATRIX-SQUARE']);
    expect(codes('inverse([1, 2 | 2, 4])')).toEqual(['E-MATRIX-SINGULAR']);
  });

  it('solve A·x = b with the units of a stiffness matrix', () => {
    // Two springs: K in kN/m, F in kN, u in m.
    const u = evaluateSheet('K := [2, -1 | -1, 2] kN/m\nF := [1, 0] kN\nu := lsolve(K, F)\nu =').statements.at(-1)!;
    expect(u.displayList!.map((d) => d.unit)).toEqual(['m', 'm']);
    close(u.displayList!.map((d) => d.value), [2 / 3, 1 / 3]);
    // A beam end: rows in kN/m and kN, columns 1 and m; a load column of kN and kN·m (a series has one unit);
    // the deflection in m, the rotation without a unit.
    const x = evaluateSheet('K := [12 kN/m, 6 kN | 6 kN, 4 kN·m]\nF := [1 kN | 0 kN·m]\nx := lsolve(K, F)\nx =').statements.at(-1)!;
    expect(x.displayList!.map((d) => d.unit)).toEqual(['m', '']);
    close(x.displayList!.map((d) => d.value), [1 / 3, -0.5]);
    expect(codes('det([1 m, 2 | 3, 4 s])')).toEqual(['E-MATRIX-UNITS']);
  });

  it('eigenvalues, also of K·φ = ω²·M·φ', () => {
    close(numbersOf('eigenvals([2, -1 | -1, 2])'), [1, 3]);
    const omega2 = evaluateSheet('K := [2000, -1000 | -1000, 1000] N/m\nM := [2, 0 | 0, 1] kg\nλ := eigenvals(K, M)\nλ =').statements.at(-1)!;
    close(
      omega2.displayList!.map((d) => d.value),
      [1000 - Math.sqrt(5e5), 1000 + Math.sqrt(5e5)],
      6,
    );
    expect(omega2.displayList![0]!.unit).toBe('1/s²');
    const modes = numbersOf('eigenvecs([2, -1 | -1, 2])') as number[][];
    expect(modes.map((r) => Math.abs(r[0]!))).toEqual([1, 1]);
    expect(Math.abs(modes[0]![1]! + modes[1]![1]!)).toBeLessThan(1e-9);
    expect(codes('eigenvals([1, 2 | 3, 4])')).toEqual(['E-MATRIX-SYMMETRIC']);
  });

  it('work inside user functions', () => {
    expectValue('R(φ) := [cos(φ), -sin(φ) | sin(φ), cos(φ)]\ndet(R(30°))', 1, '', 12);
    expectValue('a := 3\nS(x) := [x, a | a, x]\ndet(S(5))', 16, '', 12);
  });
});
