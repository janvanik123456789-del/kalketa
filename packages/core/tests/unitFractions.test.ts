import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

const shown = (source: string) => {
  const r = evaluateSheet(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const d = r.statements.at(-1)!.display!;
  return `${Number(d.value.toPrecision(6))} ${d.unit}`;
};

describe('units found missing by the samples of 25. 10.', () => {
  it('grads of geodesy: a right angle is 100 gon', () => {
    expect(shown('a := 90° | gon')).toBe('100 gon');
    expect(shown('σ := mod(atan2(-100 m, -100 m), 2·π) | gon')).toBe('250 gon');
  });

  it('a unit to a fractional power in brackets: Manning\'s s/m^(1/3), written and read back', () => {
    expect(shown('n := 0.017 s/m^(1/3)')).toBe('0.017 s/m^(1/3)');
    // m²·m^(2/3)/m³ is the same dimension as m^(-1/3): the exponents are added without floating point noise.
    expect(shown('S := 22 m^2\nR := 1.446 m\nQ := 56 m^3/s\nn := S·R^(2/3)·sqrt(0.0009)/Q | s/m^(1/3)')).toBe('0.0150707 s/m^(1/3)');
    expect(shown('x := 8 m^(2/3)·(1 m)^(1/3) | m')).toBe('8 m');
  });
});
