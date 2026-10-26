import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, evaluateSheet, toDecimalComma, type SheetResult } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

const lastOf = (r: SheetResult) => r.statements.at(-1)!;
const list = (source: string) => {
  const r = evaluateSheet(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return lastOf(r).displayList!;
};

describe('series', () => {
  it('are written in brackets, with a unit after them', () => {
    expect(list('[1, 2, 3] m =')).toEqual([
      { value: 1, unit: 'm' },
      { value: 2, unit: 'm' },
      { value: 3, unit: 'm' },
    ]);
    expectValue('v := [1, 2, 3] m\nsum(v)', 6, 'm');
  });

  it('keep [m] a unit', () => {
    expectValue('5 [m]', 5, 'm');
    expectValue('[m]·3', 3, 'm');
  });

  it('spread a series inside a series', () => {
    expectValue('a := [300, 400]\nlen([-1000, a, 500])', 4, '');
  });

  it('compute item by item, with a number or a series of the same length', () => {
    expect(list('[1, 2, 3] + [10, 20, 30] =').map((d) => d.value)).toEqual([11, 22, 33]);
    const discounted = list('t := range(0, 2)\n1000/(1 + 10 %)^t =').map((d) => d.value);
    [1000, 1000 / 1.1, 1000 / 1.21].forEach((v, i) => expect(discounted[i]).toBeCloseTo(v, 9));
    expect(list('-[1, 2] =').map((d) => d.value)).toEqual([-1, -2]);
  });

  it('are shown in one unit, also after "|"', () => {
    expect(list('[1000, 2500] mm | m =')).toEqual([
      { value: 1, unit: 'm' },
      { value: 2.5, unit: 'm' },
    ]);
  });

  it('give items by their number, from 1', () => {
    expectValue('v := [10, 20, 30] m\nv[2]', 20, 'm');
    expect(codes('v := [10, 20, 30]\nv[4]')).toEqual(['E-INDEX']);
    expect(codes('v := [10, 20, 30]\nv[0]')).toEqual(['E-INDEX']);
  });

  it('make ranges', () => {
    expect(list('range(1, 5) =').map((d) => d.value)).toEqual([1, 2, 3, 4, 5]);
    expect(list('range(0 m, 1 m, 0.25 m) =').map((d) => d.value)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(codes('range(1, 100000)')).toEqual(['E-RANGE-SIZE']);
  });

  it('sum, average, count, accumulate, find extremes', () => {
    expectValue('mean([2, 4, 9] kg)', 5, 'kg');
    expectValue('len(range(1, 25))', 25, '');
    expect(list('cumsum([-1000, 300, 400]) =').map((d) => d.value)).toEqual([-1000, -700, -300]);
    expectValue('min([4, 2, 9] m)', 2, 'm');
    expectValue('max([4, 2, 9] m)', 9, 'm');
  });

  it('report mistakes', () => {
    expect(codes('[1, 2] + [1, 2, 3]')).toEqual(['E-VECTOR-LENGTH']);
    expect(codes('[1 m, 2 s]')).toEqual(['E-UNIT-MISMATCH']);
    expect(codes('[1, 2] < 3')).toEqual(['E-TYPE']);
    expect(codes('sum(5)')).toEqual(['E-TYPE']);
    expect(codes('[1 + 2j]')).toEqual(['E-COMPLEX-ARG']);
  });

  it('take a table column', () => {
    const built = buildTable(
      { name: 'Vyroba', columns: [{ name: 'mesic', type: 'text' }, { name: 'E', type: 'quantity', unit: 'kWh' }] },
      [
        ['leden', '120'],
        ['únor', '210'],
        ['březen', '480'],
      ],
      defaultRegistry,
    );
    const r = evaluateSheet('rok := sum(Vyroba.E)', { tables: [built.table] });
    expect(lastOf(r).display).toMatchObject({ value: 810, unit: 'kWh' });
  });

  it('are written with ";" in the decimal-comma notation', () => {
    expect(toDecimalComma('CF := [-1000.5, 300, 400]')).toBe('CF := [-1000,5; 300; 400]');
  });
});

describe('finance', () => {
  const CF = '[-1000, 300, 400, 500]';

  it('net present value, the first flow now', () => {
    expectValue(`npv(5 %, ${CF})`, -1000 + 300 / 1.05 + 400 / 1.05 ** 2 + 500 / 1.05 ** 3, '');
    expectValue('npv(0, [-10, 4, 4] m)', -2, 'm');
  });

  it('internal rate of return', () => {
    const r = evaluateSheet(`i := irr(${CF})`);
    const i = (r.values.get('i') as { si: number }).si;
    expect(-1000 + 300 / (1 + i) + 400 / (1 + i) ** 2 + 500 / (1 + i) ** 3).toBeCloseTo(0, 8);
    expect(codes('irr([100, 200])')).toEqual(['E-SOLVE-NO-ROOT']);
  });

  it('annuity payment', () => {
    const rate = 0.05;
    expectValue('pmt(5 %, 20, 1000000)', (1000000 * rate) / (1 - (1 + rate) ** -20), '');
    expectValue('pmt(0, 4, 1000)', 250, '');
  });

  it('payback period, linear within a period', () => {
    expectValue(`payback(${CF})`, 2.6, '');
    expect(codes('payback([-1000, 100, 100])')).toEqual(['E-NO-PAYBACK']);
  });
});

describe('functions of one plain number on a series', () => {
  it('are taken item by item', () => {
    expect(list('t := [0, 1, 2] s\nexp(-t/(1 s)) =').map((d) => d.value)).toEqual([1, Math.exp(-1), Math.exp(-2)]);
    expectValue('f(t, τ) := 1 - exp(-t/τ)\nsum(f([1, 2] s, 1 s))', 2 - Math.exp(-1) - Math.exp(-2), '');
    expect(codes('ln([1, 0])')).toEqual(['E-DOMAIN']);
    expect(codes('sin([1, 2] m)')).toEqual(['E-FUNC-ARG-DIM']);
  });
});
