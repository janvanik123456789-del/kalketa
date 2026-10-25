import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlocksHtml, toText } from '../src/index.js';

const SHEET = [
  'table Varianty: {variants=B}',
  '    | varianta | b [mm] | h [mm] |',
  '    | A        | 200    | 300    |',
  '    | B        | 250    | 400    |',
  'M := 120 kN·m',
  'W := b·h^2/6 | mm^3',
  'σ := M/W | MPa',
  'check σ ≤ 20 MPa',
  'porovnani := compare(Varianty, W, σ)',
].join('\n');

describe('variants in print', () => {
  const doc = buildPrintDocument(evaluateSheet(SHEET), { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'T' });

  it('set the chosen variant apart and say the calculation goes on with it', () => {
    const variants = doc.blocks[0]!;
    expect(variants.kind === 'datatable' && [variants.chosen, variants.note]).toEqual([1, 'Výpočet pokračuje s variantou B.']);
  });

  it('print the comparison as a table: the values, the largest utilization and a mark for the checks', () => {
    const compared = doc.blocks.at(-1)!;
    expect(compared.kind === 'equation' && toText(compared.lines[0]!.rhs)).toBe('porovnání variant z tabulky Varianty');
    expect(compared.kind === 'equation' && compared.table?.rows.map((row) => row.map((cell) => cell.replace(/\s/g, ' ')))).toEqual([
      ['A', '3 000 000', '40', '200', '✗'],
      ['B', '6 667 000', '18', '90', '✓'],
    ]);
    const html = renderBlocksHtml(doc.blocks, catalogFor('cs'));
    expect(html.match(/<tr class="chosen">/g)?.length).toBe(2);
  });
});
