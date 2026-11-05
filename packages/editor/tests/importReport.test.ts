import { describe, expect, it } from 'vitest';
import { CATALOGS } from '@kalketa/i18n';
import type { SmathReport } from '@kalketa/import';
import { importReportParts } from '../src/logic/importedSmath.js';

const empty: SmathReport = { formulas: 2, converted: 2, texts: 1, left: [], frozen: [], signs: [], renamed: [], agree: 1, differ: [], notCompared: 0 };

describe('the report of an import', () => {
  it('a clean import has only its summary', () => {
    const { summary, sections } = importReportParts(CATALOGS['cs']!, empty);
    expect(summary).toEqual(['Převedeno 2 z 2 vzorců, 1 textů.', 'Uložené výsledky SMathu: 1 souhlasí, 0 se liší, 0 se nedalo porovnat.']);
    expect(sections).toEqual([]);
  });

  it('says each thing with its reason, what differs first', () => {
    const report: SmathReport = {
      ...empty,
      left: [
        { written: 'foo(1)', why: { kind: 'function', name: 'foo' } },
        { written: 'a := 1', why: { kind: 'form' } },
        { written: 'x + 1', why: { kind: 'assigned', name: 'x' } },
        { written: 'plot', why: { kind: 'region', name: 'plot' } },
        { written: 'b', why: { kind: 'error', code: 'E-TYPE' } },
        { written: 'c', why: { kind: 'unit', name: 'h' } },
      ],
      frozen: ['s', 'GCD'],
      signs: [{ from: 'ripple_%', to: 'ripple_pct' }],
      renamed: [{ from: 'a', to: 'a_2' }],
      differ: [{ name: 'q', stored: 2, here: 3, unit: 'm' }],
    };
    const { sections } = importReportParts(CATALOGS['en']!, report);
    expect(sections.map((s) => s.kind)).toEqual(['differ', 'frozen', 'renamed', 'left']);
    expect(sections[0]!.lines).toEqual(['q: SMath 2 m, here 3 m']);
    expect(sections[1]!.lines[0]).toContain('s, GCD');
    expect(sections[2]!.lines).toHaveLength(2);
    expect(sections[2]!.lines[0]).toContain('ripple_pct');
    expect(sections[3]!.title).toContain('6');
    expect(sections[3]!.lines[0]).toContain('foo(1)');
    expect(sections[3]!.lines[0]).toContain('foo');
    expect(sections[3]!.lines[2]).toContain('assigned by a line left as text');
    expect(sections[3]!.lines[3]).toContain('plot');
    expect(sections[3]!.lines[4]).toContain('E-TYPE');
    for (const line of sections.flatMap((s) => s.lines)) expect(line).not.toMatch(/\{[a-z]+\}|import\./);
  });
});
