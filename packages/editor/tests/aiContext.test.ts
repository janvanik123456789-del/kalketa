import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { languageGuide, SHEET_FRAGMENTS, sheetContext } from '../src/logic/aiContext.js';

describe('what the AI sees of a sheet', () => {
  it('gets the text, the findings in English and the results by line', () => {
    const result = evaluateSheet('L := 6 m\nq := 10 kN/m\nM := q·L²/8 | kN·m\nM =\ncheck "Bending": M ≤ 40 kN·m\nx := y');
    const context = sheetContext('Beam', result);
    expect(context.title).toBe('Beam');
    expect(context.source).toContain('M := q·L²/8');
    expect(context.findings.some((f) => f.startsWith('line 5: check FAILED (Bending), utilization 113 %'))).toBe(true);
    expect(context.findings.some((f) => /^line 6: error E-/.test(f))).toBe(true);
    expect(context.findings).toContain('line 3 = 45 kN·m');
  });

  it('knows the built-in functions from the core', () => {
    expect(languageGuide()).toMatch(/Built-in functions: .*sqrt\(/);
  });

  it('shows sample fragments that all run clean', () => {
    expect(languageGuide()).toContain('--- headings, text and comments');
    for (const fragment of SHEET_FRAGMENTS) {
      const result = evaluateSheet(fragment.source);
      const found = [...result.diagnostics, ...result.statements.flatMap((s) => s.diagnostics)].map((d) => d.code);
      expect(found, fragment.topic).toEqual([]);
    }
  });
});

describe('what the AI sees of the tables', () => {
  it('gets the columns with units, the source, the rows and which line read which row', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { defaultRegistry } = await import('@kalketa/core');
    const { loadTable } = await import('@kalketa/sheet');
    const dir = join(import.meta.dirname, '../../../reference/R1-nosnik');
    const tables = ['Materialy', 'Profily_IPE'].map((name) => {
      const loaded = loadTable(readFileSync(join(dir, 'tables', name, 'schema.json'), 'utf8'), readFileSync(join(dir, 'tables', name, 'data.csv'), 'utf8'), defaultRegistry);
      return loaded.table!;
    });
    const result = evaluateSheet(readFileSync(join(dir, 'nosnik.cc'), 'utf8'), { tables });
    const findings = sheetContext('Posouzení nosníku N1', result).findings;
    const text = findings.join('\n');
    expect(text).toContain('Table Profily_IPE, 11 rows, key oznaceni; source: Průřezové charakteristiky');
    expect(text).toContain('columns: oznaceni | h [mm] | b [mm] | A [cm²] | I_y [cm⁴] | W_y [cm³] | G [kg/m]');
    expect(findings).toContain('IPE 80 | 80 | 46 | 7.64 | 80.14 | 20.03 | 6');
    expect(findings).toContain('line 8 read Profily_IPE "IPE 200"');
    expect(findings).toContain('line 13 read Profily_IPE "IPE 200" column I_y');
    expect(findings).toContain('line 23 read Profily_IPE "IPE 220" column G');
    expect(text).not.toMatch(/\brow \d/);
  });
});
