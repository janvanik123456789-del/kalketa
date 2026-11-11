/**
 * The sheets an outside AI (Strata) wrote to test the core, 2026-11-09 to 2026-11-11 (batches 2 to 7 and its
 * one-by-one tasks, folder Testovaci_priklady/STRES_TESTY), as lasting tests:
 *
 * - every line of each sheet with its value as shown (6 digits) and the codes it is reported with, against a
 *   record: a change is either a fix (the record is updated, saying why in the commit) or a fault;
 * - the values whose independent reference (mpmath, fractions, closed forms; computed by Strata's scripts,
 *   rerun 2026-11-11) agrees within 1e-9 (1e-6 for integrated ODEs and derivatives), at full precision;
 * - the faults found and checked again by hand against mpmath, as `it.fails` until they are fixed.
 *
 * Left out: a sheet needing a table file (d7-10), a smoke sheet, and a timing sheet of 6 s (d3-23).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SheetSession, defaultRegistry, toDisplay, type DisplayValue, type SheetResult } from '../src/index.js';

const folder = new URL('./data/strata/', import.meta.url);
const sheets = readdirSync(folder).filter((f) => f.endsWith('.cc')).map((f) => f.slice(0, -3)).sort();
const references = JSON.parse(readFileSync(new URL('references.json', folder), 'utf8')) as Record<string, Record<string, [string, number]>>;

const run = (source: string): SheetResult => new SheetSession({ registry: defaultRegistry }).update(source, { citable: new Set() });
const sheet = (name: string) => run(readFileSync(new URL(`${name}.cc`, folder), 'utf8'));

const shown = (d: DisplayValue) => `${Number(d.value.toPrecision(6))}${d.unit ? ` ${d.unit}` : ''}`;

/** One line per statement: where, what is shown, what is said (as in stress.test.ts). */
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

/** The value of a name as shown, at full precision: a definition, a solution of a system, or a root (x, x_1, x_2). */
function shownValue(result: SheetResult, name: string): number | undefined {
  for (const r of result.statements) {
    const s = r.statement;
    if ('name' in s && s.name === name && r.display) return r.display.value;
    const solved = r.solutions?.find((found) => found.name === name);
    if (solved) return solved.display.value;
    if (s.kind === 'solve' && r.roots && s.unknowns[0]) {
      const roots = r.roots.roots;
      const at = roots.findIndex((_, i) => (roots.length > 1 ? `${s.unknowns[0]!.name}_${i + 1}` : s.unknowns[0]!.name) === name);
      if (at >= 0) return toDisplay(roots[at]!.value, defaultRegistry).value;
    }
  }
  return undefined;
}

describe('Strata sheets as recorded', () => {
  for (const name of sheets) {
    it(name, async () => {
      await expect(record(sheet(name)) + '\n').toMatchFileSnapshot(`./data/strata/records/${name}.txt`);
    });
  }
});

describe('Strata sheets against independent references', () => {
  for (const [name, values] of Object.entries(references)) {
    it(name, () => {
      const result = sheet(name);
      for (const [quantity, [reference, tolerance]] of Object.entries(values)) {
        const value = shownValue(result, quantity);
        const expected = Number(reference);
        expect(value, quantity).toBeDefined();
        expect(Math.abs(value! - expected) / Math.abs(expected), `${quantity}: ${value} against ${reference}`).toBeLessThanOrEqual(tolerance);
      }
    });
  }
});

/** The faults found, each checked again against mpmath 1.3 (40 digits) on 2026-11-11; `it.fails` until fixed. */
describe('faults Strata found', () => {
  const value = (source: string, name: string) => shownValue(run(source), name);
  const codes = (source: string) => run(source).diagnostics.map((d) => d.code);
  const near = (got: number | undefined, expected: number, tolerance = 1e-9) => {
    expect(got).toBeDefined();
    expect(Math.abs(got! - expected) / Math.abs(expected)).toBeLessThanOrEqual(tolerance);
  };

  // Batch 3 N1: summed from the left, 1 of the two ones was lost (math.fsum gives 2); compensated since 2026-11-11.
  it('sums numbers of very different size without losing a term', () => {
    near(value('s := sum([1e16, 1, -1e16, 1])', 's'), 2);
    near(value('m := mean([1e16, 1, -1e16, 1])', 'm'), 0.5);
    near(value('s := sum(x, x: 1 .. 2)', 's'), 3);
  });
  // Batch 3 N1 was no fault: the variance is two-pass. Its 2e-4 came from the inputs (1 + 1e-13 is no double); the
  // deviation of the doubles really given is 1.2912526594371386e-13 (exact, fractions), Kalketa's within 3e-8.
  it('takes the deviation of nearly equal values', () =>
    near(value('s := stdev([1, 1 + 1e-13, 1 - 1e-13, 1 + 2e-13])', 's'), 1.2912526594371386e-13, 1e-7));

  // Batch 5 N1: the series at a small x (4.16e-17 and −8.8e-17 now).
  it.fails('gives besselj at a small x', () => {
    near(value('b := besselj(5, 1e-8)', 'b'), 2.6041666666666666558e-44);
    near(value('b := besselj(8, 1e-6)', 'b'), 9.688120039682270568e-56);
    near(value('b := besselj(3, 1e-4)', 'b'), 2.0833333320312500003e-14);
  });

  // Batch 5 N2-N4: quantiles in the right tail (the left one is right), chi2inv with one degree in the left one.
  it.fails('gives quantiles in the right tail', () => {
    near(value('q := norminv(1 - 1e-12)', 'q'), 7.0344838253011319298);
    near(value('q := tinv(1 - 1e-12, 1)', 'q'), 318309886183.79067154);
    near(value('q := chi2inv(1 - 1e-12, 2)', 'q'), 55.262042231857096416);
  });
  it.fails('gives chi2inv with one degree of freedom in the left tail', () => near(value('q := chi2inv(1e-12, 1)', 'q'), 1.5707963267948966192e-24));

  // Batch 5 N5: a finite probability whose binomial coefficient alone overflows.
  it.fails('gives binopdf for a large n', () => near(value('p := binopdf(5000, 10000, 0.5)', 'p'), 0.0079786461393821537604));

  // Batch 5 N6: sqrt(-4) says the domain, the power said "not a finite number".
  it.fails('says the domain for a negative base under a fractional power', () => expect(codes('w := (-4)^0.5')).toEqual(['E-DOMAIN']));

  // Batch 6 N1: roots of a polynomial given by the name of its function.
  it.fails('takes roots of a polynomial given as a function', () => expect(codes('q(x) := x^2 - 3·x + 2\nr := roots(q(x), x)')).toEqual([]));

  // Batch 7 N1: names are read as Greek (lambda → λ), the header of the table is not.
  it('reads a table column written as a Greek name in Latin letters', () =>
    near(value('table K:\n    | lambda | chi |\n    | 0.1 | 0.9 |\n    | 0.3 | 0.7 |\nc := interpolate(K, lambda: 0.2).chi', 'c'), 0.8));

  // Batch 3 N4 and the one-by-one task 03 N9: a date as the key of a row.
  it('picks a row by a date', () =>
    near(value('table Kurzy:\n    | datum | EUR |\n    | 2026-03-01 | 25.40 |\n    | 2026-06-30 | 25.62 |\nd := pick(Kurzy, 2026-06-30).EUR', 'd'), 25.62));

  // Task 01 N2: first() steps by whole units, so between 0.01 m and 0.49 m it has no point to try.
  it.fails('finds the first point between bounds below one unit', () =>
    expect(codes('g(x) := x^2 - 0.1 m^2\nf := first(g(x) > 0 m^2, x: 0.01 m .. 0.49 m)')).toEqual([]));

  // Batch 3 N6 and batch 4 item 1: a missing right bracket takes the next lines with it.
  it('calculates the lines after a missing right bracket', () => expect(value('a := sqrt(4\nb := 5\nc := b + 1', 'c')).toBe(6));
});
