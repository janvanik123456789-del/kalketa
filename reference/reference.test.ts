/**
 * Reference calculations (docs/01-filozofie.md, ch. 10): every *.expected.json
 * next to a sheet lists independently verified results that the sheet must
 * reproduce without any diagnostics. Tables are loaded from tables/<Name>/
 * in the same folder.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, type Table } from '@calccanvas/core';
import { loadTable } from '@calccanvas/sheet';

type ExpectedValue = { value: number; unit: string } | { boolean: boolean } | { row: string };

interface Expected {
  readonly sheet: string;
  readonly verifiedBy: string;
  readonly relativeTolerance: number;
  readonly values: Readonly<Record<string, ExpectedValue>>;
}

const ROOT = import.meta.dirname;
const cases = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(join(ROOT, d.name))
      .filter((f) => f.endsWith('.expected.json'))
      .map((f) => ({ dir: join(ROOT, d.name), file: f, name: `${d.name}/${f}` })),
  );

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

  it.each(Object.entries(expected.values))('%s', (variable, want) => {
    const statement = result.statements.find((s) => s.statement.kind === 'definition' && s.statement.name === variable);
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
