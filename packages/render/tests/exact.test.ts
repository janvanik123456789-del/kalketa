import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, toText } from '../src/index.js';

const cs = catalogFor('cs');
const plain = (text: string) => text.replace(/\s+/g, ' ');
const results = (source: string) =>
  buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' }).blocks.map((b) =>
    b.kind === 'equation' ? plain(toText(b.lines.at(-1)!.rhs)) : '',
  );

describe('exact results in print', () => {
  it('are shown only where asked: {exact} on the line, or @exact on to @noexact', () => {
    expect(results('x := 49/9 {exact}\ny := 49/9')).toEqual(['49/9≐5,444', '5,444']);
    expect(results('@exact\na := sqrt(12 m^2)\nb := sqrt(1/2)\n@noexact\nc := 1/3')).toEqual(['2√(3) m≐3,464 m', '√(2)/2≐0,7071', '0,3333']);
  });

  it('say nothing where the value is no fraction or its decimals end', () => {
    expect(results('@exact\nx := 75/2\ny := π/3')).toEqual(['37,5', '1,047']);
  });

  it('give the roots of a quadratic as fractions (sample R22)', () => {
    const source = ['m_1 := 9 kg', 'm_2 := 1 kg', 'k_1 := 38 N/m', 'k_2 := 2 N/m', 'k_3 := 3 N/m', 'solve Ω ∈ ℝ, Ω > 0 s^-2: (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0 {exact}'].join('\n');
    const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const solve = doc.blocks.at(-1)!;
    const text = solve.kind === 'equation' ? solve.lines.map((l) => plain(toText(l.rhs))).join(' | ') : '';
    expect(text).toContain('49/9 s⁻²≐5,444 s⁻² | 4 s⁻²');
  });
});
