import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlockHtml, toMathML, toText } from '../src/index.js';

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

describe('a table from a range in print', () => {
  const tableOf = (source: string) => {
    const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const block = doc.blocks.find((b) => b.kind === 'datatable');
    if (block?.kind !== 'datatable') throw new Error('no table');
    return block;
  };

  it('has all its rows, not only those written, and the row of totals last', () => {
    const block = tableOf('table S: {rows=1..3}\n    | k | B [kN] = prev(B, 1 kN)·2 |\n    | Celkem | Σ |');
    expect(block.rows).toEqual([['1', '2'], ['2', '4'], ['3', '8'], ['Celkem', '14']]);
    expect(block.totals).toEqual([3]);
  });

  it('writes a large number of a row whole', () => {
    const block = tableOf('table S: {rows=12340..12341}\n    | k | x = k·0 |');
    expect(block.rows[1]![0]!.replace(/\s/g, '')).toBe('12341');
  });

  it('a row written by hand is the first of them', () => {
    const block = tableOf('table E: {rows=0..2}\n    | n | p = prev(p) + 1 |\n    | 0 | 5 |');
    expect(block.rows.map((r) => r[1])).toEqual(['5', '6', '7']);
  });
});

describe('matrices put together in print', () => {
  const printed = (source: string) => lines(source).map((line) => toMathML(line.rhs)).join('');

  it('a large matrix shows its corners and its size', () => {
    const shown = printed('K := matrix(i + j, i: 1 .. 200, j: 1 .. 200)');
    expect(shown).toContain('200×200');
    expect(shown).toContain('⋱');
    expect(shown.length).toBeLessThan(40000);
  });

  it('a small matrix is written out', () => {
    expect(printed('K := matrix(i + j, i: 1 .. 12, j: 1 .. 12)')).not.toContain('⋱');
  });

  it('the indices of matrix stay letters, though the sheet has such a name', () => {
    expect(printed('i := 5\nK := matrix(i^2, i: 1 .. 2, j: 1 .. 2)')).toContain('<mi>i</mi>');
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

describe('solve and first in a formula', () => {
  const text = (source: string) => {
    const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    return doc.blocks.map((b) => renderBlockHtml(b, cs)).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  };

  it('puts no value of the sheet in place of its own unknown', () => {
    expect(text('n := first(2^n >= 100, n: 1 .. 20)')).not.toContain('2 7');
    expect(text('t := 5\na := solve t: t^2 == 9 in 0 .. 4')).toContain('t 2 = 9');
  });

  it('writes a small number as on paper', () => {
    const shown = text('a := solve(y^2 == 1e-6, y: 1e-9 .. 1)');
    expect(shown).not.toContain('1E-9');
    expect(shown).toContain('10 −9');
  });
});

describe('charts of statistics in print', () => {
  const svg = (source: string) => {
    const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    return doc.blocks.map((block) => renderBlockHtml(block, cs)).join('');
  };

  it('draws a box for each series, error bars at the points, bars of a histogram', () => {
    const box = svg('a := [1, 2, 3, 4, 5]\nb := [2, 4, 6, 8, 10]\nplot(a, b, kind: "box")');
    expect(box.match(/chart-box/g)?.length).toBe(2);
    const errors = svg('x := [1, 2]\ny := [3, 4]\ne := [0.5, 0.5]\nplot(y, x: x, kind: "points", errors: e)');
    expect(errors.match(/chart-error/g)?.length).toBe(2);
    expect(svg('v := [1, 2, 2, 3, 4, 4, 4]\nplot(v, kind: "hist", bins: 3)')).toContain('<svg');
  });

  it('prints a beam with its reactions, a system of equations and the number found', () => {
    expect(svg('N := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m, 6 m], q: 10 kN/m)')).toContain('R = 30; 30 kN');
    const ode = svg('solve w(x), P: w″ + P·w == 0 in 0 .. 1\n    w(0) == 0\n    w(1) == 0\n    w′(0) == 1\n    guess P = 9');
    expect(ode).toContain('P');
    expect(ode).toContain('9,87');
  });
});
