import { describe, expect, it } from 'vitest';
import { builtinFunctions, evaluateSheet, withTimeLimit, FUNCTION_MODULES, FUNCTION_NAMES, fromDecimalComma, SheetSession, signature, toDecimalComma } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

describe('user functions', () => {
  it('compute with units given at the call', () => {
    expectValue('A_kruh(d) := π·d²/4\nA_kruh(20 mm) | mm²', Math.PI * 100, 'mm²');
    expectValue('σ(M, W) := M/W\nσ(37.5 kN·m, 194.3 cm³) | MPa', 37.5e3 / 194.3e-6 / 1e6, 'MPa');
  });

  it('see the values defined above them', () => {
    expectValue('E := 210 GPa\nk(I, L) := 48·E·I/L³\nk(1943 cm⁴, 5 m) | kN/m', (48 * 210e9 * 1943e-8) / 125 / 1e3, 'kN/m');
  });

  it('take parameters that spell units (m, t, s, d)', () => {
    expectValue('ṁ(m, t) := m/t\nṁ(10 kg, 2 s) | kg/s', 5, 'kg/s');
    expectValue('f(d) := 2·d\nf(3 m) | m', 6, 'm');
  });

  it('call other functions and take functions as arguments', () => {
    expectValue('sq(x) := x²\nplocha(a, b) := sq(a) + sq(b)\nplocha(3 m, 4 m) | m²', 25, 'm²');
    expectValue('sq(x) := x²\npouzij(g, x) := g(x)\npouzij(sq, 3)', 9, '');
  });

  it('take if() item by item when its condition compares a series', () => {
    const items = (source: string) => {
      const r = evaluateSheet(source);
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const v = r.statements.at(-1)!;
      return v.displayList?.map((d) => `${Number(d.value.toFixed(6))} ${d.unit}`.trim());
    };
    // Only the positive part of a series; the other branch a number.
    expect(items('x := [-2, 0, 3] m\ny := if(x > 0 m, x, 0 m)')).toEqual(['0 m', '0 m', '3 m']);
    // A zero without a unit takes the unit of the series, as in a sum.
    expect(items('x := [-2, 0, 3] m\ny := if(x > 0, 1, -1)')).toEqual(['-1', '-1', '1']);
    expect(items('x := [-2, 0.5, 3] m\ny := if(x > -1 m and x < 2 m, 1, 0)')).toEqual(['0', '1', '0']);
    expect(items('x := [-2, 0.5, 3] m\ny := if(not(x > 0 m) or x > 2 m, 1, 0)')).toEqual(['1', '0', '1']);
    // Two series compared item by item; branches taken from series of the same length.
    expect(items('a := [1, 5, 3]\nb := [2, 4, 3]\nm := if(a >= b, a, b)')).toEqual(['2', '5', '3']);
    // A plain condition still evaluates only its branch.
    expect(evaluateSheet('y := if(1 > 0, 1, 1/0)').diagnostics).toEqual([]);
    expect(codes('a := [1, 2, 3]\nb := [1, 2]\nm := if(a > 1, b, 0)')).toContain('E-VECTOR-LENGTH');
    expect(codes('a := [1, 2, 3]\nm := if(a > 1, 1 m, 0 s)')).toContain('E-UNIT-MISMATCH');
  });

  it('work with if() and several fields', () => {
    expectValue('k(λ) := if(λ ≤ 0.2, 1, 0.8)\nk(0.5)', 0.8, '');
    // Electrician: voltage drop of a copper cable.
    expectValue('ρ := 0.0178 Ω·mm²/m\nΔU(I, L, S) := 2·ρ·L·I/S\nΔU(16 A, 25 m, 2.5 mm²) | V', (2 * 0.0178 * 25 * 16) / 2.5, 'V');
    // Chemist: mass of a solute.
    expectValue('m_l(c, V, M) := c·V·M\nm_l(0.1 mol/L, 250 mL, 58.44 g/mol) | g', 0.1 * 0.25 * 58.44, 'g');
    // Economist: compound interest (dimensionless).
    expectValue('FV(P, i, n) := P·(1 + i)^n\nFV(1000, 5 %, 10)', 1000 * 1.05 ** 10, '');
  });

  it('are used like values in definitions and checks', () => {
    const source = 'σ(M, W) := M/W\nσ_Ed := σ(37.5 kN·m, 194.3 cm³) | MPa\ncheck "Ohyb": σ(37.5 kN·m, 194.3 cm³) ≤ 235 MPa';
    expect(codes(source)).toEqual([]);
    const result = new SheetSession().update(source);
    expect(result.checks[0]).toMatchObject({ passed: true });
    expect(result.values.get('σ')).toMatchObject({ type: 'function', params: ['M', 'W'] });
  });

  it('report mistakes', () => {
    expect(codes('f(x) := f(x) + 1')).toContain('E-RECURSION');
    // A line that would compute for minutes is stopped (here the whole sheet within a short limit); after it, all computes again.
    const start = Date.now();
    const slow = withTimeLimit(200, () => evaluateSheet('s := sum(sum(i·j, j: 1 .. 10000), i: 1 .. 10000)'));
    expect(Date.now() - start).toBeLessThan(5000);
    expect(slow.diagnostics.map((d) => d.code)).toEqual(['E-TIME-LIMIT']);
    expect(slow.diagnostics[0]?.params['seconds']).toBe(1);
    expect(codes('b := 2')).toEqual([]);
    expect(codes('f(x) := x + y')).toContain('E-UNDEFINED');
    expect(codes('f(x) := g(x)')).toContain('E-FUNC-UNKNOWN');
    expect(codes('f(x) := x\nf(1, 2)')).toContain('E-FUNC-ARITY');
    expect(codes('a := 5\na(2)')).toContain('E-NOT-FUNCTION');
    expect(codes('sqrt(x) := x')).toContain('E-RESERVED');
    expect(codes('pick(x) := x')).toContain('E-RESERVED');
    expect(codes('f(x, x) := x')).toContain('E-REDEFINED');
    expect(codes('f(x) := x\nf(x) := 2·x')).toContain('E-REDEFINED');
    expect(codes('f(x) := x + 1 m\nf(2 s)')).toContain('E-UNIT-MISMATCH');
    expect(codes('y := f(2)\nf(x) := x')).toContain('E-DEFINED-LATER');
  });

  it('are recalculated when a value they read changes, and only then', () => {
    const session = new SheetSession();
    const sheet = (e: string) => `E := ${e}\nk(I, L) := 48·E·I/L³\nK := k(1943 cm⁴, 5 m)\nx := 1`;
    session.update(sheet('210 GPa'));
    const changed = session.update(sheet('200 GPa'));
    expect(changed.stats.evaluated).toBe(3);
    expect((changed.values.get('K') as { si: number }).si).toBeCloseTo((48 * 200e9 * 1943e-8) / 125);
    const again = session.update(sheet('200 GPa'));
    expect(again.stats.evaluated).toBe(0);
  });

  it('are recalculated when their body changes', () => {
    const session = new SheetSession();
    session.update('f(x) := 2·x\ny := f(3)');
    const changed = session.update('f(x) := 3·x\ny := f(3)');
    expect((changed.values.get('y') as { si: number }).si).toBe(9);
  });

  it('are written with ";" between parameters in the decimal-comma notation', () => {
    expect(toDecimalComma('σ(M, W) := M/W·1.5')).toBe('σ(M; W) := M/W·1,5');
    expect(fromDecimalComma('σ(M; W) := M/W·1,5')).toBe('σ(M, W) := M/W·1.5');
  });
});

describe('function registry', () => {
  it('describes every built-in function with a module and parameters', () => {
    for (const def of builtinFunctions.all()) {
      expect(FUNCTION_MODULES, def.name).toContain(def.module);
      expect(def.params.length, def.name).toBeGreaterThan(0);
    }
    expect(builtinFunctions.get('find_min')?.module).toBe('tables');
    expect(FUNCTION_NAMES).not.toContain('pick');
  });

  it('checks the number of arguments in one place', () => {
    expect(codes('sin(1, 2)')).toEqual(['E-FUNC-ARITY']);
    expect(codes('round(1, 2, 3)')).toEqual(['E-FUNC-ARITY']);
    expect(codes('hypot(3)')).toEqual(['E-FUNC-ARITY']);
  });

  it('writes signatures in the notation of the sheet', () => {
    expect(signature(builtinFunctions.get('atan2')!)).toBe('atan2(y, x)');
    expect(signature(builtinFunctions.get('atan2')!, ';')).toBe('atan2(y; x)');
  });
});

describe('math and statistics functions', () => {
  it('log with a base, mod, sign, factorial, hypot', () => {
    expectValue('log(8, 2)', 3, '');
    expectValue('mod(7, 3)', 1, '');
    expectValue('mod(-1, 3)', 2, '');
    expectValue('mod(1250 mm, 1 m)', 250, 'mm');
    expectValue('sign(-4 kN)', -1, '');
    expectValue('factorial(5)', 120, '');
    expectValue('hypot(3 m, 4 m)', 5, 'm');
    expectValue('2 kΩ ∥ 3 kΩ', 1.2, 'kΩ');
    expectValue('parallel(2 Ω, 3 Ω, 6 Ω)', 1, 'Ω');
    expectValue('R := 500 Ω\nR ∥ (2 kΩ + 3 kΩ) | Ω', 5000 / 11, 'Ω');
    expect(codes('2 Ω ∥ 0 Ω')).toEqual(['E-DOMAIN']);
    expect(codes('2 Ω ∥ 3 m')).toEqual(['E-UNIT-MISMATCH']);
    expect(codes('log(8, 1)')).toEqual(['E-DOMAIN']);
    expect(codes('factorial(2.5)')).toEqual(['E-DOMAIN']);
    expect(codes('mod(5 m, 2 s)')).toEqual(['E-UNIT-MISMATCH']);
  });

  it('round to decimals', () => {
    expectValue('round(3.14159, 2)', 3.14, '');
    expectValue('round(2.5)', 3, '');
  });

  it('median and sample standard deviation keep the unit', () => {
    expectValue('median([3, 1, 2] kN)', 2, 'kN');
    expectValue('median([4, 1, 3, 2])', 2.5, '');
    expectValue('stdev([2, 4, 4, 4, 5, 5, 7, 9] mm)', Math.sqrt(32 / 7), 'mm');
    expect(codes('stdev(range(1, 1))')).toEqual(['E-DOMAIN']);
  });

  it('hyperbolic inverses', () => {
    expectValue('asinh(sinh(0.7))', 0.7, '');
    expectValue('atanh(0.5)', Math.atanh(0.5), '');
    expect(codes('acosh(0.5)')).toEqual(['E-DOMAIN']);
  });
});
