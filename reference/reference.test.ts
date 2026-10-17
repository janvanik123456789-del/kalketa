/**
 * Reference calculations (docs/01-filozofie.md, ch. 10): every *.expected.json
 * next to a sheet lists independently verified results that the sheet must
 * reproduce without any diagnostics. Tables are loaded from tables/<Name>/
 * in the same folder.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, toDisplay, type Table } from '@kalketa/core';
import { loadTable } from '@kalketa/sheet';

type ExpectedValue = { value: number; unit: string } | { boolean: boolean } | { row: string };

interface Expected {
  readonly sheet: string;
  readonly verifiedBy: string;
  readonly relativeTolerance: number;
  readonly values: Readonly<Record<string, ExpectedValue>>;
  /** Every check of the sheet, in order. */
  readonly checks?: readonly { label: string; passed: boolean; utilization?: number }[];
}

const ROOT = import.meta.dirname;
const folders = (dir: string) => readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
// Sorted by field, in a subfield or not: <field>/[<subfield>/]<case>/*.expected.json.
const casesIn = (dir: string, depth: number): { dir: string; file: string; name: string }[] =>
  folders(dir).flatMap((name) => {
    const here = join(dir, name);
    const expected = readdirSync(here).filter((f) => f.endsWith('.expected.json'));
    if (expected.length > 0) return expected.map((f) => ({ dir: here, file: f, name: `${name}/${f}` }));
    return depth > 0 ? casesIn(here, depth - 1) : [];
  });
const cases = folders(ROOT).flatMap((field) => casesIn(join(ROOT, field), 1));

function loadTables(dir: string): Table[] {
  const root = join(dir, 'tables');
  if (!existsSync(root)) return [];
  return readdirSync(root).map((name) => {
    const folder = join(root, name);
    const loaded = loadTable(readFileSync(join(folder, 'schema.json'), 'utf8'), readFileSync(join(folder, 'data.csv'), 'utf8'), defaultRegistry);
    expect(loaded.diagnostics, `table ${name}`).toEqual([]);
    return loaded.table;
  });
}

describe.each(cases)('$name', ({ dir, file }) => {
  const expected = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Expected;
  const result = evaluateSheet(readFileSync(join(dir, expected.sheet), 'utf8'), { tables: loadTables(dir) });

  it('evaluates without diagnostics', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('documents how the results were verified', () => {
    expect(expected.verifiedBy.length).toBeGreaterThan(20);
  });

  it('has the expected checks', () => {
    const want = expected.checks ?? [];
    expect(result.checks.map((c) => [c.label, c.passed])).toEqual(want.map((c) => [c.label, c.passed]));
    want.forEach((c, i) => {
      if (c.utilization === undefined) return;
      const got = result.checks[i]!.utilization!;
      expect(Math.abs(got - c.utilization), c.label).toBeLessThanOrEqual(c.utilization * expected.relativeTolerance);
    });
  });

  it.each(Object.entries(expected.values))('%s', (variable, want) => {
    // A value is defined by ":=", or found by a solve line.
    const solved = result.statements.flatMap((s) => s.solutions ?? []).find((s) => s.name === variable);
    // The roots of a solve under conditions are names as printed (x_1, x_2): values of the sheet.
    const named = result.values.get(variable);
    const statement = solved
      ? { value: solved.value, display: solved.display }
      : (result.statements.find((s) => s.statement.kind === 'definition' && s.statement.name === variable) ??
        (named?.type === 'quantity' ? { value: named, display: toDisplay(named, defaultRegistry) } : undefined));
    expect(statement, `missing ${variable}`).toBeDefined();
    if ('boolean' in want) {
      expect(statement!.value).toEqual({ type: 'boolean', value: want.boolean });
      return;
    }
    if ('row' in want) {
      expect(statement!.value).toMatchObject({ type: 'row', label: want.row });
      return;
    }
    expect(statement!.display?.unit).toBe(want.unit);
    const got = statement!.display!.value;
    expect(Math.abs(got - want.value)).toBeLessThanOrEqual(Math.abs(want.value) * expected.relativeTolerance);
  });
});

// The theory beside a sample (podklady.md): every formula in it (```kalk) holds as written.
const notes = folders(ROOT).flatMap((field) => {
  const found: { name: string; path: string }[] = [];
  const walk = (dir: string, depth: number) => {
    for (const name of folders(dir)) {
      const here = join(dir, name);
      if (existsSync(join(here, 'podklady.md'))) found.push({ name, path: join(here, 'podklady.md') });
      else if (depth > 0) walk(here, depth - 1);
    }
  };
  walk(join(ROOT, field), 1);
  return found;
});

describe.each(notes)('$name/podklady.md', ({ path }) => {
  const blocks = [...readFileSync(path, 'utf8').matchAll(/```kalk\r?\n([\s\S]*?)```/g)].map((m) => m[1]!);
  it('has formulas to check', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });
  it.each(blocks.map((block, i) => [i + 1, block] as const))('formula %i holds', (_, block) => {
    expect(evaluateSheet(block).diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});
