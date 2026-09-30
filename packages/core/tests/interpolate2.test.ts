import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, evaluateSheet, type Table } from '../src/index.js';

/** Correction factors for cables: k = 1 − 0.01·(θ − 25) − 0.05·(n − 1), on a grid θ × n. */
function korekce(skip?: string): Table {
  const rows: string[][] = [];
  for (const theta of [25, 30, 40]) {
    for (const n of [1, 2, 4]) {
      const id = `${theta}/${n}`;
      if (id === skip) continue;
      rows.push([id, String(theta), String(n), String(1 - 0.01 * (theta - 25) - 0.05 * (n - 1))]);
    }
  }
  const built = buildTable(
    {
      name: 'Korekce',
      key: 'bod',
      columns: [
        { name: 'bod', type: 'text' },
        { name: 'θ', type: 'quantity', unit: '°C' },
        { name: 'n', type: 'quantity' },
        { name: 'k', type: 'quantity' },
      ],
    },
    rows,
    defaultRegistry,
  );
  expect(built.diagnostics).toEqual([]);
  return built.table;
}

const k = (source: string, table = korekce()) => {
  const r = evaluateSheet(source, { tables: [table] });
  return { r, k: (r.values.get('k') as { si: number } | undefined)?.si, codes: r.diagnostics.map((d) => d.code) };
};

describe('2D interpolation over a grid of rows', () => {
  it('hits grid points exactly', () => {
    expect(k('k := interpolate(Korekce, θ: 30 °C, n: 2).k').k).toBeCloseTo(0.9, 12);
  });

  it('interpolates between the four points around the value', () => {
    const { k: value, codes } = k('k := interpolate(Korekce, θ: 35 °C, n: 3).k');
    expect(codes).toEqual([]);
    expect(value).toBeCloseTo(0.8, 12);
  });

  it('interpolates along one axis when the other hits the grid', () => {
    expect(k('k := interpolate(Korekce, θ: 25 °C, n: 3).k').k).toBeCloseTo(0.9, 12);
  });

  it('extrapolates with a warning', () => {
    const { k: value, codes } = k('k := interpolate(Korekce, θ: 45 °C, n: 1).k');
    expect(value).toBeCloseTo(0.8, 12);
    expect(codes).toEqual(['W-EXTRAPOLATION']);
  });

  it('reports a missing point of the grid instead of guessing', () => {
    expect(k('k := interpolate(Korekce, θ: 35 °C, n: 3).k', korekce('40/4')).codes).toEqual(['E-TABLE-INTERPOLATE']);
  });

  it('checks the units of both values', () => {
    expect(k('k := interpolate(Korekce, θ: 35 m, n: 3).k').codes).toEqual(['E-UNIT-MISMATCH']);
  });

  it('records the four rows it read, for provenance', () => {
    const { r } = k('k := interpolate(Korekce, θ: 35 °C, n: 3).k');
    const read = r.statements[0]!.tableReads[0]!;
    expect(read.rows).toHaveLength(4);
    expect(read.weight).toBeCloseTo(0.5, 12);
  });

  it('keeps 1D interpolation as it was', () => {
    expect(k('k := interpolate(Korekce, θ: 27.5 °C).k').codes).toEqual([]);
  });
});
