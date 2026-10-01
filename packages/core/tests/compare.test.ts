import { describe, expect, it } from 'vitest';
import { compareSheets, defaultRegistry, evaluateSheet } from '../src/index.js';

const compare = (a: string, b: string) => compareSheets(evaluateSheet(a), evaluateSheet(b), defaultRegistry);
const BEAM = (L: string, q = '12 kN/m') => `L := ${L}\nq := ${q}\nM := q·L²/8 | kN·m\ncheck "Ohyb": M ≤ 60 kN·m\ncheck M ≥ 0 kN·m\n`;

describe('comparing two calculations', () => {
  it('finds nothing in the same calculation', () => {
    expect(compare(BEAM('5 m'), BEAM('5 m')).same).toBe(true);
    // Another unit to show a value in, or other spaces, change nothing.
    expect(compare('a := 5 m\nb := a·2', 'a := 5000 mm\nb  :=  a·2').values).toEqual([]);
  });

  it('tells inputs from what they changed, and the checks', () => {
    const c = compare(BEAM('5 m'), BEAM('6 m'));
    expect(c.formulas).toEqual([{ name: 'L', before: 'L := 5 m', after: 'L := 6 m' }]);
    const m = c.values.find((v) => v.name === 'M')!;
    expect(m.written).toBe(false);
    expect(m.before).toEqual({ kind: 'quantity', display: { value: 37.5, unit: 'kN·m' } });
    expect(m.ratio).toBeCloseTo(1.44, 12);
    expect(c.values.find((v) => v.name === 'L')!.written).toBe(true);
    expect(c.checks).toEqual([{ label: 'Ohyb', before: { passed: true, utilization: 0.625 }, after: { passed: true, utilization: 0.9 } }]);
  });

  it('reports names that came and went', () => {
    const c = compare('a := 1\nb := 2', 'a := 1\nc := 3');
    expect(c.formulas).toEqual([
      { name: 'b', before: 'b := 2' },
      { name: 'c', after: 'c := 3' },
    ]);
    expect(c.values.map((v) => [v.name, !!v.before, !!v.after])).toEqual([
      ['b', true, false],
      ['c', false, true],
    ]);
  });
});
