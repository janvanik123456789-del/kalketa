import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession, type Value } from '../src/index.js';

const BEAM = [
  'table Varianty: {variants=B}',
  '    | varianta | b [mm] | h [mm] |',
  '    | A        | 200    | 300    |',
  '    | B        | 250    | 400    |',
  '    | C        | 300    | 500    |',
  'M := 120 kN·m',
  'W := b·h^2/6 | mm^3',
  'σ := M/W | MPa',
  'f := 20 MPa',
  'check "Ohyb": σ ≤ f',
  'porovnani := compare(Varianty, W, σ)',
].join('\n');

const cells = (value: Value | undefined) =>
  value?.type === 'table'
    ? value.table.rows.map((row) =>
        row.map((cell) => (cell?.type === 'quantity' ? Number(((cell.si - (cell.hint?.offset ?? 0)) / (cell.hint?.factor ?? 1)).toPrecision(4)) : cell?.type === 'text' ? cell.value : cell?.type === 'boolean' ? cell.value : null)),
      )
    : undefined;

describe('variants of a calculation', () => {
  it('calculates with the variant chosen: its columns are names of the sheet', () => {
    const r = evaluateSheet(BEAM);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const sigma = r.values.get('σ');
    expect(sigma?.type === 'quantity' && sigma.si / 1e6).toBeCloseTo(18, 6);
    expect(r.statements[0]!.variant).toEqual({ key: 'B', row: 1 });
    // Without =B the first variant.
    const first = evaluateSheet(BEAM.replace('{variants=B}', '{variants}')).values.get('σ');
    expect(first?.type === 'quantity' && first.si / 1e6).toBeCloseTo(40, 6);
  });

  it('compares the variants: the values named, the largest utilization and the checks of each', () => {
    const r = evaluateSheet(BEAM);
    const compared = r.statements.at(-1)!;
    expect(compared.status).toBe('ok');
    expect(cells(compared.value)).toEqual([
      ['A', 3_000_000, 40, 200, false],
      ['B', 6_667_000, 18, 90, true],
      ['C', 12_500_000, 9.6, 48, true],
    ]);
    expect(compared.value?.type === 'table' && compared.value.table.columns.map((c) => `${c.name} ${c.unit ?? ''}`.trim())).toEqual(['varianta', 'W mm³', 'σ MPa', 'η_max %', '✓']);
    expect(compared.variant).toEqual({ key: 'B', row: 1 });
  });

  it('gives a table to read on: a column as a series, the best variant by find_min', () => {
    const r = evaluateSheet(`${BEAM}
nejlepsi := find_min(porovnani, by: W, where: r.η_max <= 100 %).varianta
σ_vse := porovnani.σ`);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.values.get('nejlepsi')).toEqual({ type: 'text', value: 'B' });
    expect(r.values.get('σ_vse')?.type).toBe('vector');
  });

  it('reports a variant that is not in the table, a name defined twice and a comparison of no table of variants', () => {
    expect(evaluateSheet(BEAM.replace('{variants=B}', '{variants=D}')).diagnostics.map((d) => d.code)).toContain('E-VARIANT-UNKNOWN');
    expect(evaluateSheet(`${BEAM}\nb := 5 mm`).diagnostics.map((d) => d.code)).toContain('E-REDEFINED');
    expect(evaluateSheet(`${BEAM}\nx := compare(M, σ)`).diagnostics.map((d) => d.code)).toContain('E-COMPARE-TABLE');
    expect(evaluateSheet(`${BEAM}\nx := 2·compare(Varianty, σ)`).diagnostics.map((d) => d.code)).toContain('E-COMPARE-PLACE');
  });

  it('recalculates the variants on a change, each only where it changed', () => {
    const session = new SheetSession();
    session.update(BEAM);
    const changed = session.update(BEAM.replace('M := 120 kN·m', 'M := 60 kN·m'));
    expect(cells(changed.statements.at(-1)!.value)?.map((row) => row[2])).toEqual([20, 9, 4.8]);
  });
});
