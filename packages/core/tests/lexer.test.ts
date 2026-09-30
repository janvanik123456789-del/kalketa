import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/index.js';

const types = (source: string) => tokenize(source).tokens.map((t) => t.type);
const texts = (source: string) => tokenize(source).tokens.filter((t) => t.type !== 'eof').map((t) => t.text);

describe('lexer', () => {
  it('reads numbers with decimals, exponents and _ separators', () => {
    const numbers = tokenize('2.4 1e-3 6.022E+23 .5 2_500_000').tokens.filter((t) => t.type === 'number');
    expect(numbers.map((t) => t.value)).toEqual([2.4, 1e-3, 6.022e23, 0.5, 2_500_000]);
  });

  it('treats Unicode and ASCII operators the same', () => {
    expect(types('a · b × c * d')).toEqual(types('a * b * c * d'));
    expect(types('a ≤ b ≥ c ≠ d')).toEqual(types('a <= b >= c != d'));
    expect(types('a ÷ b')).toEqual(types('a / b'));
  });

  it('distinguishes := from : and == from =', () => {
    expect(types('x := 1')).toEqual(['ident', ':=', 'number', 'eof']);
    expect(types('a == b')).toEqual(['ident', '==', 'ident', 'eof']);
    expect(types('a =')).toEqual(['ident', '=', 'eof']);
  });

  it('reads superscripts as powers, not as part of a name', () => {
    const tokens = tokenize('L² m⁻¹').tokens;
    expect(tokens.map((t) => t.type)).toEqual(['ident', 'superscript', 'ident', 'superscript', 'eof']);
    expect(tokens[1]!.value).toBe(2);
    expect(tokens[3]!.value).toBe(-1);
  });

  it('keeps subscripts and underscores in names', () => {
    expect(texts('T₁ M_Ed')).toEqual(['T₁', 'M_Ed']);
  });

  it('normalizes Greek names and unit aliases', () => {
    expect(texts('sigma_x Delta_T degC delta_degC ohm m_dot')).toEqual(['σ_x', 'Δ_T', '°C', 'Δ°C', 'Ω', 'ṁ']);
  });

  it('reads temperature and percent symbols as names', () => {
    expect(texts('20 °C 5 Δ°C 21 % 30°')).toEqual(['20', '°C', '5', 'Δ°C', '21', '%', '30', '°']);
  });

  it('reads comments, headings, directives and strings', () => {
    const tokens = tokenize('## Load\n@hide\nx := 1 \' span\n"text"').tokens;
    expect(tokens.map((t) => t.type)).toEqual([
      'heading', 'newline', 'directive', 'newline', 'ident', ':=', 'number', 'comment', 'newline', 'string', 'eof',
    ]);
    expect(tokens[0]).toMatchObject({ text: 'Load', value: 2 });
    expect(tokens[7]!.text).toBe('span');
  });

  it('tracks line and column', () => {
    const token = tokenize('a := 1\n  b := 2').tokens.find((t) => t.text === 'b')!;
    expect(token.span).toMatchObject({ line: 2, column: 3 });
  });

  it('reports unexpected characters and unterminated strings', () => {
    expect(tokenize('a § b').diagnostics.map((d) => d.code)).toEqual(['E-UNEXPECTED-CHAR']);
    expect(tokenize('"open').diagnostics.map((d) => d.code)).toEqual(['E-UNTERMINATED-STRING']);
  });
});
