import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { aiExportText } from '../src/logic/aiExport.js';

describe('a calculation exported for an AI in a chat', () => {
  const source = '# Činka\n## Zadání\n"Vypočtěte hmotnost činky."\nm := 2 kg\nF := m·g_x';
  const result = evaluateSheet(source);
  const text = aiExportText({ title: 'Činka', source, result, tables: [], catalog: catalogFor('cs') });

  it('holds the request, the sheet in one block, its messages with the line, and the language', () => {
    expect(text.startsWith('# Činka\n')).toBe(true);
    expect(text).toContain('Toto je výpočet v programu Kalketa.');
    expect(text).toContain('```\n# Činka\n## Zadání');
    expect(text).toMatch(/- line 5 `F := m·g_x`: E-UNDEFINED /);
    expect(text).toContain('## Checklist before every answer');
  });

  it('says so when the calculation has no messages', () => {
    const clean = 'a := 1 m';
    expect(aiExportText({ title: 'A', source: clean, result: evaluateSheet(clean), tables: [], catalog: catalogFor('en') })).toContain('- none: the calculation has no errors');
  });
});

import { unitWithPowers } from '../src/logic/tableEdit.js';

describe('a unit typed in the head of a table column', () => {
  it('gets its powers as superscripts', () => {
    expect(unitWithPowers('kg/m3')).toBe('kg/m³');
    expect(unitWithPowers('m^3')).toBe('m³');
    expect(unitWithPowers('s^-1')).toBe('s⁻¹');
    expect(unitWithPowers('N/mm2')).toBe('N/mm²');
    expect(unitWithPowers('kN·m')).toBe('kN·m');
  });
});

import { newTable, pasteGrid } from '../src/logic/tableEdit.js';

describe('a table pasted into a cell of a table', () => {
  it('fills an empty table whole, with its columns and units', () => {
    const pasted = pasteGrid(newTable('Materialy'), 0, 0, '| Nazev | Rho [kg/m3] |\n|---|---|\n| ocel | 7850 |\n| hlinik | 2700 |')!;
    expect(pasted.schema.name).toBe('Materialy');
    expect(pasted.schema.columns.map((c) => [c.name, c.type, c.unit])).toEqual([['Nazev', 'text', undefined], ['Rho', 'quantity', 'kg/m³']]);
    expect(pasted.rows).toEqual([['ocel', '7850'], ['hlinik', '2700']]);
  });

  it('fills cells from the one pasted into, as a spreadsheet, rows added and its own head left out', () => {
    const table = { ...newTable('T'), rows: [['a', '1']] };
    const pasted = pasteGrid(table, 0, 0, 'nazev\thodnota\nb\t2\nc\t3')!;
    expect(pasted.rows).toEqual([['b', '2'], ['c', '3']]);
    expect(pasteGrid(table, 0, 1, '7')).toBeUndefined();
  });
});
