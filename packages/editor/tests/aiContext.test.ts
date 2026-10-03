import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { languageGuide, sheetContext } from '../src/logic/aiContext.js';

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
});
