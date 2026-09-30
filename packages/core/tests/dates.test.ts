import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, evaluateSheet, type Table } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

const days = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;

describe('dates', () => {
  it('are written as 2026-09-29 and shown as dates', () => {
    expectValue('2026-09-29 =', days(2026, 9, 29), 'date');
    // With spaces it is still a subtraction.
    expectValue('2026 - 09 - 29', 1988, '');
  });

  it('subtract to a number of days, and move by a duration', () => {
    expectValue('2026-09-29 - 2026-01-01', 271, 'd');
    expectValue('2026-09-29 + 30 d', days(2026, 10, 29), 'date');
    expectValue('2026-09-29 - 1 wk', days(2026, 9, 22), 'date');
    expectValue('(2027-09-29 - 2026-09-29) | yr', 365 / 365.25, 'yr');
  });

  it('compare', () => {
    const r = evaluateSheet('x := 2026-01-01 < 2026-09-29');
    expect(r.values.get('x')).toMatchObject({ value: true });
  });

  it('are built and taken apart by functions', () => {
    expectValue('date(2026, 9, 29) - 2026-09-29', 0, 'd');
    expectValue('year(2026-09-29)', 2026, '');
    expectValue('month(2026-09-29)', 9, '');
    expectValue('day(2026-09-29 + 3 d)', 2, '');
  });

  it('report mistakes', () => {
    expect(codes('2026-02-30')).toEqual(['E-DATE-INVALID']);
    expect(codes('date(2026, 2, 30)')).toEqual(['E-DATE-INVALID']);
    expect(codes('2026-09-29 + 2026-01-01')).toEqual(['E-ABS-TEMP']);
    expect(codes('2026-09-29 · 2')).toEqual(['E-DATE-ARITHMETIC']);
    expect(codes('year(5)')).toEqual(['E-TYPE']);
  });

  it('keep "=" after a name that is also a unit a hint to use ":="', () => {
    expect(codes('m = 5')).toEqual(['E-ASSIGN-WITH-EQUALS']);
  });
});

describe('date columns of tables', () => {
  function kurzy(): Table {
    const built = buildTable(
      {
        name: 'Kurzy',
        key: 'datum',
        columns: [
          { name: 'datum', type: 'date' },
          { name: 'EUR', type: 'quantity' },
        ],
      },
      [
        ['2026-09-29', '24.62'],
        ['30.9.2026', '24.58'],
        ['1. 10. 2026', '24.65'],
        ['2026-10-02', '24.71'],
      ],
      defaultRegistry,
    );
    expect(built.diagnostics).toEqual([]);
    return built.table;
  }

  it('read ISO and Czech dates, and are picked by date', () => {
    const r = evaluateSheet('k := pick(Kurzy, datum: 2026-09-30).EUR', { tables: [kurzy()] });
    expect((r.values.get('k') as { si: number }).si).toBe(24.58);
  });

  it('give the last rate known on a day (e.g. at a weekend)', () => {
    const r = evaluateSheet('k := find_max(Kurzy, by: datum, where: r.datum ≤ 2026-10-04).EUR', { tables: [kurzy()] });
    expect((r.values.get('k') as { si: number }).si).toBe(24.71);
  });

  it('reject a cell that is not a date', () => {
    const built = buildTable({ name: 'T', columns: [{ name: 'datum', type: 'date' }] }, [['2026-13-01']], defaultRegistry);
    expect(built.diagnostics.map((d) => d.code)).toEqual(['E-TABLE-CELL']);
  });
});
