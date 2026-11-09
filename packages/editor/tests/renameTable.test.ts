import { describe, expect, it } from 'vitest';
import { newDocument } from '@kalketa/sheet';
import { renameTable, withNameReplaced } from '../src/logic/tableEdit.js';

describe('a table renamed', () => {
  it('is renamed where the sheet reads it, not in text, comments or keys', () => {
    const source = '"Tabulka2 je v Databázi."\nmat := pick(Tabulka2; "Tabulka2")   \' z Tabulka2\nρ := Tabulka2.hustota[1]\nx := pick(Tabulka2, "ocel").hustota';
    expect(withNameReplaced(source, 'Tabulka2', 'Materialy')).toBe('"Tabulka2 je v Databázi."\nmat := pick(Materialy; "Tabulka2")   \' z Tabulka2\nρ := Materialy.hustota[1]\nx := pick(Materialy, "ocel").hustota');
  });

  it('renames it in the document, its data layer and its schema; refuses a taken or invalid name', () => {
    const base = newDocument('T', 'm := pick(Tabulka2, "ocel")');
    const stored = { schemaJson: JSON.stringify({ name: 'Tabulka2', key: 'nazev', columns: [{ name: 'nazev', type: 'text' }] }), dataCsv: 'nazev\nocel\n' };
    const doc = { ...base, tables: new Map([['Tabulka2', stored], ['Jina', stored]]), layers: base.layers.map((l) => (l.kind === 'data' ? { ...l, tables: ['Tabulka2', 'Jina'] } : l)) };
    const renamed = renameTable(doc, 'Tabulka2', 'Materialy')!;
    expect([...renamed.tables.keys()]).toEqual(['Materialy', 'Jina']);
    expect(JSON.parse(renamed.tables.get('Materialy')!.schemaJson).name).toBe('Materialy');
    expect(renamed.layers.find((l) => l.kind === 'data')!.tables).toEqual(['Materialy', 'Jina']);
    expect(renamed.source).toBe('m := pick(Materialy, "ocel")');
    expect(renameTable(doc, 'Tabulka2', 'Jina')).toBeUndefined();
    expect(renameTable(doc, 'Tabulka2', 'Mate rialy')).toBeUndefined();
  });
});

import { usedTables } from '../src/logic/tableEdit.js';

describe('tables a calculation reads', () => {
  it('are found by name in the sheet and its auxiliary calculations, not in text', () => {
    const base = newDocument('T', '"Tabulka je v Databázi."\nm := pick(Materialy, "ocel").hustota');
    const stored = { schemaJson: '{}', dataCsv: '' };
    const doc = { ...base, tables: new Map([['Materialy', stored], ['Tabulka', stored], ['Profily', stored]]), layers: [...base.layers, { id: 'aux', kind: 'calc' as const, visible: true, locked: false, appendix: false, text: 'p := pick(Profily, "IPE 200")' }] };
    expect([...usedTables(doc)].sort()).toEqual(['Materialy', 'Profily']);
  });
});

import { deleteTable } from '../src/logic/tableEdit.js';

describe('a table deleted', () => {
  it('goes from the document, its layer and its pictures', () => {
    const base = newDocument('T', '');
    const stored = { schemaJson: JSON.stringify({ name: 'Tabulka', image: 'images/Tabulka/{obrazek}' }), dataCsv: '' };
    const doc = { ...base, tables: new Map([['Tabulka', stored], ['Materialy', stored]]), files: new Map([['images/Tabulka/a.png', new Uint8Array([1])], ['images/sheet/b.png', new Uint8Array([2])]]), layers: base.layers.map((l) => (l.kind === 'data' ? { ...l, tables: ['Tabulka', 'Materialy'] } : l)) };
    const left = deleteTable(doc, 'Tabulka');
    expect([...left.tables.keys()]).toEqual(['Materialy']);
    expect(left.layers.find((l) => l.kind === 'data')!.tables).toEqual(['Materialy']);
    expect([...left.files.keys()]).toEqual(['images/sheet/b.png']);
  });
});
