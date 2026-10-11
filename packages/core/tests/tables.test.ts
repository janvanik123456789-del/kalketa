import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, evaluateSheet, SheetSession, type Table, type TableSchema } from '../src/index.js';

/** Small made-up tables; real engineering data lives in reference/. */
function table(schema: TableSchema, rows: string[][]): Table {
  const built = buildTable(schema, rows, defaultRegistry);
  expect(built.diagnostics).toEqual([]);
  return built.table;
}

const profiles = table(
  {
    name: 'Profily',
    key: 'oznaceni',
    columns: [
      { name: 'oznaceni', type: 'text' },
      { name: 'Wy', type: 'quantity', unit: 'cm³' },
      { name: 'G', type: 'quantity', unit: 'kg/m' },
      { name: 'h', type: 'quantity', unit: 'mm' },
    ],
  },
  [
    ['P1', '50', '10', '100'],
    ['P2', '100', '15', '150'],
    ['P3', '200', '25', ''],
    ['P4', '400', '40', '300'],
  ],
);

const materials = table(
  {
    name: 'Materialy',
    columns: [
      { name: 'trida', type: 'text' },
      { name: 'f_y', type: 'quantity', unit: 'MPa' },
      { name: 'svarovatelny', type: 'boolean' },
    ],
  },
  [
    ['S235', '235', 'ano'],
    ['S355', '355', 'ano'],
  ],
);

const curve = table(
  {
    name: 'Krivka',
    columns: [
      { name: 'λ', type: 'quantity' },
      { name: 'χ', type: 'quantity' },
      { name: 'T', type: 'quantity', unit: '°C' },
    ],
  },
  [
    ['0,2', '1,0', '20'],
    ['0,6', '0,8', '60'],
    ['1,0', '0,5', '100'],
  ],
);

const tables = [profiles, materials, curve];

function run(source: string) {
  return evaluateSheet(source, { tables });
}

function codes(source: string): string[] {
  return run(source).diagnostics.map((d) => d.code);
}

function value(source: string, name: string) {
  const result = run(source);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return result.statements.find((s) => s.statement.kind === 'definition' && s.statement.name === name)!;
}

describe('building tables', () => {
  it('parses numbers with decimal commas and units from the schema', () => {
    const row = curve.rows[1]!;
    expect(row[0]).toMatchObject({ type: 'quantity', si: 0.6 });
    expect(row[2]).toMatchObject({ si: 333.15, absolute: true });
    expect(profiles.rows[0]![1]).toMatchObject({ si: expect.closeTo(50e-6, 15) });
  });

  it('keeps empty cells empty', () => {
    expect(profiles.rows[2]![3]).toBeNull();
  });

  it('reports bad cells and bad schemas but still builds the table', () => {
    const built = buildTable(
      { name: 'Bad', columns: [{ name: 'a', type: 'quantity', unit: 'furlongs' }, { name: 'b', type: 'boolean' }] },
      [['x', 'maybe']],
      defaultRegistry,
    );
    expect(built.diagnostics.map((d) => d.code)).toEqual(['E-TABLE-SCHEMA', 'E-TABLE-CELL', 'E-TABLE-CELL']);
    expect(built.table.rows[0]).toEqual([null, null]);
  });

  it('changes its fingerprint when data change', () => {
    const a = buildTable(materials, [['S235', '235', 'ano']], defaultRegistry).table;
    const b = buildTable(materials, [['S235', '240', 'ano']], defaultRegistry).table;
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe('pick', () => {
  it('finds a row by key and reads columns with units', () => {
    const r = value('m := pick(Materialy, "S355")\nf := m.f_y', 'f');
    expect(r.display).toEqual({ value: 355, unit: 'MPa' });
  });

  it('shows the row by its key', () => {
    expect(value('p := pick(Profily, "P2")', 'p').value).toMatchObject({ type: 'row', label: 'P2' });
  });

  it('finds a row by any column', () => {
    expect(value('p := pick(Profily, G: 25 kg/m)', 'p').value).toMatchObject({ label: 'P3' });
  });

  it('reads booleans and compares text', () => {
    expect(value('m := pick(Materialy, "S235")\nok := m.svarovatelny and m.trida == "S235"', 'ok').value).toEqual({ type: 'boolean', value: true });
  });

  it('reports a missing key, a missing column and an empty cell', () => {
    expect(codes('p := pick(Profily, "P9")')).toEqual(['E-TABLE-KEY']);
    expect(codes('p := pick(Profily, "P1")\nx := p.Iy')).toEqual(['E-TABLE-COLUMN']);
    expect(codes('p := pick(Profily, "P3")\nx := p.h')).toEqual(['E-TABLE-EMPTY']);
  });

  it('requires a table as the first argument', () => {
    expect(codes('p := pick(5, "P1")')).toEqual(['E-TYPE']);
  });
});

describe('interpolate', () => {
  it('interpolates all numeric columns linearly', () => {
    const r = value('r := interpolate(Krivka, λ: 0.4)\nχ_r := r.χ\nT_r := r.T', 'χ_r');
    expect(r.display!.value).toBeCloseTo(0.9, 12);
    expect(value('r := interpolate(Krivka, λ: 0.4)\nT_r := r.T', 'T_r').display!.value).toBeCloseTo(40, 12);
  });

  it('returns the exact row when the value is in the table', () => {
    expect(value('r := interpolate(Krivka, λ: 0.6)', 'r').value).toMatchObject({ origin: { rows: [1] } });
  });

  it('warns when extrapolating', () => {
    const result = run('r := interpolate(Krivka, λ: 1.2)\nχ_r := r.χ');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W-EXTRAPOLATION']);
    expect(result.values.get('χ_r')).toMatchObject({ si: expect.closeTo(0.35, 12) });
  });

  it('checks units of the interpolation value', () => {
    expect(codes('r := interpolate(Profily, h: 2 s)')).toEqual(['E-UNIT-MISMATCH']);
    expect(codes('r := interpolate(Materialy, trida: 1)')).toEqual(['E-TABLE-INTERPOLATE']);
  });
});

describe('find_min and find_max', () => {
  it('finds the lightest profile that satisfies a condition', () => {
    const sheet = 'M := 15 kN·m\nf_y := 235 MPa\np := find_min(Profily, by: G, where: M / r.Wy ≤ f_y)';
    // Required Wy = 15 kN·m / 235 MPa = 63.8 cm³ -> P2 (100 cm³) is the lightest.
    expect(value(sheet, 'p').value).toMatchObject({ label: 'P2' });
  });

  it('finds the maximum without a condition', () => {
    expect(value('p := find_max(Profily, by: Wy)', 'p').value).toMatchObject({ label: 'P4' });
  });

  it('skips rows with empty cells and says so', () => {
    const result = run('p := find_min(Profily, by: G, where: r.h ≥ 200 mm)');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W-TABLE-ROWS-SKIPPED']);
    expect(result.statements[0]!.value).toMatchObject({ label: 'P4' });
  });

  it('reports when nothing matches', () => {
    expect(codes('p := find_min(Profily, by: G, where: r.Wy > 1 m³)')).toEqual(['E-TABLE-NO-MATCH']);
  });

  it('checks named arguments', () => {
    expect(codes('p := find_min(Profily, where: r.G > 0 kg/m)')).toEqual(['E-NAMED-ARG']);
    expect(codes('p := find_min(Profily, by: G, sort: G)')).toEqual(['E-NAMED-ARG']);
    expect(codes('x := sqrt(a: 4)')).toEqual(['E-NAMED-ARG']);
  });
});

describe('tables in the sheet', () => {
  it('cannot be redefined', () => {
    expect(codes('Profily := 5')).toEqual(['E-REDEFINED']);
  });

  it('are recalculated when their data change', () => {
    const session = new SheetSession();
    const source = 'm := pick(Materialy, "S235")\nf := m.f_y';
    session.update(source, { tables });
    const changed = buildTable(materials, [['S235', '240', 'ano']], defaultRegistry).table;
    const result = session.update(source, { tables: [profiles, changed, curve] });
    expect(result.stats.reused).toBe(0);
    expect(result.values.get('f')).toMatchObject({ si: 240e6 });
    expect(session.update(source, { tables: [profiles, changed, curve] }).stats.evaluated).toBe(0);
  });
});

describe('filter: the rows that satisfy a condition, as a table', () => {
  it('keeps the rows, their columns read as series, other functions read the result', () => {
    const r = evaluateSheet('V := filter(Profily, where: r.Wy >= 100 cm³)\nn := len(V.G)\nG_min := min(V.G)\np := pick(V, "P4").G\nq := find_min(filter(Profily, where: r.G > 12 kg/m), by: G).oznaceni', { tables: [profiles] });
    expect(r.diagnostics).toEqual([]);
    expect(r.values.get('n')).toMatchObject({ si: 3 });
    expect(r.values.get('G_min')).toMatchObject({ si: 15 });
    expect(r.values.get('p')).toMatchObject({ si: 40 });
    expect(r.values.get('q')).toEqual({ type: 'text', value: 'P2' });
  });

  it('skips the rows whose condition needs an empty cell, and may keep none', () => {
    const r = evaluateSheet('V := filter(Profily, where: r.h > 120 mm)\nn := len(V.h)', { tables: [profiles] });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['W-TABLE-ROWS-SKIPPED']);
    expect(r.values.get('n')).toMatchObject({ si: 2 });
    expect(evaluateSheet('p := pick(filter(Profily, where: r.Wy > 1000 cm³), "P1")', { tables: [profiles] }).diagnostics[0]?.code).toBeDefined();
  });
});
