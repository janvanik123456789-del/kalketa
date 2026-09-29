/**
 * Editing stored tables (schema.json + data.csv) in the editor's table view.
 * All operations return new values; nothing is mutated.
 */

import type { ColumnSchema, TableSchema } from '@calccanvas/core';
import { parseCsv, writeCsv, type StoredTable } from '@calccanvas/sheet';

export interface EditableTable {
  readonly schema: TableSchema;
  /** Data rows as cell strings, one per column of the schema. */
  readonly rows: readonly (readonly string[])[];
}

export function toEditable(stored: StoredTable): EditableTable {
  const schema = JSON.parse(stored.schemaJson) as TableSchema;
  const [, ...rows] = parseCsv(stored.dataCsv, ',');
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
