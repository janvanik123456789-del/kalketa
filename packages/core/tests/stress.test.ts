/**
 * The stress sheets (written in Strata, 2026-11-08) as lasting tests of the core: every line of each with its
 * value as shown and the codes it is reported with, against a record checked by hand. A change of any of them
 * is either a fix (the record is updated, saying why in the commit) or a fault.
 *
 * The targeted cases below are the nine weaknesses the sheets found, each as it now must be.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SheetSession, defaultRegistry, type DisplayValue, type SheetResult } from '../src/index.js';

const data = (name: string) => readFileSync(new URL(`./data/stress/${name}.cc`, import.meta.url), 'utf8');

/** A sheet as its layers would calculate it: nothing to cite, so every citation is unknown. */
function run(name: string): SheetResult {
  return new SheetSession({ registry: defaultRegistry }).update(data(name), { citable: new Set() });
}

const shown = (d: DisplayValue) => `${Number(d.value.toPrecision(6))}${d.unit ? ` ${d.unit}` : ''}`;

/** One line per statement: where, what is shown, what is said. */
function record(result: SheetResult): string {
  return result.statements
    .map((r) => {
      const s = r.statement;
      const what = r.display
        ? shown(r.display)
        : r.displayList
          ? `[${r.displayList.length}]`
          : r.displayMatrix
            ? `${r.displayMatrix.rows}×${r.displayMatrix.cols}`
            : r.check
              ? String(r.check.passed)
              : r.status;
      const said = r.diagnostics.map((d) => d.code).join(' ');
      return `${s.span.line} ${s.kind}${'name' in s && typeof s.name === 'string' ? ` ${s.name}` : ''}: ${what}${said ? `  ${said}` : ''}`;
    })
    .join('\n');
}

describe('stress sheets', () => {
  for (const name of ['test-A', 'test-B', 'test-C', 'test-D', 'test-E', 'test-F', 'hilbert']) {
    it(`${name} as recorded`, async () => {
      await expect(record(run(name)) + '\n').toMatchFileSnapshot(`./data/stress/${name}.record.txt`);
    });
  }
});

describe('the nine weaknesses the stress sheets found', () => {
  const statementAt = (result: SheetResult, line: number) => result.statements.find((r) => r.statement.span.line === line)!;
  const one = (source: string, citable?: ReadonlySet<string>) => new SheetSession({ registry: defaultRegistry }).update(source, citable ? { citable } : {});

  it('says a citation the sheet has no source for', () => {
    const r = one('"Text." [XX:T9]\n"More." [T1]\n"Library." [PP:T4]', new Set(['T1', 'PP:']));
    expect(r.diagnostics.map((d) => [d.code, d.params['id']])).toEqual([['W-CITE-UNKNOWN', 'XX:T9']]);
    // Without the layers nothing is known to cite: unchecked, not all wrong.
    expect(one('"Text." [XX:T9]').diagnostics).toEqual([]);
  });

  it('says a reference to an equation no line names', () => {
    const r = one('a := 2 {eq=Known}\n"See (#Known) and (#Missing)."');
    expect(r.diagnostics.map((d) => [d.code, d.params['name']])).toEqual([['W-EQ-REF-UNKNOWN', 'Missing']]);
  });

  it('warns of a condition number past double precision', () => {
    const r = one('H := matrix(1/(i + j - 1), i: 1 .. 14, j: 1 .. 14)\nc := cond(H)');
    expect(statementAt(r, 2).diagnostics.map((d) => d.code)).toEqual(['W-COND-BEYOND-DOUBLE']);
    expect(one('c := cond([4, -2 | -2, 4])').diagnostics).toEqual([]);
  });

  it('warns of a determinant outside the range of numbers', () => {
    const r = one('H := matrix(1/(i + j - 1), i: 1 .. 40, j: 1 .. 40)\nd := det(H)');
    expect(statementAt(r, 2).diagnostics.map((d) => d.code)).toContain('W-DET-OUT-OF-RANGE');
  });

  it('tells a nearly singular matrix from a singular one', () => {
    const near = one('H := matrix(1/(i + j - 1), i: 1 .. 14, j: 1 .. 14)\nx := lsolve(H, vector(1, i: 1 .. 14))\ny := inverse(H)');
    expect(statementAt(near, 2).diagnostics.map((d) => d.code)).toEqual(['E-MATRIX-NEAR-SINGULAR']);
    expect(statementAt(near, 3).diagnostics.map((d) => d.code)).toEqual(['E-MATRIX-NEAR-SINGULAR']);
    expect(one('y := inverse([1, 2 | 2, 4])').diagnostics.map((d) => d.code)).toEqual(['E-MATRIX-SINGULAR']);
  });

  it('warns of an inverse of a badly conditioned matrix, as lsolve does', () => {
    const r = one('H := matrix(1/(i + j - 1), i: 1 .. 9, j: 1 .. 9)\ny := inverse(H)\nz := H^-1');
    expect(statementAt(r, 2).diagnostics.map((d) => d.code)).toEqual(['W-ILL-CONDITIONED']);
    expect(statementAt(r, 3).diagnostics.map((d) => d.code)).toEqual(['W-ILL-CONDITIONED']);
  });

  it('says a function written without its brackets', () => {
    expect(one('c := sqrt').diagnostics.map((d) => [d.code, d.params['name']])).toEqual([['E-FUNCTION-UNCALLED', 'sqrt']]);
    expect(one('c := nic_takoveho').diagnostics[0]!.code).toBe('E-UNDEFINED');
  });

  it('gives the form of the function written wrong, not of others', () => {
    const d = one('c := max_of(x^2, x: 0 m)').diagnostics[0]!;
    expect([d.code, d.params['form']]).toEqual(['E-CALCULUS-FORM', 'form.max_of']);
  });

  it('names the units of a derivation step as written', () => {
    const r = run('test-E');
    const units = r.diagnostics.find((d) => d.code === 'E-DERIVE-UNITS')!;
    expect([units.params['left'], units.params['right']]).toEqual(['kN', 'kN·m']);
  });

  it('shows zero where only rounding is left', () => {
    expect(one('a := 0.1 + 0.2 - 0.3').statements[0]!.display!.value).toBe(0);
    expect(one('F := 30 kN\nR := 10 kN + 7.5 kN + 12.500000000000002 kN\nd := R - F').statements[2]!.display!.value).toBe(0);
    // A small difference of its own stays: 1 − cos(1e-7) has digits.
    expect(one('a := 1 - cos(1e-7)').statements[0]!.display!.value).toBeGreaterThan(4e-15);
  });

  it('fits a cubic through cubic data without noise in the other powers', () => {
    const r = one('xs := [0, 0.5, 1, 1.5, 2, 2.5, 3]\nys := xs^3\nf := polyfit(xs, ys, 3)');
    const fit = (r.values.get('f') as { fit?: { coefficients: readonly { value: { si: number } }[] } }).fit!;
    const [c0, c1, c2, c3] = fit.coefficients.map((c) => c.value.si);
    expect([c0, c1, c2]).toEqual([0, 0, 0]);
    expect(c3).toBeCloseTo(1, 12);
  });

  it('knows a factorial exactly as far as an exact form goes, and says when places cannot be kept', () => {
    const r = one('a := factorial(23) {decimals=0}\nb := factorial(30) {decimals=0}\nc := 1234567890.5 {decimals=2}');
    expect(r.statements[0]!.display!.whole).toBe(25852016738884976640000n);
    expect(r.statements[0]!.diagnostics).toEqual([]);
    expect(r.statements[1]!.display!.whole).toBeUndefined();
    expect(r.statements[1]!.diagnostics.map((d) => d.code)).toEqual(['I-DECIMALS-PRECISION']);
    expect(r.statements[2]!.diagnostics).toEqual([]);
  });

  it('gives a determinant in the unit of its items', () => {
    const d = one('K := [2, -1 | -1, 2] kN/m\nd := det(K)').statements[1]!.display!;
    expect([d.value, d.unit]).toEqual([3, '(kN/m)²']);
  });
});
