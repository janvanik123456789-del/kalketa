import { describe, expect, it } from 'vitest';
import { evaluateSheet, fromDecimalComma, toDecimalComma, tokenize } from '../src/index.js';

describe('decimal comma notation', () => {
  it('reads 50,5 as a number and ; as an argument separator', () => {
    const tokens = tokenize('max(50,5; 1,25e-3)', { decimalComma: true }).tokens.map((t) => [t.type, t.value]);
    expect(tokens.filter(([type]) => type === 'number' || type === ',')).toEqual([
      ['number', 50.5],
      [',', 0],
      ['number', 1.25e-3],
    ]);
  });

  it('keeps "," followed by a space as an argument separator', () => {
    expect(fromDecimalComma('max(1, 2)')).toBe('max(1, 2)');
    expect(fromDecimalComma('max(1,2)')).toBe('max(1.2)');
  });

  it('converts lines both ways without moving any character', () => {
    const local = 'L := 50,5 m   \' rozpětí 1,5 násobek';
    const file = 'L := 50.5 m   \' rozpětí 1,5 násobek';
    expect(fromDecimalComma(local)).toBe(file);
    expect(toDecimalComma(file)).toBe(local);
    expect(toDecimalComma(file)).toHaveLength(file.length);
  });

  it('leaves strings, comments, headings and member access alone', () => {
    const file = '# Zatížení 1.5 kN\np := pick(T, "IPE 1.5")\nx := p.W_y · 2.5   \' 2.5 je součinitel';
    expect(toDecimalComma(file)).toBe('# Zatížení 1.5 kN\np := pick(T; "IPE 1.5")\nx := p.W_y · 2,5   \' 2.5 je součinitel');
    expect(fromDecimalComma(toDecimalComma(file))).toBe(file);
  });

  it('accepts a dot typed by habit and shows it as a comma', () => {
    expect(fromDecimalComma('a := 1.5 + 2,5')).toBe('a := 1.5 + 2.5');
    expect(toDecimalComma(fromDecimalComma('a := 1.5 + 2,5'))).toBe('a := 1,5 + 2,5');
  });

  it('gives the same result as the file notation', () => {
    const local = 'q := 12,5 kN/m\nL := 5 m\nM := max(q·L²/8; 1 kN·m) | kN·m';
    const result = evaluateSheet(fromDecimalComma(local));
    expect(result.diagnostics).toEqual([]);
    expect(result.statements[2]!.display!.value).toBeCloseTo(39.0625, 10);
  });
});
