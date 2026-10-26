import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { blockLatex, buildPrintDocument, renderBlockHtml, toMathML, toText, type PrintBlock } from '../src/index.js';

const cs = catalogFor('cs');
const plain = (text: string) => text.replace(/\s+/g, ' ');
const blocks = (source: string): readonly PrintBlock[] => buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks;
const equation = (source: string) => {
  const block = blocks(source).at(-1)!;
  return block.kind === 'equation' ? block : undefined;
};

describe('formulas as on paper', () => {
  it('set a value by a condition under one brace, with the words of the language', () => {
    const block = equation('λ := 0.15\nk := if(λ ≤ 0.2, 1.0, if(λ ≤ 0.5, 0.9, 0.8))')!;
    expect(plain(toText(block.lines[0]!.rhs))).toBe('{ 1 pro λ≤0,2; 0,9 pro λ≤0,5; 0,8 jinak }');
    expect(toMathML(block.lines[0]!.rhs)).toContain('<mo stretchy="true">{</mo><mtable class="cases">');
  });

  it('round down and up with their brackets', () => {
    const block = equation('x := 2.7\nn := floor(x) + ceil(x)')!;
    expect(plain(toText(block.lines[0]!.rhs))).toBe('⌊x⌋+⌈x⌉');
  });

  it('set a dot, two dots or a hat over the letter of a name', () => {
    const block = equation('ẋ_0 := 2 m/s\nv := ẋ_0')!;
    expect(toMathML(block.lines[0]!.rhs)).toContain('<msub><mover accent="true"><mi>x</mi><mo stretchy="false">˙</mo></mover><mn>0</mn></msub>');
  });

  it('frame the result of a line marked {box}, and only that', () => {
    const marked = equation('a := 2\nb := 3\nc := a·b {box}')!;
    expect(toText(marked.lines.at(-1)!.rhs)).toBe('[6]');
    expect(marked.lines.slice(0, -1).every((l) => !toText(l.rhs).startsWith('['))).toBe(true);
    expect(renderBlockHtml(marked, cs)).toContain('<mrow class="boxed">');
    expect(toText(equation('a := 2\nc := a·3')!.lines.at(-1)!.rhs)).toBe('6');
  });
});

describe('formulas as LaTeX', () => {
  const tex = (source: string) => blockLatex(blocks(source).at(-1)!)!;

  it('give the whole line, as KaTeX reads it again', () => {
    const line = tex('q := 12 kN/m\nL := 5 m\nM := q·L^2/8');
    expect(line).toBe('M = \\frac{q \\cdot {L}^{2}}{8} = \\frac{12 \\, \\mathrm{kN/m} \\cdot {\\left(5 \\, \\mathrm{m}\\right)}^{2}}{8} = 37{,}5 \\, \\mathrm{kN\\cdot m}');
    expect(() => katex.renderToString(line, { throwOnError: true })).not.toThrow();
  });

  it('keep Greek letters, indices, roots, braces and frames', () => {
    const samples = [
      tex('M_k := 100 N·m\nτ_dov := 50 MPa\nd := cbrt(16·M_k/(π·τ_dov)) {box}'),
      tex('λ := 0.15\nk := if(λ ≤ 0.2, 1.0, 0.8)'),
      tex('ẋ := 2 m/s\nv := abs(ẋ)'),
    ];
    for (const line of samples) expect(() => katex.renderToString(line, { throwOnError: true })).not.toThrow();
    expect(samples[0]).toContain('\\boxed{');
    expect(samples[0]).toContain('\\sqrt[3]{');
    expect(samples[0]).toContain('{\\tau }_{\\mathrm{dov}}');
    expect(samples[1]).toContain('\\begin{cases}');
    expect(samples[1]).toContain('\\text{pro}');
    expect(samples[2]).toContain('\\dot{x}');
  });

  it('set the steps with names of their own (a solved equation) one under another', () => {
    const line = tex(['m_1 := 9 kg', 'm_2 := 1 kg', 'k_1 := 38 N/m', 'k_2 := 2 N/m', 'k_3 := 3 N/m', 'solve Ω ∈ ℝ, Ω > 0 s^-2: (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0 {exact}'].join('\n'));
    expect(line.startsWith('\\begin{aligned}')).toBe(true);
    expect(line).toContain('\\\\ {\\Omega }_{1} &= \\frac{49}{9}');
    expect(line).toContain('\\Omega \\in \\mathbb{R}');
    expect(line).not.toMatch(/[−∈ℝ]/);
    expect(() => katex.renderToString(line, { throwOnError: true })).not.toThrow();
  });
});
