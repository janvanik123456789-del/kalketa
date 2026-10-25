import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { detectDelimiter, importCsv, importTable, inferTable, loadTable, parseCsv, readWorkbook, splitHeader, toIdentifier, writeCsv } from '../src/index.js';

const registry = defaultRegistry;

describe('CSV', () => {
  it('detects the delimiter used by Czech Excel', () => {
    expect(detectDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1.5,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  });

  it('handles quotes, embedded delimiters, CRLF and a BOM', () => {
    const text = '﻿name;note\r\n"IPE 200";"said ""ok""; fine"\r\n';
    expect(parseCsv(text)).toEqual([['name', 'note'], ['IPE 200', 'said "ok"; fine']]);
  });

  it('writes what it reads', () => {
    const rows = [['a', 'b'], ['x, y', 'say "hi"'], ['', '1.5']];
    expect(parseCsv(writeCsv(rows), ',')).toEqual(rows);
  });
});

describe('headers', () => {
  it('splits names and units', () => {
    expect(splitHeader('Wy [cm³]', 0)).toEqual({ name: 'Wy', unit: 'cm³' });
    expect(splitHeader('h (mm)', 0)).toEqual({ name: 'h', unit: 'mm' });
    expect(splitHeader('Hmotnost [kg/m3]', 0)).toEqual({ name: 'Hmotnost', unit: 'kg/m³' });
    expect(splitHeader('označení', 0)).toEqual({ name: 'označení' });
    expect(splitHeader('', 2)).toEqual({ name: 'sloupec_3' });
  });

  it('makes valid identifiers', () => {
    expect(toIdentifier('Wy,el')).toBe('Wy_el');
    expect(toIdentifier('2nd value')).toBe('c_2nd_value');
    expect(toIdentifier('Profily IPE')).toBe('Profily_IPE');
  });
});

describe('inferTable', () => {
  it('detects numeric columns and normalizes decimal commas', () => {
    const grid = [['trida', 'fy [MPa]', 'poznamka'], ['S235', '235', 'běžná'], ['S355', '355,0', '']];
    const result = inferTable('Oceli', grid, registry);
    expect(result.diagnostics).toEqual([]);
    expect(result.schema.columns).toEqual([
      { name: 'trida', type: 'text' },
      { name: 'fy', type: 'quantity', unit: 'MPa' },
      { name: 'poznamka', type: 'text' },
    ]);
    expect(result.rows[1]).toEqual(['S355', '355.0', '']);
  });

  it('reports unknown units instead of guessing', () => {
    const result = inferTable('T', [['x [furlong]'], ['1']], registry);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['W-TABLE-UNIT']);
    expect(result.schema.columns[0]).toEqual({ name: 'x', type: 'quantity' });
  });
});

describe('importCsv', () => {
  it('produces files that load back into a usable table', () => {
    const csv = 'Označení;Wy [cm³];G [kg/m]\nP1;50;10\nP2;100;15\n';
    const imported = importCsv(csv, { name: 'Profily', registry, source: { title: 'test' } });
    expect(imported.diagnostics).toEqual([]);

    const { table } = loadTable(imported.files.schemaJson, imported.files.dataCsv, registry);
    const result = evaluateSheet('p := pick(Profily, "P2")\nW := p.Wy', { tables: [table] });
    expect(result.diagnostics).toEqual([]);
    expect(result.statements[1]!.display).toEqual({ value: 100, unit: 'cm³' });
    expect(JSON.parse(imported.files.schemaJson).source).toEqual({ title: 'test' });
  });
});

describe('Excel', () => {
  async function workbook(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Profily');
    sheet.addRow(['Označení', 'Wy [cm3]', 'G [kg/m]']);
    sheet.addRow(['P1', 50, 10]);
    sheet.addRow(['P2', { formula: 'B2*2', result: 100 }, 15]);
    // A 1×1 PNG placed over the row of P2.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const id = wb.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: 'png' });
    sheet.addImage(id, { tl: { col: 3, row: 2 }, ext: { width: 10, height: 10 } });
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it('reads cells, formula results and pictures anchored to rows', async () => {
    const [sheet] = await readWorkbook(await workbook());
    expect(sheet!.name).toBe('Profily');
    expect(sheet!.rows).toEqual([['Označení', 'Wy [cm3]', 'G [kg/m]'], ['P1', '50', '10'], ['P2', '100', '15']]);
    expect(sheet!.images).toHaveLength(1);
    expect(sheet!.images[0]).toMatchObject({ row: 2, extension: 'png' });
  });

  it('reads dates, rich text, booleans and special characters as Excel shows them', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Ruzne & <jine>');
    sheet.addRow(['datum', 'text', 'ano', 'cislo']);
    sheet.addRow([new Date(Date.UTC(2026, 9, 25)), { richText: [{ text: 'tučně ', font: { bold: true } }, { text: 'a & <ne>' }] }, true, 0.1]);
    sheet.getCell('A2').numFmt = 'd.m.yyyy';
    sheet.addRow([]);
    sheet.getCell('D4').value = -1.5e-7;
    const [read] = await readWorkbook(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(read!.name).toBe('Ruzne & <jine>');
    expect(read!.rows).toEqual([
      ['datum', 'text', 'ano', 'cislo'],
      ['2026-10-25', 'tučně a & <ne>', 'true', '0.1'],
      ['', '', '', ''],
      ['', '', '', '-1.5e-7'],
    ]);
  });

  it('imports pictures as images of the matching records', async () => {
    const [sheet] = await readWorkbook(await workbook());
    const imported = importTable(sheet!.rows, { name: 'Profily', registry, images: sheet!.images });
    expect(imported.diagnostics).toEqual([]);
    expect([...imported.files.images.keys()]).toEqual(['images/Profily/P2.png']);

    const schema = JSON.parse(imported.files.schemaJson);
    expect(schema.image).toBe('images/Profily/{obrazek}');
    expect(schema.columns.map((c: { name: string }) => c.name)).toEqual(['Označení', 'Wy', 'G', 'obrazek']);
    expect(parseCsv(imported.files.dataCsv, ',')[2]).toEqual(['P2', '100', '15', 'P2.png']);
  });

  it('loads a table with rows left empty in the editor, without them', () => {
    const schema = JSON.stringify({ name: 'Nyty', key: 'nazev', columns: [{ name: 'nazev', type: 'text' }, { name: 'd', type: 'quantity', unit: 'mm' }] });
    const { table, diagnostics } = loadTable(schema, 'nazev,d\n,\nN6,6\n,\n', defaultRegistry);
    expect(diagnostics).toEqual([]);
    expect(table.rows.length).toBe(1);
  });
});
