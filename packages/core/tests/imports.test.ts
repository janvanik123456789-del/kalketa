import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession, traceName, type ImportedValue } from '../src/index.js';

/** Values of an auxiliary layer, as the sheet package passes them on. */
function importsFrom(source: string, layer = 'zatizeni', layerName = 'Zatížení'): Map<string, ImportedValue> {
  const aux = evaluateSheet(source);
  expect(aux.diagnostics).toEqual([]);
  return new Map([...aux.values].map(([name, value]) => [name, { value, layer, layerName }]));
}

describe('values from other layers', () => {
  const imports = importsFrom('g_k := 3,5 kN/m\nq_k := 8 kN/m\nq := 1.35·g_k + 1.5·q_k'.replace(',', '.'));

  it('can be used by name in the sheet', () => {
    const result = evaluateSheet('L := 5 m\nM := q·L²/8 | kN·m', { imports });
    expect(result.diagnostics).toEqual([]);
    expect(result.statements[1]!.display!.value).toBeCloseTo((1.35 * 3.5 + 1.5 * 8) * 25 / 8, 10);
  });

  it('cannot be redefined in the sheet', () => {
    expect(evaluateSheet('q := 5 kN/m', { imports }).diagnostics.map((d) => d.code)).toEqual(['E-REDEFINED']);
  });

  it('are traced to their layer', () => {
    const result = evaluateSheet('L := 5 m\nM := q·L²/8', { imports });
    const node = traceName(result, 'M')!;
    expect(node.inputs.map((n) => [n.name, n.kind, n.layer?.name])).toEqual([
      ['q', 'imported', 'Zatížení'],
      ['L', 'variable', undefined],
    ]);
    expect(node.inputs[0]!.display!.unit).toBe('kN/m');
  });

  it('are recalculated when the other layer changes', () => {
    const session = new SheetSession();
    session.update('M := q·2 m', { imports });
    const changed = importsFrom('q := 20 kN/m');
    const result = session.update('M := q·2 m', { imports: changed });
    expect(result.stats.reused).toBe(0);
    expect(result.values.get('M')).toMatchObject({ si: 40000 });
  });

  it('are not units even when named like one', () => {
    const withL = importsFrom('L := 7 m');
    expect(evaluateSheet('b := L·2', { imports: withL }).values.get('b')).toMatchObject({ si: 14 });
  });
});
