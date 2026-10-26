import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession, toDecimalComma } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

const si = (source: string, name: string) => (evaluateSheet(source).values.get(name) as { si: number } | undefined)?.si;

describe('solve with one unknown in an interval', () => {
  it('finds the root', () => {
    expectValue('solve x: x² + 2·x == 8 in 0 .. 10\nx =', 2, '');
    expectValue('solve x: x == 3 in 0..10\nx =', 3, '');
  });

  it('keeps units: the unknown takes the unit of the interval', () => {
    // Distance under constant acceleration; t spells a unit but is the unknown here.
    expectValue('solve t: 20 m == (5 m/s)·t + 0.5·(2 m/s²)·t² in 0 s .. 10 s\nt =', (-5 + Math.sqrt(105)) / 2, 's');
  });

  it('finds a root inside when both ends have the same sign', () => {
    expectValue('solve x: x² == 4 in -5 .. 5\nx =', -2, '');
  });

  it('solves a chemical equilibrium (weak acid)', () => {
    const x = si('K := 0.000018\nc := 0.1\nsolve x: x²/(c - x) == K in 0 .. 0.1', 'x')!;
    expect(x ** 2 / (0.1 - x)).toBeCloseTo(0.000018, 12);
  });

  it('solves an internal rate of return', () => {
    const i = si('solve i: -1000 + 300/(1 + i) + 400/(1 + i)^2 + 500/(1 + i)^3 == 0 in 0 .. 1', 'i')!;
    expect(i).toBeGreaterThan(0.08);
    expect(-1000 + 300 / (1 + i) + 400 / (1 + i) ** 2 + 500 / (1 + i) ** 3).toBeCloseTo(0, 8);
  });
});

describe('solve a system', () => {
  it('takes "== 0" without a unit and finds the root of equations against zero (canonical equations of the force method)', () => {
    const source = [
      'δ_10 := 0.4177 mm',
      'δ_11 := 0.01838 mm/kN',
      'δ_20 := -64.06 mm',
      'δ_22 := 6.684 mm/kN',
      'solve (X_1, X_2): δ_10 + δ_11·X_1 == 0, δ_20 + δ_22·X_2 == 0 guess X_1 = 1 kN, X_2 = 1 kN',
    ].join('\n');
    expect(codes(source)).toEqual([]);
    expect(si(source, 'X_1')! / 1000).toBeCloseTo(-0.4177 / 0.01838, 6);
    expect(si(source, 'X_2')! / 1000).toBeCloseTo(64.06 / 6.684, 6);
    // One unknown against zero, and a forgotten unit written as a number other than zero is still caught.
    expect(si('k := 2 N/m\nsolve x: k·x - 6 N == 0 guess x = 1 m', 'x')).toBeCloseTo(3, 9);
    expect(codes('k := 2 N/m\nsolve x: k·x - 6 N == 1 guess x = 1 m')).toEqual(['E-UNIT-MISMATCH']);
  });

  it('finds the loop currents of a circuit, with units from the guesses', () => {
    const source = [
      'U_1 := 10 V',
      'U_2 := 5 V',
      'R_1 := 2 Ω',
      'R_2 := 3 Ω',
      'R_3 := 4 Ω',
      'solve (I_1, I_2):',
      '    U_1 == R_1·I_1 + R_3·(I_1 - I_2)',
      '    U_2 == R_2·I_2 + R_3·(I_2 - I_1)',
      '    guess I_1 = 1 A, I_2 = 1 A',
      'I_2 =',
    ].join('\n');
    expect(codes(source)).toEqual([]);
    expectValue(source, 70 / 26, 'A');
    expect(si(source, 'I_1')).toBeCloseTo(90 / 26, 10);
  });

  it('solves nonlinear equations on one line', () => {
    const r = evaluateSheet('solve (x, y): x² + y² == 25, y == x + 1 guess x = 1, y = 1');
    expect((r.values.get('x') as { si: number }).si).toBeCloseTo(3, 10);
    expect((r.values.get('y') as { si: number }).si).toBeCloseTo(4, 10);
    expect(r.statements[0]!.solutions?.map((s) => s.name)).toEqual(['x', 'y']);
  });

  it('is recalculated when a value it reads changes', () => {
    const session = new SheetSession();
    const sheet = (a: string) => `a := ${a}\nsolve x: x·a == 6 in 0 .. 100\ny := x + 1`;
    session.update(sheet('2'));
    const r = session.update(sheet('3'));
    expect((r.values.get('y') as { si: number }).si).toBeCloseTo(3, 10);
    expect(session.update(sheet('3')).stats.evaluated).toBe(0);
  });
});

describe('solve reports', () => {
  it('a wrong number of equations', () => expect(codes('solve (a, b): a == 1')).toEqual(['E-SOLVE-COUNT']));
  it('no root in the interval', () => expect(codes('solve x: x² == -1 in 0 .. 10')).toEqual(['E-SOLVE-NO-ROOT']));
  it('dependent equations', () => expect(codes('solve (a, b): a + b == 1, 2·a + 2·b == 2')).toEqual(['E-SOLVE-SINGULAR']));
  it('sides of different units', () => expect(codes('solve x: x == 5 m in 0 .. 10')).toEqual(['E-UNIT-MISMATCH']));
  it('an unknown defined above', () => expect(codes('x := 1\nsolve x: x == 2 in 0 .. 5')).toEqual(['E-REDEFINED']));
  it('a guess for a name that is not unknown', () => expect(codes('solve x: x² == 4 guess y = 1')).toContain('E-NAMED-ARG'));
  it('an interval with more unknowns', () => expect(codes('solve (a, b): a == 1, b == 2 in 0 .. 1')).toEqual(['E-SYNTAX']));
  it('a missing equation sign', () => expect(codes('solve x: x + 1 in 0 .. 1')).toEqual(['E-SYNTAX']));
  it('using an unknown before the solve line', () => expect(codes('y := x\nsolve x: x == 2 in 0 .. 5')).toEqual(['E-DEFINED-LATER']));
});

describe('solve in the decimal-comma notation', () => {
  it('uses ";" between unknowns, equations and guesses', () => {
    expect(toDecimalComma('solve (a, b): a == 1.5, b == a guess a = 1, b = 2')).toBe('solve (a; b): a == 1,5; b == a guess a = 1; b = 2');
  });
});
