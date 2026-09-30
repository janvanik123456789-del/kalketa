import { describe, expect, it } from 'vitest';
import { baseUnitSymbol, defaultRegistry, dim, dimKey, multiplyDims, powerDim, sameDim } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

describe('dimensions', () => {
  it('multiplies and compares sparse dimensions', () => {
    const velocity = multiplyDims(dim({ L: 1 }), dim({ T: -1 }));
    expect(sameDim(velocity, dim({ T: -1, L: 1 }))).toBe(true);
    expect(sameDim(multiplyDims(velocity, dim({ T: 1 })), dim({ L: 1 }))).toBe(true);
    expect(dimKey(powerDim(velocity, 2))).toBe('L²·T⁻²');
  });

  it('keeps custom base dimensions separate', () => {
    expect(sameDim(dim({ currency: 1 }), dim({ bit: 1 }))).toBe(false);
  });

  it('formats base unit products', () => {
    expect(baseUnitSymbol(dim({ M: 1, L: 2, T: -3 }))).toBe('kg·m²/s³');
    expect(baseUnitSymbol(dim({ T: -1, Θ: -1 }))).toBe('1/(s·K)');
  });
});

describe('unit registry', () => {
  it('is case-sensitive: mm is not Mm', () => {
    expect(defaultRegistry.resolve('mm')!.factor).toBeCloseTo(1e-3);
    expect(defaultRegistry.resolve('Mm')!.factor).toBeCloseTo(1e6);
  });

  it('prefers exact symbols over prefixes', () => {
    expect(defaultRegistry.resolve('min')!.factor).toBe(60);
    expect(defaultRegistry.resolve('cd')!.dim).toEqual(dim({ J: 1 }));
    expect(defaultRegistry.resolve('Pa')!.factor).toBe(1);
  });

  it('applies prefixes only to prefixable units', () => {
    expect(defaultRegistry.resolve('kg')!.factor).toBeCloseTo(1);
    expect(defaultRegistry.resolve('daN')!.factor).toBeCloseTo(10);
    expect(defaultRegistry.resolve('kmin')).toBeUndefined();
  });
});

describe('quantities', () => {
  it('converts between units', () => {
    expectValue('1.23 m + 35 cm + 12 mm | cm', 159.2, 'cm');
    expectValue('10 m/s | km/h', 36, 'km/h');
    expectValue('1 kWh | MJ', 3.6, 'MJ');
    expectValue('1 bar | kPa', 100, 'kPa');
  });

  it('keeps the unit of the first operand when adding (Calcpad rule)', () => {
    expectValue('1.23 m + 35 cm', 1.58, 'm');
  });

  it('computes derived units', () => {
    expectValue('6 m / 2 s', 3, 'm/s');
  });

  it('keeps the unit when scaling by a plain number', () => {
    expectValue('g := 3.5 kN/m\n1.35·g', 4.725, 'kN/m');
    expectValue('g := 3.5 kN/m\ng/2', 1.75, 'kN/m');
    expectValue('g := 3.5 kN/m\n2·g + 1 kN/m', 8, 'kN/m');
    expectValue('L := 250 cm\n2/L', 0.8, '1/m');
  });

  it('shows preferred SI units for computed results', () => {
    expectValue('2 kg · 3 m/s²', 6, 'N');
    expectValue('10 N · 2 m / 4 s', 5, 'W');
    expectValue('2 A · 3 Ω', 6, 'V');
  });

  it('reports incompatible units', () => {
    expect(codes('6 m + 2 s')).toEqual(['E-UNIT-MISMATCH']);
    expect(codes('5 m | kg')).toEqual(['E-TARGET-UNIT']);
    expect(codes('2^(3 m)')).toEqual(['E-POWER-DIM']);
  });

  it('treats percent and angles as dimensionless', () => {
    expectValue('200 · 21 %', 42, '');
    expectValue('sin(30°)', 0.5, '');
    expectValue('90° | rad', Math.PI / 2, 'rad');
    expectValue('50 % + 0.25', 75, '%');
  });
});
