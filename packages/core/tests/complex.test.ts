import { describe, expect, it } from 'vitest';
import { evaluateSheet, toDecimalComma, type Quantity } from '../src/index.js';
import { codes } from './helpers.js';

/** Value and display of the last statement. */
function last(source: string) {
  const r = evaluateSheet(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const s = r.statements.at(-1)!;
  return { value: s.value as Quantity, display: s.display! };
}

describe('complex numbers', () => {
  it('are written with j or i right after a number', () => {
    expect(last('(3 + 4j) Ω').display).toMatchObject({ value: 3, im: 4, unit: 'Ω' });
    expect(last('2 + 1.5i').display).toMatchObject({ value: 2, im: 1.5, unit: '' });
    expect(last('4j').display).toMatchObject({ value: 0, im: 4 });
    expect(last('Z := 5j Ω\nZ =').display).toMatchObject({ value: 0, im: 5, unit: 'Ω' });
  });

  it('keep i and j free as names when not right after a number', () => {
    expect(last('i := 0.05\n1000·(1 + i)').display.value).toBeCloseTo(1050);
    expect(codes('j := 2\n3 j')).toContain('E-MISSING-OPERATOR');
  });

  it('compute a current through an impedance (Ohm)', () => {
    const I = last('Z := (3 + 4j) Ω\nU := 230 V\nI := U/Z\nI =');
    expect(I.display.unit).toBe('A');
    expect(I.display.value).toBeCloseTo(27.6, 10);
    expect(I.display.im).toBeCloseTo(-36.8, 10);
  });

  it('add impedances in series and in parallel', () => {
    const series = last('R := 10 Ω\nX_L := 2·π·50 Hz·0.1 H\nZ := R + 1j·X_L\nZ =');
    expect(series.display).toMatchObject({ value: 10, unit: 'Ω' });
    expect(series.display.im).toBeCloseTo(2 * Math.PI * 5, 10);
    const parallel = last('Z_1 := (4 + 3j) Ω\nZ_2 := (4 - 3j) Ω\nZ_1·Z_2/(Z_1 + Z_2) =');
    expect(parallel.display.value).toBeCloseTo(25 / 8, 12);
    expect(parallel.display.im ?? 0).toBeCloseTo(0, 12);
  });

  it('give magnitude, angle, parts and conjugate', () => {
    expect(last('abs((3 + 4j) Ω) =').display).toMatchObject({ value: 5, unit: 'Ω' });
    expect(last('arg(1 + 1j) | ° =').display.value).toBeCloseTo(45, 12);
    expect(last('re((3 + 4j) V) =').display).toMatchObject({ value: 3, unit: 'V' });
    expect(last('im((3 + 4j) V) =').display).toMatchObject({ value: 4, unit: 'V' });
    expect(last('conj(3 + 4j) =').display).toMatchObject({ value: 3, im: -4 });
  });

  it('are entered in polar form', () => {
    const u = last('U := polar(230 V, 30°)\nU =').display;
    expect(u.value).toBeCloseTo(230 * Math.cos(Math.PI / 6), 10);
    expect(u.im).toBeCloseTo(115, 10);
    expect(u.unit).toBe('V');
  });

  it('compute apparent power S = U·conj(I)', () => {
    const s = last('U := 230 V\nI := (10 - 5j) A\nS := U·conj(I) | VA\nS =').display;
    expect(s).toMatchObject({ value: 2300, im: 1150, unit: 'VA' });
  });

  it('take powers and roots', () => {
    const square = last('(1 + 1j)^2 =').display;
    expect(square.value).toBe(0);
    expect(square.im).toBeCloseTo(2, 12);
    const root = last('sqrt(3 + 4j) =').display;
    expect(root.value).toBeCloseTo(2, 12);
    expect(root.im).toBeCloseTo(1, 12);
    expect(codes('sqrt(-4)')).toEqual(['E-DOMAIN']);
  });

  it('compare only for equality', () => {
    expect(last('(3 + 4j) == (3 + 4j)').value).toMatchObject({ value: true });
    expect(codes('(3 + 4j) < 5')).toEqual(['E-COMPLEX-ORDER']);
    expect(codes('check abs(3 + 4j) ≤ 5')).toEqual([]);
  });

  it('are refused where only real numbers make sense', () => {
    expect(codes('sin(1j)')).toEqual(['E-COMPLEX-ARG']);
    expect(codes('check (3 + 4j) ≤ 5')).toEqual(['E-COMPLEX-ORDER']);
    expect(codes('2^(1j)')).toEqual(['E-COMPLEX-ARG']);
    expect(codes('5j °C')).toEqual(['E-COMPLEX-ARG']);
  });

  it('keep the decimal comma in the Czech notation', () => {
    expect(toDecimalComma('Z := (3.5 + 4.2j) Ω')).toBe('Z := (3,5 + 4,2j) Ω');
  });
});

describe('a unit after parentheses', () => {
  it('multiplies the group', () => {
    expect(last('(2 + 3) m =').display).toMatchObject({ value: 5, unit: 'm' });
    // A name defined above is still a name, not a unit.
    expect(codes('m := 2\n(1 + 2) m')).toContain('E-MISSING-OPERATOR');
  });
});
