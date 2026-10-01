import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@calccanvas/core';
import { catalogFor } from '@calccanvas/i18n';
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
    // N·m is shown as J for now (a separate task); the value is what matters here.
    expect(plain(toText(result!.rhs))).toContain('150');
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
