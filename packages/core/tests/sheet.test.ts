import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

describe('temperature', () => {
  it('stores °C as an absolute temperature and shows it back in °C', () => {
    expectValue('T := 20 °C\nT', 20, '°C');
    expectValue('20 °C | K', 293.15, 'K');
    expectValue('68 °F | °C', 20, '°C');
  });

  it('gives a difference when subtracting absolute temperatures', () => {
    expectValue('T_1 := 20 °C\nT_2 := 80 °C\nΔT := T_2 - T_1\nΔT', 60, 'Δ°C');
    expectValue('T_1 := 20 °C\nT_2 := 80 °C\nT_2 - T_1 | K', 60, 'K');
  });

  it('adds a difference to an absolute temperature', () => {
    expectValue('T := 20 °C\nT + 5 Δ°C', 25, '°C');
    expectValue('T := 20 °C\nT + 5 K', 25, '°C');
  });

  it('rejects adding two absolute temperatures', () => {
    expect(codes('20 °C + 30 °C')).toEqual(['E-ABS-TEMP']);
  });

  it('treats °C inside a compound unit as a difference', () => {
    expectValue('c := 4180 J/(kg·°C)\nc | J/(kg·K)', 4180, 'J/(kg·K)');
  });

  it('warns when an absolute temperature is multiplied', () => {
    expect(codes('2 · 20 °C')).toEqual(['W-ABS-TEMP-MUL']);
  });
});

describe('names and errors', () => {
  it('requires definition before use', () => {
    expect(codes('a := b\nb := 1')).toEqual(['E-DEFINED-LATER']);
    expect(codes('a := b')).toEqual(['E-UNDEFINED']);
  });

  it('forbids redefinition', () => {
    expect(codes('a := 1\na := 2')).toEqual(['E-REDEFINED']);
  });

  it('forbids redefining constants', () => {
    expect(codes('pi := 3')).toEqual(['E-RESERVED']);
  });

  it('reports a failed dependency only once, at its cause', () => {
    const result = evaluateSheet('a := 1 m + 1 s\nb := a · 2\nc := b + 1 m');
    expect(result.statements.map((s) => s.status)).toEqual(['error', 'blocked', 'blocked']);
    expect(result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual(['E-UNIT-MISMATCH']);
  });

  it('keeps evaluating independent statements after an error', () => {
    const result = evaluateSheet('a := 1 m + 1 s\nx := 2 m\ny := x · 3');
    expect(result.values.get('y')).toMatchObject({ si: 6 });
  });

  it('marks names from broken lines as failed, not undefined', () => {
    const result = evaluateSheet('a := (1 +\n)\nb := a');
    expect(result.statements[1]!.status).toBe('blocked');
  });

  it('reports division by zero and domain errors', () => {
    expect(codes('1 m / 0')).toEqual(['E-DIV-ZERO']);
    expect(codes('sqrt(-4)')).toEqual(['E-DOMAIN']);
    expect(codes('ln(0)')).toEqual(['E-DOMAIN']);
    expect(codes('sin(2 m)')).toEqual(['E-FUNC-ARG-DIM']);
    expect(codes('foo(1)')).toEqual(['E-FUNC-UNKNOWN']);
    expect(codes('sqrt(1, 2)')).toEqual(['E-FUNC-ARITY']);
  });

  it('reports type errors', () => {
    expect(codes('1 + true')).toEqual(['E-TYPE']);
    expect(codes('if(1, 2, 3)')).toEqual(['E-TYPE']);
  });

  it('gives a location for every diagnostic', () => {
    const d = evaluateSheet('x := 1\ny := x + 2 s').diagnostics[0]!;
    expect(d.span).toMatchObject({ line: 2, column: 6 });
  });
});

describe('functions', () => {
  it('computes sqrt with units', () => {
    expectValue('sqrt(16 m²)', 4, 'm');
  });

  it('computes min, max, abs, atan2', () => {
    expectValue('max(1 m, 120 cm, 90 cm)', 120, 'cm');
    expectValue('abs(-3 kN)', 3, 'kN');
    expectValue('atan2(1 m, 1 m) | °', 45, '°');
  });

  it('evaluates only the chosen branch of if()', () => {
    expectValue('x := 0\nif(x == 0, 1, 1/x)', 1, '');
  });

  it('compares with a relative tolerance', () => {
    expect(evaluateSheet('0.1 + 0.2 == 0.3').statements[0]!.value).toEqual({ type: 'boolean', value: true });
    expect(evaluateSheet('1 m < 100 cm').statements[0]!.value).toEqual({ type: 'boolean', value: false });
  });
});

describe('incremental recalculation', () => {
  it('re-evaluates only statements affected by a change', () => {
    const session = new SheetSession();
    const v1 = 'a := 10 m\nb := 2 s\nv := a / b\nw := b · 3';
    expect(session.update(v1).stats).toEqual({ evaluated: 4, reused: 0 });

    const v2 = 'a := 20 m\nb := 2 s\nv := a / b\nw := b · 3';
    const result = session.update(v2);
    expect(result.stats).toEqual({ evaluated: 2, reused: 2 });
    expect(result.values.get('v')).toMatchObject({ si: 10 });
  });

  it('recalculates a line that is asked to go on with its rounded value, and the lines below', () => {
    const session = new SheetSession();
    expect(session.update('a := 2.345 {decimals=1}\nb := a + 1').values.get('b')).toMatchObject({ si: 3.345 });
    const rounded = session.update('a := 2.345 {decimals=1 rounded}\nb := a + 1').values.get('b');
    expect(rounded?.type === 'quantity' && rounded.si).toBeCloseTo(3.3, 12);
  });

  it('notices when a missing name gets defined', () => {
    const session = new SheetSession();
    expect(session.update('y := x · 2').diagnostics.map((d) => d.code)).toEqual(['E-UNDEFINED']);
    const result = session.update('x := 3\ny := x · 2');
    expect(result.diagnostics).toEqual([]);
    expect(result.values.get('y')).toMatchObject({ si: 6 });
  });
});

describe('heat balance (from docs/01-philosophy)', () => {
  const sheet = [
    '## Given',
    'ṁ := 2.4 kg/s',
    'T_1 := 20 °C',
    'T_2 := 80 °C',
    'c_p := 4180 J/(kg·K)',
    '## Calculate',
    'ΔT := T_2 - T_1',
    'Q := ṁ · c_p · ΔT | kW',
  ].join('\n');

  it('gives Q = 601.92 kW with no diagnostics', () => {
    const result = evaluateSheet(sheet);
    expect(result.diagnostics).toEqual([]);
    const q = result.statements[result.statements.length - 1]!.display!;
    expect(q.unit).toBe('kW');
    expect(q.value).toBeCloseTo(601.92, 9);
  });

  it('accepts the ASCII spelling', () => {
    const ascii = sheet.replace('ṁ', 'm_dot').replaceAll('ṁ', 'm_dot').replace('ΔT := ', 'Delta_T := ').replace('c_p · ΔT', 'c_p * Delta_T').replace('·', '*');
    const result = evaluateSheet(ascii);
    expect(result.diagnostics).toEqual([]);
    expect(result.values.get('Q')).toMatchObject({ si: 601920 });
  });
});
