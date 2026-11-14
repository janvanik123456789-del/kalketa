/**
 * Small things Strata's tests met (2026-11-09 to 11), set right on 2026-11-14 for 0.6.5: a warning for x^1/3, a bare
 * zero in a check, readable units (s², 1/d, no ks, m² for dV/dh) and an emptying tank that is not "stiff".
 */
import { describe, expect, it } from 'vitest';
import { SheetSession, defaultRegistry, type SheetResult } from '../src/index.js';

const run = (source: string): SheetResult => new SheetSession({ registry: defaultRegistry }).update(source);
const codes = (source: string) => run(source).diagnostics.map((d) => d.code);
const shown = (source: string, name: string) => {
  const r = run(source).statements.find((s) => 'name' in s.statement && s.statement.name === name);
  return r?.display ? `${Number(r.display.value.toPrecision(6))} ${r.display.unit}`.trim() : undefined;
};

describe('the order of operations', () => {
  it('warns that x^1/3 is no cube root, and only then', () => {
    expect(codes('a := 8^1/3')).toEqual(['W-POWER-FRACTION']);
    expect(codes('a := 8^(1/3)')).toEqual([]);
    expect(codes('x := 3\na := x^2/3')).toEqual([]);
  });
});

describe('a bare zero in a check', () => {
  it('is a zero of the unit on the other side', () => {
    const r = run('p := 3 m^3\ncheck "roste": p > 0');
    expect(r.diagnostics).toEqual([]);
    expect(r.checks[0]?.passed).toBe(true);
  });
});

describe('units shown', () => {
  it('writes powers of one unit as powers', () => {
    expect(shown('a := integral(t, t: 0 s .. 2 s)', 'a')).toBe('2 s²');
    expect(shown('A(x) := 2 m^2\nc := integral(A(x), x: 0 m .. 2 m)', 'c')).toBe('4 m³');
    expect(shown('W(x) := 14.4 m^2 · x\nd := derivative(W(x), x: 2 m)', 'd')).toBe('14.4 m²');
    expect(shown('M(x) := 3 kN·m\nd := derivative(M(x)·x/(1 m), x: 2 m)', 'd')).toBe('3 kN');
  });

  it('keeps a rate per day in days and a frequency in hertz', () => {
    expect(shown('k := 0.35/d', 'k')).toBe('0.35 1/d');
    expect(shown('k := 0.35/d\nt := ln(2)/k', 't')).toBe('1.98042 d');
    expect(shown('T := 0.02 s\nf := 1/T', 'f')).toBe('50 Hz');
    expect(shown('L := 250 cm\na := 2/L', 'a')).toBe('0.8 1/m');
  });

  it('gives seconds no prefix above', () => {
    expect(shown('V := 20 m^3\nQ := 4.3 l/s\nt := V/Q', 't')).toBe('4651.16 s');
    expect(shown('t := 2 ms·3', 't')).toBe('6 ms');
  });
});

describe('the end of a solution', () => {
  it('says an emptying tank ends, not that it is stiff', () => {
    const tank = [
      'A_n := π·(1 m)²/4',
      'A_o := π·(20 mm)²/4',
      'g := 9.81 m/s^2',
      'h_0 := 4 m',
      'dh(h) := -(A_o/A_n)·sqrt(2·g·h)',
      't_v := 2·A_n·sqrt(h_0)/(A_o·sqrt(2·g))',
      'solve h(t): h′ == dh(h) in 0 s .. 1.1·t_v',
      '    h(0 s) == h_0',
    ].join('\n');
    expect(codes(tank)).toContain('E-ODE-SINGULAR');
    expect(codes(tank)).not.toContain('E-ODE-STIFF');
  });
});
