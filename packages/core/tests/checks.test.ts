import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, defaultRegistry as registry, evaluateSheet, sourcesOf, traceName, type TraceNode } from '../src/index.js';

describe('check statements', () => {
  it('parse label, condition and source', () => {
    const result = evaluateSheet('σ := 150 MPa\nf_y := 235 MPa\ncheck "Ohyb": σ ≤ f_y source "EN 1993-1-1, 6.2.5"');
    expect(result.diagnostics).toEqual([]);
    expect(result.statements[2]!.statement).toMatchObject({ kind: 'check', label: 'Ohyb', source: 'EN 1993-1-1, 6.2.5' });
  });

  it('computes utilization for ≤ and ≥', () => {
    const result = evaluateSheet('check "a": 150 MPa ≤ 200 MPa\ncheck "b": 40 mm ≥ 50 mm\ncheck "c": 3 < 2');
    expect(result.checks.map((c) => [c.label, c.passed, c.utilization])).toEqual([
      ['a', true, 0.75],
      ['b', false, 1.25],
      ['c', false, 1.5],
    ]);
  });

  it('keeps both sides for printing', () => {
    const check = evaluateSheet('check "a": 150 MPa ≤ 200 MPa').checks[0]!;
    expect(check).toMatchObject({ operator: '<=', left: { si: 150e6 }, right: { si: 200e6 } });
  });

  it('accepts any boolean condition, without utilization', () => {
    const check = evaluateSheet('a := true\ncheck a and 1 < 2').checks[0]!;
    expect(check.passed).toBe(true);
    expect(check.utilization).toBeUndefined();
    expect(check.label).toBeUndefined();
  });

  it('gives no utilization for negative values or absolute temperatures', () => {
    const result = evaluateSheet('check -5 kN ≤ 10 kN\ncheck 20 °C ≤ 30 °C');
    expect(result.checks.map((c) => c.utilization)).toEqual([undefined, undefined]);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('a failed check is not an error of the sheet', () => {
    const result = evaluateSheet('check "x": 2 m ≤ 1 m');
    expect(result.diagnostics).toEqual([]);
    expect(result.checks[0]!.passed).toBe(false);
  });

  it('lists checks that could not be evaluated as failed', () => {
    const result = evaluateSheet('a := 1 m + 1 s\ncheck "x": a ≤ 1 m\ncheck "y": 1 m ≤ 1 s');
    expect(result.checks.map((c) => [c.label, c.passed])).toEqual([['x', false], ['y', false]]);
    expect(result.statements[1]!.status).toBe('blocked');
    expect(result.statements[2]!.diagnostics.map((d) => d.code)).toEqual(['E-UNIT-MISMATCH']);
  });

  it('requires a boolean condition', () => {
    expect(evaluateSheet('check 5 m').diagnostics.map((d) => d.code)).toEqual(['E-TYPE']);
  });

  it('is a reserved word', () => {
    expect(evaluateSheet('check := 5').diagnostics.map((d) => d.code)).toEqual(['E-RESERVED']);
  });
});

describe('provenance', () => {
  const table = buildTable(
    {
      name: 'Profily',
      key: 'oznaceni',
      columns: [
        { name: 'oznaceni', type: 'text' },
        { name: 'W_y', type: 'quantity', unit: 'cm³' },
      ],
      source: { title: 'Katalog XY', retrieved: '2026-09-29' },
    },
    [['P1', '50'], ['P2', '100']],
    defaultRegistry,
  ).table;

  const sheet = [
    'q := 12 kN/m   \' zatížení',
    'L := 5 m',
    'M := q·L²/8',
    'p := pick(Profily, "P2")',
    'σ := M / p.W_y | MPa',
    'check "Ohyb": σ ≤ 400 MPa',
  ].join('\n');
  const result = evaluateSheet(sheet, { tables: [table], registry });

  it('traces a result to formulas and inputs', () => {
    const node = traceName(result, 'σ')!;
    expect(node).toMatchObject({ name: 'σ', line: 5, expression: 'M / p.W_y', display: { unit: 'MPa' } });
    expect(node.inputs.map((n) => n.name)).toEqual(['M', 'p']);
    const m = node.inputs[0]!;
    expect(m.expression).toBe('q·L²/8');
    expect(m.inputs.map((n) => [n.name, n.comment])).toEqual([['q', 'zatížení'], ['L', undefined]]);
  });

  it('records which table cells were read and their source', () => {
    const node = traceName(result, 'σ')!;
    expect(node.tables).toEqual([{ table: 'Profily', rows: [1], column: 'W_y', rowLabels: ['P2'], source: { title: 'Katalog XY', retrieved: '2026-09-29' } }]);
    const pick = node.inputs[1]!;
    expect(pick.tables).toMatchObject([{ table: 'Profily', rows: [1], rowLabels: ['P2'] }]);
    expect(pick.tables[0]!.column).toBeUndefined();
  });

  it('collects all sources a result depends on', () => {
    const all = sourcesOf(traceName(result, 'σ')!);
    expect(all.map((s) => [s.table, s.rowLabels.join(), s.column])).toEqual([
      ['Profily', 'P2', 'W_y'],
      ['Profily', 'P2', undefined],
    ]);
  });

  it('does not count rows tested by find_min as sources', () => {
    const r = evaluateSheet('p := find_min(Profily, by: W_y, where: r.W_y > 60 cm³)\nW := p.W_y', { tables: [table] });
    const node: TraceNode = traceName(r, 'W')!;
    expect(sourcesOf(node).map((s) => s.rowLabels.join())).toEqual(['P2', 'P2']);
  });

  it('traces tables and unknown names', () => {
    expect(traceName(result, 'Profily')).toMatchObject({ kind: 'table', tables: [{ source: { title: 'Katalog XY' } }] });
    expect(traceName(result, 'nope')).toBeUndefined();
  });
});
