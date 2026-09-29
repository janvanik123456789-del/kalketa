/**
 * Reference calculations (docs/01-filozofie.md, ch. 10): every *.expected.json
 * next to a sheet lists independently verified results that the sheet must
 * reproduce without any diagnostics.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@calccanvas/core';

interface Expected {
  readonly sheet: string;
  readonly verifiedBy: string;
  readonly relativeTolerance: number;
  readonly values: Readonly<Record<string, { value: number; unit: string } | { boolean: boolean }>>;
}

const ROOT = import.meta.dirname;
const cases = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(join(ROOT, d.name))
      .filter((f) => f.endsWith('.expected.json'))
      .map((f) => ({ dir: join(ROOT, d.name), name: `${d.name}/${f}` })),
  );

describe.each(cases)('$name', ({ dir, name }) => {
  const expected = JSON.parse(readFileSync(join(dir, name.split('/')[1]!), 'utf8')) as Expected;
  const result = evaluateSheet(readFileSync(join(dir, expected.sheet), 'utf8'));

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
    expect(statement!.display?.unit).toBe(want.unit);
    const got = statement!.display!.value;
    expect(Math.abs(got - want.value)).toBeLessThanOrEqual(Math.abs(want.value) * expected.relativeTolerance);
  });
});
