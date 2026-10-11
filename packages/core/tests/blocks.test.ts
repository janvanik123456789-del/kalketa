import { describe, expect, it } from 'vitest';
import { blockVersion, evaluateSheet, SheetSession, type BlockSource, type SheetResult } from '../src/index.js';

const NOSNIK: BlockSource = {
  name: 'Prosty_nosnik',
  version: '1.0',
  source: [
    '# Prostý nosník',
    '@version 1.0',
    'input L := 5 m',
    'input q := 12 kN/m',
    'M_max := q·L²/8 | kN·m',
    'V_max := q·L/2 | kN',
  ].join('\n'),
};
const blocks = new Map([[NOSNIK.name, NOSNIK]]);
const run = (source: string, extra: ReadonlyMap<string, BlockSource> = blocks): SheetResult => evaluateSheet(source, { blocks: extra });
const si = (r: SheetResult, name: string) => (r.values.get(name) as { si: number }).si;
const codes = (r: SheetResult) => r.diagnostics.map((d) => d.code);

describe('blocks', () => {
  it('are calculated with the inputs given by name; the rest keep their own values', () => {
    const r = run('N1 := Prosty_nosnik(L: 6 m, q: 10 kN/m)\nM := N1.M_max\nN2 := Prosty_nosnik(L: 4 m)\nV := N2.V_max');
    expect(codes(r)).toEqual([]);
    expect(si(r, 'M')).toBeCloseTo((10e3 * 36) / 8);
    expect(si(r, 'V')).toBeCloseTo((12e3 * 4) / 2);
    expect(r.values.get('N1')).toMatchObject({ type: 'record', block: 'Prosty_nosnik', version: '1.0' });
  });

  it('keep the units of their results', () => {
    const r = run('N1 := Prosty_nosnik(L: 6 m)\nN1.M_max =');
    expect(r.statements[1]!.display).toMatchObject({ unit: 'kN·m' });
    expect(r.statements[1]!.display!.value).toBeCloseTo(54);
  });

  it('can be used in checks and further formulas', () => {
    const r = run('N1 := Prosty_nosnik(L: 6 m)\nW := 194.3 cm³\ncheck "Ohyb": N1.M_max / W ≤ 235 MPa');
    expect(r.checks[0]).toMatchObject({ passed: false });
  });

  it('report wrong inputs, unknown inputs and missing outputs', () => {
    expect(codes(run('N1 := Prosty_nosnik(L: 6 s)'))).toEqual(['E-BLOCK-INPUT']);
    expect(codes(run('N1 := Prosty_nosnik(E: 6 m)'))).toEqual(['E-NAMED-ARG']);
    expect(codes(run('N1 := Prosty_nosnik(6 m)'))).toEqual(['E-NAMED-ARG']);
    expect(codes(run('N1 := Prosty_nosnik()\nN1.w_max'))).toEqual(['E-BLOCK-OUTPUT']);
    const broken = new Map([['B', { name: 'B', version: '1', source: 'input a := 1 m\nb := a + 1 s' }]]);
    expect(codes(run('x := B(a: 2 m)', broken))).toEqual(['E-BLOCK-ERROR']);
  });

  it('may use other blocks, but not themselves', () => {
    const inner = { name: 'Plocha', version: '1', source: 'input a := 1 m\nA := a²' };
    const outer = { name: 'Objem', version: '1', source: 'input a := 1 m\ninput h := 1 m\nP := Plocha(a: a)\nV := P.A·h' };
    const self = { name: 'Smycka', version: '1', source: 'input a := 1\nS := Smycka(a: a)' };
    const all = new Map([inner, outer, self].map((b) => [b.name, b]));
    const r = run('x := Objem(a: 2 m, h: 3 m)\nV := x.V', all);
    expect(si(r, 'V')).toBeCloseTo(12);
    expect(codes(run('y := Smycka(a: 2)', all))).toEqual(['E-BLOCK-ERROR']);
  });

  it('take their names away from variables', () => {
    expect(codes(run('Prosty_nosnik := 5'))).toEqual(['E-REDEFINED']);
  });

  it('are recalculated when their text or an input changes', () => {
    const session = new SheetSession();
    const source = 'L := 6 m\nN1 := Prosty_nosnik(L: L)\nM := N1.M_max';
    session.update(source, { blocks });
    expect(session.update(source, { blocks }).stats.evaluated).toBe(0);
    const changed = new Map([[NOSNIK.name, { ...NOSNIK, source: NOSNIK.source.replace('12 kN/m', '20 kN/m') }]]);
    const r = session.update(source, { blocks: changed });
    expect(si(r, 'M')).toBeCloseTo((20e3 * 36) / 8);
    const r2 = session.update(source.replace('6 m', '4 m'), { blocks: changed });
    expect(si(r2, 'M')).toBeCloseTo((20e3 * 16) / 8);
  });

  it('keep the calculation with the given inputs, for print', () => {
    const r = run('N1 := Prosty_nosnik(L: 6 m)');
    const record = r.values.get('N1');
    expect(record?.type === 'record' && record.result!.statements.length).toBe(6);
  });

  it('write their version as @version', () => {
    expect(blockVersion(NOSNIK.source)).toBe('1.0');
    expect(blockVersion('a := 1')).toBe('1');
  });

  it('parse "input" lines as definitions marked as inputs', () => {
    const r = evaluateSheet('input L := 5 m\nM := L·2');
    expect(r.sheet.statements[0]).toMatchObject({ kind: 'definition', name: 'L', input: true });
    expect(si(r, 'M')).toBe(10);
    expect(evaluateSheet('input f(x) := x').diagnostics.map((d) => d.code)).toEqual(['E-SYNTAX']);
  });
});
