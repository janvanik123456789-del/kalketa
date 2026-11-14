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
    // The fixed step tries all its grids first (several seconds).
    const said = codes(tank);
    expect(said).toContain('E-ODE-SINGULAR');
    expect(said).not.toContain('E-ODE-STIFF');
  }, 30_000);
});

/** Found by the subagents' batches 8 to 11 (2026-11-14), each checked again by hand. */
describe('batches 8 to 11', () => {
  it('keeps the brackets of a unit in its span (a check printed W/(m²·K without its last one)', () => {
    const source = 'U := 0.2 W/(m²·K)\ncheck "X": U ≤ 0.25 W/(m²·K)';
    const r = run(source);
    const check = r.statements[1]!.statement;
    expect(check.kind === 'check' ? source.slice(check.expr.span.offset, check.expr.span.offset + check.expr.span.length) : '').toBe('U ≤ 0.25 W/(m²·K)');
  });

  it('evaluates a polynomial fitted far from zero in its centred form', () => {
    const rows = [1, 2, 4, 7, 11, 18].map((y, i) => `    | ${100000 + i} | ${y} |`).join('\n');
    const r = run(`table D:\n    | x | y |\n${rows}\nf3 := fit(D.y, x: D.x, kind: "poly3")\nr := fit_r2(f3)\nv := f3(100002)`);
    // NumPy polyfit on x − 100002.5: R² 0.9992325697402249, f(100002) 3.9365079365079367.
    expect(Math.abs((r.values.get('r') as { si: number }).si - 0.9992325697402249)).toBeLessThan(1e-12);
    expect(Math.abs((r.values.get('v') as { si: number }).si - 3.9365079365079367)).toBeLessThan(1e-9);
  });

  it('says a key without the unit of its column as units, not as a missing row', () => {
    const table = 'table T2:\n    | h [mm] | A [cm^2] |\n    | 100 | 1 |\n    | 200 | 2 |';
    expect(codes(`${table}\np := pick(T2, 200).A`)).toEqual(['E-UNIT-MISMATCH']);
    expect(codes(`${table}\np := pick(T2, 200 mm).A`)).toEqual([]);
  });

  it('warns of a fraction before a unit only as written side by side', () => {
    expect(codes('a := 3/8 in')).toEqual(['W-FRACTION-BEFORE-UNIT']);
    expect(codes('c := 0.35/(1 d)')).toEqual([]);
    expect(codes('solve u: 1/u == 0.25 m^-1')).toEqual([]);
  });
});

describe('turns per time times a time', () => {
  // Decided by the user 2026-11-14 ("Jako počet otáček"): 100 rpm for 2 s is 3.33 turns, not 0.53 (radians read as turns).
  it('is a number of turns, shown as rev, turned into ° or rad by 2π, and a plain count in what follows', () => {
    const sheet = 'n := 100 rpm\nt := 2 s\nN := n·t\na := n·t | °\nb := n·t | rad\nw := N · 0.1 mm';
    expect(shown(sheet, 'N')).toBe('3.33333 rev');
    expect(shown(sheet, 'a')).toBe('1200 °');
    expect(shown(sheet, 'b')).toBe('20.944 rad');
    expect(shown(sheet, 'w')).toBe('0.333333 mm');
  });

  it('leaves cycles in Hz a plain count and the power M·ω as it was', () => {
    expect(shown('f := 50 Hz · 3 s', 'f')).toBe('150');
    expect(shown('M := 100 N·m\nω := 3000 rpm\nP := M·ω | kW', 'P')).toBe('31.4159 kW');
  });
});
