import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, evaluateSheet, type Table } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, toText } from '../src/index.js';

const cs = catalogFor('cs');
const plain = (text: string) => text.replace(/\s+/g, ' ');

function tables(): Table[] {
  const make = (name: string, rows: string[][]) =>
    buildTable({ name, columns: [{ name: 'typ', type: 'text' }, { name: 'cena', type: 'quantity', unit: 'CZK' }] }, rows, defaultRegistry).table;
  return [make('Stridace', [['S-10', '45000']]), make('Kabely', [['SOLAR 4', '32']])];
}

function lines(source: string, index = -1): string[] {
  const doc = buildPrintDocument(evaluateSheet(source, { tables: tables() }), { catalog: cs, registry: defaultRegistry, digits: 6, title: 'T' });
  const block = doc.blocks.at(index)!;
  return block.kind === 'equation' ? block.lines.map((l) => plain(`${l.lhs ? `${toText(l.lhs)} = ` : ''}${toText(l.rhs)}`)) : [];
}

describe('readable printouts', () => {
  it('tell the same column of two rows apart', () => {
    const [formula] = lines('s := pick(Stridace, "S-10")\nk := pick(Kabely, "SOLAR 4")\nC := s.cena + 60·k.cena');
    expect(formula).toBe('C = cena(s)+60·cena(k)');
  });

  it('do not repeat a name taken over from a column of the same name', () => {
    expect(lines('s := pick(Stridace, "S-10")\ncena := s.cena')).toEqual(['cena = 45 000 CZK']);
  });

  it('print a date once', () => {
    expect(lines('d := 2026-10-03')).toEqual(['d = 3. 10. 2026']);
  });

  it('print a unit after a name without parentheses', () => {
    expect(lines('kurz := 24.7\nunit EUR := kurz·CZK')[0]).toBe('1 EUR = kurz CZK');
  });
});
