/**
 * Typed tables stored in the data layer of a sheet (docs/03-jazyk.md, ch. 8).
 *
 * The core builds tables from a schema and raw cell strings; reading files
 * (CSV, Excel, the sheet container) happens outside the core.
 */

import { diagnostic, type Diagnostic, type Span } from '../diagnostics.js';
import { parse } from '../lang/parser.js';
import type { UnitRegistry } from '../units/registry.js';
import { resolveUnit, type ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type Value } from '../values/value.js';

export type ColumnType = 'quantity' | 'text' | 'boolean';

export interface ColumnSchema {
  readonly name: string;
  readonly type: ColumnType;
  /** Unit of the numbers in this column, e.g. "cm³". Omitted for dimensionless numbers. */
  readonly unit?: string;
}

export interface TableSource {
  readonly title: string;
  readonly retrieved?: string;
  readonly note?: string;
}

/** JSON stored as tables/<name>/schema.json. */
export interface TableSchema {
  readonly name: string;
  /** Column used by pick(T, "key"). Defaults to the first column. */
  readonly key?: string;
  readonly columns: readonly ColumnSchema[];
  /** Image path pattern per row, e.g. "images/Profily_IPE/{oznaceni}.svg". */
  readonly image?: string;
  readonly source?: TableSource;
}

export interface Column extends ColumnSchema {
  readonly resolvedUnit?: ResolvedUnit;
}

/** A cell is a value or null when empty. */
export type Cell = Value | null;

export interface Table {
  readonly name: string;
  readonly key: string;
  readonly columns: readonly Column[];
  readonly rows: readonly (readonly Cell[])[];
  readonly image?: string;
  readonly source?: TableSource;
  /** Content hash; changes whenever schema or data change. */
  readonly fingerprint: string;
}

/** A read of table data, recorded for provenance. */
export interface TableRead {
  readonly table: string;
  /** Rows involved: one, or two when interpolated. */
  readonly rows: readonly number[];
  /** Column read; absent when a whole row was selected. */
  readonly column?: string;
  /** Interpolation weight of the second row. */
  readonly weight?: number;
}

export interface TableBuildResult {
  readonly table: Table;
  readonly diagnostics: Diagnostic[];
}

/** Tables are not part of the sheet text, so their diagnostics have line 0. */
export const NO_SPAN: Span = { offset: 0, length: 0, line: 0, column: 0 };

const NAME = /^[\p{L}][\p{L}\p{Nd}\p{M}_]*$/u;

/**
 * Builds a table from its schema and data rows (cell strings, header excluded).
 * Bad cells become empty and are reported; the table is still usable.
 */
export function buildTable(schema: TableSchema, data: readonly (readonly string[])[], registry: UnitRegistry): TableBuildResult {
  const diagnostics: Diagnostic[] = [];
  const report = (code: Parameters<typeof diagnostic>[0], params: Record<string, string | number>) =>
    diagnostics.push(diagnostic(code, NO_SPAN, { table: schema.name, ...params }));

  if (!NAME.test(schema.name)) report('E-TABLE-SCHEMA', { problem: 'table-name', value: schema.name });

  const columns: Column[] = schema.columns.map((column) => {
    if (!NAME.test(column.name)) report('E-TABLE-SCHEMA', { problem: 'column-name', value: column.name });
    if (column.type !== 'quantity' || !column.unit) return column;
    const unit = parseUnit(column.unit, registry);
    if (!unit) {
      report('E-TABLE-SCHEMA', { problem: 'unit', value: column.unit, column: column.name });
      return column;
    }
    return { ...column, resolvedUnit: unit };
  });

  const key = schema.key ?? columns[0]?.name ?? '';
  if (!columns.some((c) => c.name === key)) report('E-TABLE-SCHEMA', { problem: 'key', value: key });

  const rows = data.map((raw, rowIndex) =>
    columns.map((column, columnIndex): Cell => {
      const text = (raw[columnIndex] ?? '').trim();
      if (text === '') return null;
      const cell = parseCell(text, column);
      if (cell === undefined) {
        report('E-TABLE-CELL', { row: rowIndex + 1, column: column.name, value: text });
        return null;
      }
      return cell;
    }),
  );

  const table: Table = {
    name: schema.name,
    key,
    columns,
    rows,
    ...(schema.image !== undefined ? { image: schema.image } : {}),
    ...(schema.source !== undefined ? { source: schema.source } : {}),
    fingerprint: hash(JSON.stringify([schema, data])),
  };
  return { table, diagnostics };
}

export function columnIndex(table: Table, name: string): number {
  return table.columns.findIndex((c) => c.name === name);
}

/** Text shown for a row: its key cell, e.g. "IPE 200". */
export function rowLabel(table: Table, row: number): string {
  const cell = table.rows[row]?.[columnIndex(table, table.key)];
  if (cell?.type === 'text') return cell.value;
  if (cell?.type === 'quantity') return String(cell.hint ? cell.si / cell.hint.factor : cell.si);
  return `#${row + 1}`;
}

function parseUnit(text: string, registry: UnitRegistry): ResolvedUnit | undefined {
  const parsed = parse(`[${text}]`, { isUnit: (name) => registry.isUnit(name) });
  const statement = parsed.sheet.statements[0];
  if (parsed.diagnostics.length > 0 || statement?.kind !== 'display' || statement.expr.kind !== 'unit') return undefined;
  try {
    return resolveUnit(statement.expr.unit, registry);
  } catch {
    return undefined;
  }
}

/** Accepts "1.5", "1,5" (decimal comma), "1 234,5", "1e-3". */
function parseNumber(text: string): number | undefined {
  let t = text.replace(/[\s  ]/g, '');
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return undefined;
  return Number(t);
}

const TRUE_WORDS = new Set(['true', 'yes', 'ano', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'ne', '0']);

function parseCell(text: string, column: Column): Cell | undefined {
  switch (column.type) {
    case 'text':
      return { type: 'text', value: text };
    case 'boolean': {
      const lower = text.toLowerCase();
      if (TRUE_WORDS.has(lower)) return { type: 'boolean', value: true };
      if (FALSE_WORDS.has(lower)) return { type: 'boolean', value: false };
      return undefined;
    }
    case 'quantity': {
      const n = parseNumber(text);
      if (n === undefined) return undefined;
      const unit = column.resolvedUnit;
      if (!unit) return quantity(n);
      if (unit.offset !== undefined) return quantity(n * unit.factor + unit.offset, unit.dim, { absolute: true, hint: unit });
      return quantity(n * unit.factor, unit.dim, { hint: unit });
    }
  }
}

/** FNV-1a, enough to detect changes for the incremental evaluator. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}
