/**
 * Editing stored tables (schema.json + data.csv) in the editor's table view.
 * All operations return new values; nothing is mutated.
 */

import { defaultRegistry, tokenize, type ColumnSchema, type TableSchema } from '@kalketa/core';
import { inferTable, parseCsv, toIdentifier, writeCsv, type SheetDocument, type StoredTable } from '@kalketa/sheet';

export interface EditableTable {
  readonly schema: TableSchema;
  /** Data rows as cell strings, one per column of the schema. */
  readonly rows: readonly (readonly string[])[];
}

export function toEditable(stored: StoredTable): EditableTable {
  const schema = JSON.parse(stored.schemaJson) as TableSchema;
  // Empty rows stay: a row just added is empty until something is typed into it.
  const [, ...rows] = parseCsv(stored.dataCsv, ',', true);
  const width = schema.columns.length;
  return { schema, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) };
}

export function fromEditable(table: EditableTable): StoredTable {
  return {
    schemaJson: JSON.stringify(table.schema, null, 2) + '\n',
    dataCsv: writeCsv([table.schema.columns.map((c) => c.name), ...table.rows]),
  };
}

/** Numbers typed with a decimal comma are stored with a dot. */
export function normalizeCell(value: string, column: ColumnSchema): string {
  const text = value.trim();
  if (column.type !== 'quantity') return text;
  const compact = text.replace(/[\s  ]/g, '');
  return compact.includes(',') && !compact.includes('.') ? compact.replace(',', '.') : compact;
}

export function setCell(table: EditableTable, row: number, column: number, value: string): EditableTable {
  const schemaColumn = table.schema.columns[column];
  if (!schemaColumn || !table.rows[row]) return table;
  const rows = table.rows.map((r, i) => (i === row ? r.map((c, j) => (j === column ? normalizeCell(value, schemaColumn) : c)) : r));
  return { ...table, rows };
}

export function addRow(table: EditableTable, after = table.rows.length - 1): EditableTable {
  const rows = [...table.rows];
  rows.splice(after + 1, 0, table.schema.columns.map(() => ''));
  return { ...table, rows };
}

export function deleteRow(table: EditableTable, row: number): EditableTable {
  return { ...table, rows: table.rows.filter((_, i) => i !== row) };
}

export function addColumn(table: EditableTable, column: ColumnSchema): EditableTable | undefined {
  if (table.schema.columns.some((c) => c.name === column.name)) return undefined;
  return {
    schema: { ...table.schema, columns: [...table.schema.columns, column] },
    rows: table.rows.map((r) => [...r, '']),
  };
}

export function deleteColumn(table: EditableTable, column: number): EditableTable {
  const name = table.schema.columns[column]?.name;
  if (name === undefined || name === (table.schema.key ?? table.schema.columns[0]?.name)) return table; // the key column stays
  return {
    schema: { ...table.schema, columns: table.schema.columns.filter((_, i) => i !== column) },
    rows: table.rows.map((r) => r.filter((_, i) => i !== column)),
  };
}

export function newTable(name: string): EditableTable {
  return {
    schema: { name, key: 'nazev', columns: [{ name: 'nazev', type: 'text' }, { name: 'hodnota', type: 'quantity' }] },
    rows: [['', '']],
  };
}

const SUPERSCRIPTS: Readonly<Record<string, string>> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** A unit as typed, its powers as superscripts: m^3, m3 → m³; s^-1 → s⁻¹; kN/m2 → kN/m². */
export function unitWithPowers(text: string): string {
  const sup = (digits: string) => [...digits].map((d) => SUPERSCRIPTS[d] ?? d).join('');
  return text.replace(/\^(-?\d+)/g, (_, power: string) => sup(power)).replace(/([\p{L}°Ω])([2-9])(?![\d.,])/gu, (_, letter: string, power: string) => `${letter}${sup(power)}`);
}

/** Cells of text pasted from elsewhere: tabs of Excel, a Markdown table of a model's answer (also in a code block), CSV. */
export function pastedCells(text: string): string[][] {
  const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(text);
  const lines = (fenced ? fenced[1]! : text).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length > 0 && lines.every((l) => l.trim().startsWith('|'))) {
    return lines
      .map((l) => l.trim())
      .filter((l) => !/^\|[\s:|-]+\|?$/.test(l))
      .map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  }
  if (lines.some((l) => l.includes('\t'))) return lines.map((l) => l.split('\t').map((c) => c.trim()));
  return parseCsv(lines.join('\n')).map((r) => r.map((c) => c.trim()));
}

/** Whether the table holds nothing yet (a new one: its one row empty). */
function isEmptyTable(table: EditableTable): boolean {
  return table.rows.every((r) => r.every((c) => c.trim() === ''));
}

/**
 * Cells pasted into a cell of the table, as a spreadsheet takes them: from that cell right and down, rows added as
 * needed, a head row that names the columns of the table left out. Into an empty table a pasted table with its head
 * comes whole: its columns, their units and kinds. Undefined when the text is one cell only (it goes into the cell).
 */
export function pasteGrid(table: EditableTable, row: number, column: number, text: string): EditableTable | undefined {
  const cells = pastedCells(text).filter((r) => r.some((c) => c !== ''));
  if (cells.length === 0 || (cells.length === 1 && cells[0]!.length === 1)) return undefined;
  const head = cells[0]!;
  const numeric = (c: string) => /^[-+]?(\d[\d\s  ]*([.,]\d+)?|[.,]\d+)([eE][-+]?\d+)?$/.test(c.trim());
  const headLike = cells.length > 1 && head.some((c) => c !== '' && !numeric(c)) && cells.slice(1).some((r) => r.some(numeric));
  if (isEmptyTable(table) && headLike && head.length >= 2) {
    // The head written with powers (kg/m3 → kg/m³), so the unit is read whatever the keyboard gave.
    const grid = [head.map((h) => h.replace(/\[([^\]]*)\]/, (_, unit: string) => `[${unitWithPowers(unit)}]`)), ...cells.slice(1)];
    const inferred = inferTable(table.schema.name, grid, defaultRegistry);
    return { schema: { ...inferred.schema, name: table.schema.name }, rows: inferred.rows };
  }
  const names = table.schema.columns.map((c) => c.name.toLowerCase());
  const own = headLike && head.every((h, i) => !h || names[column + i] === toIdentifier(h.replace(/\s*\[.*$/, '')).toLowerCase());
  const values = own ? cells.slice(1) : cells;
  let next: EditableTable = table;
  values.forEach((cellsOfRow, i) => {
    const r = row + i;
    while (next.rows.length <= r) next = addRow(next);
    cellsOfRow.forEach((value, j) => {
      if (column + j < next.schema.columns.length) next = setCell(next, r, column + j, value);
    });
  });
  return next;
}

/** The name a sheet writes, replaced where it stands as a name (not in text, a comment or a quoted key). */
export function withNameReplaced(source: string, from: string, to: string): string {
  const spans = tokenize(source)
    .tokens.filter((t) => t.type === 'ident' && t.text === from && source.slice(t.span.offset, t.span.offset + t.span.length) === from)
    .map((t) => t.span.offset)
    .sort((a, b) => b - a);
  let out = source;
  for (const at of spans) out = out.slice(0, at) + to + out.slice(at + from.length);
  return out;
}

/**
 * A table of the data layer renamed: its name in the document, in its data layer, and wherever the printed sheet and
 * the auxiliary calculations read it (pick(Materialy; …), Materialy.hustota). Its pictures stay where they are: the
 * table keeps the path to them. Undefined for a name not valid or taken.
 */
export function renameTable(doc: SheetDocument, from: string, to: string): SheetDocument | undefined {
  const stored = doc.tables.get(from);
  if (!stored || !to || to === from || doc.tables.has(to) || toIdentifier(to) !== to) return undefined;
  const schema = { ...(JSON.parse(stored.schemaJson) as object), name: to };
  const tables = new Map([...doc.tables].map(([name, table]) => (name === from ? [to, { ...table, schemaJson: JSON.stringify(schema, null, 2) + '\n' }] : [name, table])));
  const layers = doc.layers.map((l) => ({
    ...l,
    ...(l.tables ? { tables: l.tables.map((n) => (n === from ? to : n)) } : {}),
    ...(l.kind === 'calc' && l.text ? { text: withNameReplaced(l.text, from, to) } : {}),
  }));
  return { ...doc, tables, layers, source: withNameReplaced(doc.source, from, to) };
}

/** The tables a calculation of the document reads by name (the printed sheet and its auxiliary calculations). */
export function usedTables(doc: SheetDocument): Set<string> {
  const used = new Set<string>();
  for (const text of [doc.source, ...doc.layers.filter((l) => l.kind === 'calc').map((l) => l.text ?? '')]) {
    for (const token of tokenize(text).tokens) if (token.type === 'ident' && doc.tables.has(token.text)) used.add(token.text);
  }
  return used;
}

/** A table removed from the document and its data layer, with the pictures of its rows (Undo brings it all back). */
export function deleteTable(doc: SheetDocument, name: string): SheetDocument {
  const stored = doc.tables.get(name);
  if (!stored) return doc;
  const image = (JSON.parse(stored.schemaJson) as { image?: string }).image;
  const folder = image ? image.slice(0, image.lastIndexOf('/') + 1) : undefined;
  const tables = new Map(doc.tables);
  tables.delete(name);
  const files = folder ? new Map([...doc.files].filter(([path]) => !path.startsWith(folder))) : doc.files;
  const layers = doc.layers.map((l) => (l.tables?.includes(name) ? { ...l, tables: l.tables.filter((n) => n !== name) } : l));
  return { ...doc, tables, files, layers };
}
