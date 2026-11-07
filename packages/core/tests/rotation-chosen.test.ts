/** Hz that a quotient only chose to show itself in is no unit written: no 2π comes of it (found by the formula library). */
import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

const si = (source: string, name: string) => {
  const v = evaluateSheet(source).values.get(name);
  return v?.type === 'quantity' ? v.si : NaN;
};

describe('a frequency only by the look of it', () => {
  it('ω of Ω/H is the reactance over the inductance', () => {
    expect(si('X_L := 31.42 Ω\nL := 100 mH\nω := X_L/L | rad/s', 'ω')).toBeCloseTo(314.2, 6);
    expect(si('X_L := 31.42 Ω\nL := 1 H\nω := X_L/L', 'ω')).toBeCloseTo(31.42, 6);
  });

  it('ω := v/r with r in millimetres', () => {
    expect(si('v := 10 m/s\nr := 2 mm\nω := v/r', 'ω')).toBeCloseTo(5000, 6);
  });

  it('a unit written still counts', () => {
    expect(si('n := 3000 rpm\nω := n | rad/s', 'ω')).toBeCloseTo(100 * Math.PI, 6);
    expect(si('f := 50 Hz\nω := 2·π·f', 'ω')).toBeCloseTo(100 * Math.PI, 6);
    expect(si('f := 2 kHz\ng := 3·f\nω := g | rad/s', 'ω')).toBeCloseTo(12000 * Math.PI, 6);
  });
});
