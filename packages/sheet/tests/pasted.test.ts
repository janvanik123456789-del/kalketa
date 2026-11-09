import { describe, expect, it } from 'vitest';
import { pastedTable } from '../src/csv.js';

describe('a table pasted from elsewhere', () => {
  it('reads cells of Excel, CSV and a Markdown table of a model, also in a code block', () => {
    expect(pastedTable('profil\tA [cm²]\nIPE 200\t28,5\nIPE 220\t33,4\n')).toEqual([['profil', 'A [cm²]'], ['IPE 200', '28,5'], ['IPE 220', '33,4']]);
    expect(pastedTable('x;y\n1;2\n3;4')).toEqual([['x', 'y'], ['1', '2'], ['3', '4']]);
    const markdown = '| Profil | A [cm²] |\n|---|---:|\n| IPE 200 | 28.5 |\n| IPE 220 | 33.4 |';
    expect(pastedTable(markdown)).toEqual([['Profil', 'A [cm²]'], ['IPE 200', '28.5'], ['IPE 220', '33.4']]);
    expect(pastedTable('Tady je tabulka:\n```\n' + markdown + '\n```\nHotovo.')).toEqual(pastedTable(markdown));
  });

  it('says no to text that is no table', () => {
    expect(pastedTable('a := 1')).toBeUndefined();
    expect(pastedTable('Jedna věta.\nDruhá věta.')).toBeUndefined();
    expect(pastedTable('| a | b |\n|---|---|\n| 1 |')).toBeUndefined();
  });
});
