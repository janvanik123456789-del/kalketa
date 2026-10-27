import { describe, expect, it } from 'vitest';
import { baseUnitSymbol, defaultRegistry, evaluateSheet, dim, dimKey, multiplyDims, powerDim, sameDim } from '../src/index.js';
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

  it('keeps the unit through whole powers', () => {
    expectValue('(20 mm)²', 400, 'mm²');
    expectValue('d := 20 mm\nπ·d²/4', Math.PI * 100, 'mm²');
    expectValue('A_kruh(d) := π·d²/4\nA_kruh(20 mm)', Math.PI * 100, 'mm²');
    expectValue('(2 kN/m)^2', 4, '(kN/m)²');
    expectValue('L := 5 m\nL^-1', 0.2, 'm⁻¹');
    expectValue('L := 5 m\nL^0.5', Math.sqrt(5), 'm^(1/2)');
  });

  it('keeps the unit when multiplying powers of it: a rod given in mm has its volume in mm³', () => {
    expectValue('d := 20 mm\nL := 500 mm\nV := π·d²/4·L\nV =', Math.PI * 100 * 500, 'mm³');
    expectValue('a := 3 cm\nb := 4 cm\na·b', 12, 'cm²');
    expectValue('V := 60 cm³\nA := 20 cm²\nV/A', 3, 'cm');
    expectValue('x := 5 mm\nx/x', 1, '');
    // Different units: SI (or a target unit chosen with "|").
    expectValue('d := 20 mm\nL := 0.5 m\nπ·d²/4·L', Math.PI * 100e-6 * 0.5, 'm³');
    expectValue('d := 20 mm\nL := 0.5 m\nπ·d²/4·L | cm³', Math.PI * 100e-6 * 0.5 * 1e6, 'cm³');
  });

  it('keeps the scale of the calculation: no N/MPa, no metres from millimetres, MPa from N·mm', () => {
    // A rivet in N and MPa (a test of 2026-10-05): the area in mm², the diameter in mm.
    expectValue('F := 1600 N\nτ := 68 MPa\nS := F/τ\nS =', 23.5294, 'mm²', 3);
    expectValue('F := 1600 N\nτ := 68 MPa\nS := F/τ\nd := √(4·S/π)\nd =', 5.4734, 'mm', 3);
    expectValue('a := 20 mm\nb := 30 mm\nsqrt(a² + b²)', 36.0555, 'mm', 3);
    expectValue('S := 314 mm²\n(4·S/π)^0.5', 19.9949, 'mm', 3);
    expectValue('V := 27 cm³\ncbrt(V)', 3, 'cm');
    // Stress from N·mm and mm³ or from N and mm², also below 1; a load in kN on m² in kPa.
    expectValue('M := 62500 N·mm\nW := 400 mm³\nM/W', 156.25, 'MPa');
    expectValue('F := 800 N\nA := 1000 mm²\nF/A', 0.8, 'MPa');
    expectValue('F := 10 kN\nA := 2 m²\nF/A', 5, 'kPa');
    expectValue('P := 5 kN\nv := 2 m/s\nP·v', 10, 'kW');
    // Units of one kind mixed (m and cm): the prefix that shows the value from 1 up.
    expectValue('M := 37.5 kN·m\nW := 194.3 cm³\nM/W', 193.0, 'MPa', 1);
    // A moment stays kN·m, never kJ.
    expectValue('q := 12 kN/m\nL := 5 m\nq·L²/8', 37.5, 'kN·m');
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

describe('units of products compose', () => {
  it('a moment from kN/m and m is in kN·m, not in joules', () => {
    expectValue('q := 12 kN/m\nL := 5 m\nM := q·L²/8\nM =', 37.5, 'kN·m');
    expectValue('F := 10 kN\na := 2 m\nF·a', 20, 'kN·m');
    expectValue('M := 30 kN·m\nL := 5 m\nM/L', 6, 'kN');
    expectValue('q := 12 kN/m\nL := 5 m\nq·L', 60, 'kN');
  });

  it('units with a name of their own stay so, units of one dimension go to SI', () => {
    expectValue('2 kg · 3 m/s²', 6, 'N');
    expectValue('σ := 200 MPa\nA := 100 mm²\nσ·A', 20000, 'N');
    expectValue('d := 20 mm\nL := 0.5 m\nd·L', 0.01, 'm²');
    // Energy that is energy: a target unit says so.
    expectValue('P := 2 kW\nt := 3 h\nP·t | kWh', 6, 'kWh');
  });
});

describe('units of products as engineers write them', () => {
  it('put a length or a time last, whatever the order of the factors', () => {
    const shown = (source: string, name: string) => {
      const d = evaluateSheet(source).statements.find((r) => r.statement.kind === 'definition' && r.statement.name === name)?.display;
      return d ? `${d.value} ${d.unit}` : '';
    };
    const sheet = 'L := 2 m\nF := 3 kN\nt := 2 s\nP := 2 kW\nM := L·F\nI := t·F\nW := t·P\nq := F/L';
    expect(shown(sheet, 'M')).toBe('6 kN·m');
    expect(shown(sheet, 'I')).toBe('6 kN·s');
    expect(shown(sheet, 'W')).toBe('4 kW·s');
    expect(shown(sheet, 'q')).toBe('1.5 kN/m');
  });
});

describe('names and checks as on paper', () => {
  it('take ∞ in a name after its first letter (λ_∞, T_∞)', () => {
    const r = evaluateSheet('λ_∞ := 0.019\nT_∞ := 20 °C\nδ := λ_∞·2');
    expect(r.diagnostics).toEqual([]);
    expect((r.values.get('δ') as { si: number }).si).toBeCloseTo(0.038, 12);
  });

  it('show both sides of a check in one unit: a ratio against 2 % in %', () => {
    const r = evaluateSheet('a := 0.23\nb := 0.231\ncheck "Shoda": abs(a - b)/b ≤ 2 %');
    const check = r.statements.at(-1)!.check!;
    expect(check.left?.hint?.symbol).toBe('%');
    expect(check.passed).toBe(true);
  });
});

describe('angular velocity and energy as engineers write them', () => {
  const shown = (source: string, name: string) => {
    const d = evaluateSheet(source).statements.find((r) => r.statement.kind === 'definition' && r.statement.name === name)?.display;
    return d ? `${Number(d.value.toPrecision(4))} ${d.unit}` : '';
  };
  const sheet = 'f := 60 Hz\nn := 1500 min^-1\nT := 0.2 s\nr := 2 m\nJ := 2 kg·m^2\nω := 2·π·f\nω_n := 2·π·n\nω_T := 2·π/T\nv := ω_n·r\nE := J·ω_n^2/2\nF := 2 kN\nM := F·r\nP := 2 kW\nt := 3 h\nW := P·t';

  it('show 2·π·f, 2·π·n and 2·π/T in rad/s, not in Hz or min⁻¹', () => {
    expect(shown(sheet, 'ω')).toBe('377 rad/s');
    expect(shown(sheet, 'ω_n')).toBe('157.1 rad/s');
    expect(shown(sheet, 'ω_T')).toBe('31.42 rad/s');
  });

  it('leave the radian out beside other units, and name an energy of mass, length and time in J', () => {
    expect(shown(sheet, 'v')).toBe('314.2 m/s');
    expect(shown(sheet, 'E')).toBe('24670 J');
    // A moment stays a moment, a work of a power stays in kW·h.
    expect(shown(sheet, 'M')).toBe('4 kN·m');
    expect(shown(sheet, 'W')).toBe('6 kW·h');
  });

  it('keep a share divided by a plain number a share (a quarterly rate i/4), a count times a share a count', () => {
    expect(shown('i := 6.957 %\nj := i/4', 'j')).toBe('1.739 %');
    expect(shown('k := 200·21 %', 'k')).toBe('42 ');
  });
});

describe('US customary units of American handbooks', () => {
  it('convert °R, lbm, psi, Btu, hp and the like to SI (DOE Fundamentals Handbook, Thermodynamics)', () => {
    const nl = String.fromCharCode(10);
    const sheet = ['t := 80 °C', 'T_R := t | °R', 'p := 80 psi - 14.7 psi', 'ρ := 64 lbm/ft^3', 'H := p/(ρ·9.80665 m/s^2) | ft', 'Q := 1 Btu | J', 'P := 1 hp | W', 'V := 1 gal | l', 'σ := 1 ksi | MPa', 'ψ_1 := 2', 'psi_2 := 3'].join(nl);
    const r = evaluateSheet(sheet);
    expect(r.diagnostics).toEqual([]);
    const v = (name: string) => (r.values.get(name) as { si: number }).si;
    expect(v('T_R')).toBeCloseTo(353.15, 9);
    expect(v('H')).toBeCloseTo(146.925 * 0.3048, 2);
    expect(v('Q')).toBeCloseTo(1055.05585262, 6);
    expect(v('P')).toBeCloseTo(745.69987, 4);
    expect(v('V')).toBeCloseTo(3.785411784e-3, 12);
    expect(v('σ')).toBeCloseTo(6.894757e6, 0);
    // "in" after a value is the inch, unless the interval of a solve follows.
    const inch = evaluateSheet(['a := 2 in', 'b := (1 + 2) in', 'c := [1, 2] in', 'solve x: x^2 == 8 in 0 .. 10'].join(nl));
    expect(inch.diagnostics).toEqual([]);
    expect((inch.values.get('b') as { si: number }).si).toBeCloseTo(3 * 0.0254, 12);
    expect((inch.values.get('x') as { si: number }).si).toBeCloseTo(Math.sqrt(8), 9);
    // psi with an index is still ψ: psi_2 is ψ_2.
    expect(r.values.has('ψ_2')).toBe(true);
  });
});


describe('units of chemistry and of American handbooks', () => {
  it('have the molar unit M of concentrations with its prefixes, a sheet name M kept', () => {
    expectValue('0.1 mM | μM', 100, 'μM');
    expectValue('2 mol/dm^3 | M', 2, 'M');
    expectValue('M := 10 kN·m\n2·M', 20, 'kN·m');
  });

  it('of American handbooks include the hour written hr', () => {
    expectValue('0.8 Btu/(hr·ft·°F) | W/(m·K)', (0.8 * 1055.05585262) / 3600 / 0.3048 / (5 / 9), 'W/(m·K)');
  });

  it('of an amount in cm³ or dm³ show in mol/l, in m³ as written', () => {
    expectValue('n := 0.5 mol\nn/(250 cm^3)', 2, 'mol/l');
    expectValue('ρ := 1.2 g/cm^3\nM_r := 36.461 g/mol\n0.36·ρ/M_r', (0.36 * 1.2) / 36.461 * 1000, 'mol/l');
    expectValue('n := 0.5 mmol\nn/(2 l)', 0.25, 'mmol/l');
    expectValue('n := 2 mol\nn/(4 m^3)', 0.5, 'mol/m³');
  });

  it('take a unit in brackets after a number or a value as theirs, its power the unit\'s only (C4 of the samples)', () => {
    // K_s of AgCl: 1.8e-10 (mol/l)², not (1.8e-10 mol/l)².
    expectValue('K_s := 1.8e-10 (mol/l)^2\nsqrt(K_s) | mol/l', Math.sqrt(1.8e-10), 'mol/l');
    expect(codes('K_s := 1.8e-10 (mol/l)^2')).toEqual([]);
    expectValue('pK := 12.58\nK := 10^(-pK) (mol/l)^3\ncbrt(K/4) | mol/l', Math.cbrt(10 ** -12.58 / 4), 'mol/l');
    // Names in the brackets keep the product: 2(a + b), 2(L).
    expectValue('a := 1 m\nb := 2 m\n2(a + b)', 6, 'm');
    expectValue('L := 3 m\n2(L)', 6, 'm');
  });
});

describe('temperatures and their differences as books write them', () => {
  it('take a reciprocal unit after a number: 12e-6 1/°C, 50 1/s, 3 1/(m·s)', () => {
    expectValue('12e-6 1/K', 12e-6, '1/K');
    expectValue('50 1/s', 50, '1/s');
    expectValue('3 1/(m·s)', 3, '1/(m·s)');
    expect(codes('n := 5\nn 1')).toEqual(['E-MISSING-OPERATOR']);
  });

  it('read ΔT := 50 °C as a difference, so α·ΔT is no product of an absolute temperature', () => {
    expectValue('ΔT := 50 °C\nΔT', 50, 'Δ°C');
    expectValue('ΔT := -5 °F\nΔT | K', -25 / 9, 'K');
    expectValue('α := 10e-6 1/°C\nΔT := 50 °C\nα·ΔT', 5e-4, '');
    expect(codes('α := 10e-6 1/°C\nΔT := 50 °C\nα·ΔT')).toEqual([]);
    // Any other name keeps the absolute temperature.
    expectValue('T := 50 °C\nT', 50, '°C');
  });
});
