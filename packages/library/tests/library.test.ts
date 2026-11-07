/**
 * Every built-in entry of the formula library (docs/navrhy/KNIHOVNA-VZORCU.md, chapter Ověřování): it calculates in
 * both languages alike, its checks agree, it rearranges for each quantity and the equation holds again, zero inputs
 * give a readable error instead of NaN, its names do not read as units, and all of them in one sheet get on.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateSheet, type SheetResult } from '@kalketa/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SHEET, insertion, readEntries, renameIn, search, sheetNames, sides, type Entry } from '../src/index.js';

const DIR = join(import.meta.dirname, '../formulas');
const files = Object.fromEntries(
  readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, readFileSync(join(DIR, f), 'utf8')]),
);
const { entries, problems } = readEntries(files);

const errors = (r: SheetResult) => r.diagnostics.filter((d) => d.severity === 'error');
const ALLOWED = new Set(['W-EXAMPLE-VALUE']);
const others = (r: SheetResult) => r.diagnostics.filter((d) => !ALLOWED.has(d.code)).map((d) => d.code);
const si = (r: SheetResult, name: string) => {
  const v = r.values.get(name);
  return v?.type === 'quantity' ? v.si : NaN;
};

/** The difference of the two sides of the equation, relative to their size, from the values of a sheet. */
function residual(entry: Entry, lines: readonly string[]): number {
  const [left, right] = sides(entry);
  const r = evaluateSheet([...lines, `kalketa_l := ${left}`, `kalketa_r := ${right}`].join('\n'));
  const a = si(r, 'kalketa_l');
  const b = si(r, 'kalketa_r');
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
}

describe('formula library', () => {
  it('reads every file', () => {
    expect(problems).toEqual([]);
    expect(entries.length).toBeGreaterThanOrEqual(30);
  });

  for (const entry of entries) {
    describe(entry.id, () => {
      const names = Object.keys(entry.quantities);

      it('calculates with its examples, alike in both languages, names read as names', () => {
        for (const target of names) {
          const cs = evaluateSheet(insertion(entry, target, EMPTY_SHEET, 'cs').lines.join('\n'));
          const en = evaluateSheet(insertion(entry, target, EMPTY_SHEET, 'en').lines.join('\n'));
          expect(others(cs), `${target}:\n${cs.source}`).toEqual([]);
          expect(Number.isFinite(si(cs, target)), cs.source).toBe(true);
          expect(si(cs, target)).toBe(si(en, target));
        }
      });

      it('agrees with its checks', () => {
        for (const check of entry.checks) {
          const [[target, expected]] = Object.entries(check.expect) as [[string, string]];
          const given = Object.entries(check.given).map(([q, v]) => `${q} := ${v}`);
          const lines = [...given, insertion(entry, target, EMPTY_SHEET, 'en').lines.at(-1)!, `kalketa_expected := ${expected}`];
          const r = evaluateSheet(lines.join('\n'));
          expect(errors(r), r.source).toEqual([]);
          expect(si(r, target) / si(r, 'kalketa_expected'), r.source).toBeCloseTo(1, 4);
        }
      });

      it('rearranges for each quantity and the equation holds', () => {
        for (const target of names) {
          const ins = insertion(entry, target, EMPTY_SHEET, 'en');
          expect(residual(entry, ins.lines), ins.lines.join('\n')).toBeLessThan(1e-6);
        }
      });

      it('gives no NaN for a zero input', () => {
        for (const target of names) {
          for (const zeroed of names.filter((q) => q !== target)) {
            const lines = insertion(entry, target, EMPTY_SHEET, 'en').lines.map((l) => (l.startsWith(`${zeroed} := `) ? l.replace(/:= -?[\d.]+/, ':= 0') : l));
            const r = evaluateSheet(lines.join('\n'));
            const value = r.values.get(target);
            const row = r.statements[r.statements.length - 1]!;
            if (value?.type === 'quantity') expect(Number.isNaN(value.si), lines.join('\n')).toBe(false);
            else expect(['error', 'blocked']).toContain(row.status);
          }
        }
      });
    });
  }

  it('gets on with all entries in one sheet, each in its position', () => {
    const lines = entries.flatMap((e, i) => {
      const names = Object.keys(e.quantities);
      return [`## ${e.title.en} {pos}`, ...insertion(e, names[i % names.length]!, EMPTY_SHEET, 'cs').lines];
    });
    const r = evaluateSheet(lines.join('\n'));
    // A note that l of l/s is a name in another position may stay: it is no error, only a hint.
    expect(r.diagnostics.filter((d) => !ALLOWED.has(d.code) && d.severity !== 'info').map((d) => `${d.code} ${d.span?.line}`)).toEqual([]);
  });
});

describe('insertion into a sheet', () => {
  const bending = entries.find((e) => e.id === 'ohybove-napeti')!;

  it('takes a quantity the sheet has, renames one of another kind', () => {
    const sheet = evaluateSheet('M := 54 kN*m\nW := 3 m');
    const ins = insertion(bending, 'σ', sheetNames(sheet, 2), 'cs');
    expect(ins.reused).toEqual(['M']);
    expect(ins.renamed).toEqual([{ from: 'W', to: 'W_2' }]);
    const r = evaluateSheet([sheet.source, ...ins.lines].join('\n'));
    expect(errors(r)).toEqual([]);
    expect(si(r, 'σ')).toBeCloseTo(54e3 / 324e-6, -3);
  });

  it('gives the result another name when the sheet has it', () => {
    const sheet = evaluateSheet('σ := 100 MPa');
    const ins = insertion(bending, 'σ', sheetNames(sheet, 1), 'cs');
    expect(ins.target).toBe('σ_2');
    expect(errors(evaluateSheet([sheet.source, ...ins.lines].join('\n')))).toEqual([]);
  });

  it('does not take a name defined below the place', () => {
    const sheet = evaluateSheet('a := 1\nM := 54 kN*m');
    const ins = insertion(bending, 'σ', sheetNames(sheet, 1), 'cs');
    expect(ins.reused).toEqual([]);
    expect(ins.inputs).toContain('M_2');
  });

  it('marks example values and warns of them', () => {
    const ins = insertion(bending, 'W', EMPTY_SHEET, 'cs');
    expect(ins.lines[0]).toBe("σ := 160 MPa {example}  ' ohybové napětí");
    expect(ins.lines.at(-1)).toBe('W := M/σ | cm^3  source "Kalketa, vzor R1"');
    const r = evaluateSheet(ins.lines.join('\n'));
    expect(r.diagnostics.filter((d) => d.code === 'W-EXAMPLE-VALUE').map((d) => d.params.name)).toEqual(['σ', 'M']);
  });

  it('solves from a guess what no formula gives', () => {
    const lmtd = entries.find((e) => e.id === 'stredni-logaritmicky-rozdil')!;
    expect(insertion(lmtd, 'ΔT_A', EMPTY_SHEET, 'cs').numeric).toBe(true);
    expect(insertion(lmtd, 'ΔT_ln', EMPTY_SHEET, 'cs').numeric).toBe(false);
  });

  it('renames a name, not a part of another', () => {
    expect(renameIn('σ == σ_x + M/σ', new Map([['σ', 'σ_2']]))).toBe('σ_2 == σ_x + M/σ_2');
  });
});

describe('search', () => {
  it('finds by a word without accents, a quantity and its name', () => {
    expect(search(entries, 'ohybove', 'cs').map((e) => e.id)[0]).toBe('ohybove-napeti');
    expect(search(entries, 'Re', 'cs').map((e) => e.id)).toContain('blasius');
    expect(search(entries, 'výkon', 'cs').map((e) => e.id)).toContain('vykon-cerpadla');
    expect(search(entries, 'bending', 'cs').map((e) => e.id)).toContain('ohybove-napeti');
    expect(search(entries, '', 'cs')).toHaveLength(entries.length);
  });
});
