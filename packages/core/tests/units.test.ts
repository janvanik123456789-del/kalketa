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

  it('knows all SI prefixes, quecto to quetta', () => {
    const prefixes: [string, number][] = [
      ['Q', 1e30], ['R', 1e27], ['Y', 1e24], ['Z', 1e21], ['E', 1e18], ['P', 1e15], ['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['h', 1e2], ['da', 1e1],
      ['d', 1e-1], ['c', 1e-2], ['m', 1e-3], ['μ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15], ['a', 1e-18], ['z', 1e-21], ['y', 1e-24], ['r', 1e-27], ['q', 1e-30],
    ];
    for (const [prefix, factor] of prefixes) {
      expect(defaultRegistry.resolve(`${prefix}Pa`)?.factor, prefix).toBeCloseTo(factor, 40);
      expect(defaultRegistry.resolve(`${prefix}Pa`)!.factor / factor, prefix).toBeCloseTo(1, 12);
    }
  });

  it('accepts keyboard spellings and shows the proper symbols', () => {
    expect(defaultRegistry.resolve('uF')).toMatchObject({ symbol: 'μF', factor: 1e-6 });
    expect(defaultRegistry.resolve('µm')).toMatchObject({ symbol: 'μm', factor: 1e-6 }); // micro sign U+00B5
    expect(defaultRegistry.resolve('ohm')).toMatchObject({ symbol: 'Ω', factor: 1 });
    expect(defaultRegistry.resolve('kohm')).toMatchObject({ symbol: 'kΩ', factor: 1e3 });
    expectValue('C := 4.7 uF\nC =', 4.7, 'μF');
    expectValue('R := 2.2 kohm\nR =', 2.2, 'kΩ');
    expectValue('I := 5 mA\nU := 3.3 V\nU/I | kohm', 0.66, 'kΩ');
    expectValue('x := 250 um/s\nx =', 250, 'μm/s');
  });
});

describe('prefixed units across fields', () => {
  it('mechanics and pressure', () => {
    expectValue('250 kPa | MPa', 0.25, 'MPa');
    expectValue('210 GPa | MPa', 210000, 'MPa');
    expectValue('1013 hPa | bar', 1.013, 'bar');
    expectValue('760 mmHg | kPa', 101.325, 'kPa', 3);
    expectValue('12 kN·m | N·mm', 12e6, 'N·mm');
  });

  it('electrical', () => {
    expectValue('1 μF · 1 kΩ | ms', 1, 'ms');
    expectValue('10 mH / 2 Ω | ms', 5, 'ms');
    expectValue('400 V · 25 A | kVA', 10, 'kVA');
    expectValue('5 kvar | var', 5000, 'var');
    expectValue('2 nF + 470 pF | nF', 2.47, 'nF');
    expectValue('3 MW · 2 h | MWh', 6, 'MWh');
  });

  it('chemistry, light and radiation', () => {
    expectValue('0.5 mmol / 250 mL | mol/L', 0.002, 'mol/L');
    expectValue('2 μkat | nkat', 2000, 'nkat');
    expectValue('3 klx | lx', 3000, 'lx');
    expectValue('20 mSv | Sv', 0.02, 'Sv');
    expectValue('4 kBq | Bq', 4000, 'Bq');
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
