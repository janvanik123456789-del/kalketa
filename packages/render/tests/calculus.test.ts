import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, toMathML, toText } from '../src/index.js';

const cs = catalogFor('cs');
const lines = (source: string) => {
  const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
  const block = doc.blocks.at(-1)!;
  return block.kind === 'equation' ? block.lines : [];
};
const plain = (text: string) => text.replace(/\s+/g, ' ');

describe('calculus in print', () => {
  it('prints an integral with its limits and puts values in, the variable stays', () => {
    const [formula, substitution, result] = lines('q := 12 kN/m\nL := 5 m\nF := integral(q·x, x: 0 m .. L)');
    expect(plain(toText(formula!.rhs))).toBe('∫[0 m..L]q·x dx');
    expect(plain(toText(substitution!.rhs))).toBe('∫[0 m..5 m]12 kN/m·x dx');
    // A sum in the integrand gets parentheses.
    expect(plain(toText(lines('a := 2\nintegral(x + a, x: 0 .. 1)')[0]!.rhs))).toBe('∫[0..1](x+a) dx');
    // kN/m · m · m: a moment in kN·m (once shown in joules).
    expect(plain(toText(result!.rhs))).toBe('150 kN·m');
    expect(toMathML(formula!.rhs)).toContain('<msubsup><mo>∫</mo>');
  });

  it('prints a derivative at its point and a sum with its index', () => {
    const [derivative] = lines('w(x) := x³\nderivative(w(x), x: 2)');
    expect(toText(derivative!.rhs)).toBe('d/(dx)w(x)|_x=2');
    const [second] = lines('derivative(x³, x: 2, order: 2)');
    expect(toText(second!.rhs)).toContain('d^2');
    const [sum] = lines('n := 10\nsum(1/k², k: 1 .. n)');
    expect(toMathML(sum!.rhs)).toContain('<munderover><mo>∑</mo>');
  });
});

describe('matrices in print', () => {
  it('prints a matrix as a table in brackets, one unit after it when all items share it', () => {
    const [given] = lines('K := [4, -2 | -2, 4] kN/m');
    expect(toMathML(given!.rhs)).toContain('<mtable>');
    const result = lines('K := [4, -2 | -2, 4] kN/m\nK =').at(-1)!;
    expect(toText(result.rhs).replace(/\s+/g, ' ')).toBe('[4, −2 | −2, 4] kN/m');
    const mixed = lines('K := [12 kN/m, 6 kN | 6 kN, 4 kN·m]\nK =').at(-1)!;
    expect(toText(mixed.rhs).replace(/\s+/g, ' ')).toContain('12 kN/m, 6 kN | 6 kN, 4 kN·m');
  });

  it('prints a series of different units item by item', () => {
    const x = lines('K := [12 kN/m, 6 kN | 6 kN, 4 kN·m]\nF := [1 kN | 0 kN·m]\nlsolve(K, F)').at(-1)!;
    const text = toText(x.rhs).replace(/\s+/g, ' ');
    expect(text).toContain('m;');
    expect(text.endsWith(']')).toBe(true);
  });
});

describe('roots in print', () => {
  it('print a cube root and an n-th root with their index', () => {
    const [cube] = lines('a := ∛(27 m³)');
    expect(plain(toText(cube!.rhs))).toBe('∛(27 m³)');
    expect(toMathML(cube!.rhs)).toContain('<mroot>');
    expect(toText(lines('b := root(16, 4)')[0]!.rhs)).toBe('root(16, 4)');
  });
});
