/**
 * @kalketa/sheet — the sheet's data layer: importing and storing tables.
 *
 * Works on strings and bytes only; the caller (CLI, editor) does the file I/O.
 * On disk a table is tables/<Name>/schema.json + data.csv, the same layout the
 * .calc container will use (F4).
 */

import { buildTable, type BlockSource, type Diagnostic, type SheetResult, type Table, type TableBuildResult, type TableSchema, type UnitRegistry } from '@kalketa/core';
import type { SheetDocument } from './container.js';
import { LayerSessions, type LayerEvaluation } from './layers.js';
import { parseCsv, writeCsv } from './csv.js';
import { inferTable } from './infer.js';
import type { WorkbookImage } from './excel.js';

export { parseCsv, writeCsv, detectDelimiter } from './csv.js';
export { inferTable, splitHeader, toIdentifier, type InferResult } from './infer.js';
export { readWorkbook, type WorkbookImage, type WorkbookSheet } from './excel.js';
export * from './container.js';
export * from './layers.js';
export * from './revisions.js';
export * from './theory.js';
export * from './theoryLibrary.js';
export * from './conversations.js';

/** Files of one stored table, relative to the sheet folder. */
export interface TableFiles {
  readonly schemaJson: string;
  readonly dataCsv: string;
  /** images/<Table>/<file> -> bytes */
  readonly images: ReadonlyMap<string, Uint8Array>;
}

export function tableFolder(name: string): string {
  return `tables/${name}`;
}

/** Loads a stored table (schema.json + data.csv). */
export function loadTable(schemaJson: string, dataCsv: string, registry: UnitRegistry): TableBuildResult {
  const schema = JSON.parse(schemaJson) as TableSchema;
  const [, ...rows] = parseCsv(dataCsv, ',');
  return buildTable(schema, rows, registry);
}

export interface ImportOptions {
  readonly name: string;
  readonly registry: UnitRegistry;
  readonly source?: TableSchema['source'];
  readonly images?: readonly WorkbookImage[];
}

export interface ImportResult {
  readonly files: TableFiles;
  readonly diagnostics: Diagnostic[];
}

/**
 * Imports a grid (header + rows) as a stored table. Images anchored to data
 * rows are saved under images/<Table>/ and linked through the key column.
 */
export function importTable(grid: readonly (readonly string[])[], options: ImportOptions): ImportResult {
  const inferred = inferTable(options.name, grid, options.registry);
  let { schema } = inferred;
  let rows = inferred.rows;
  const images = new Map<string, Uint8Array>();

  const rowImages = (options.images ?? []).filter((img) => img.row >= 1 && img.row <= rows.length);
  if (rowImages.length > 0) {
    // A text column holds each row's picture file name.
    const column = 'obrazek';
    const keyIndex = schema.columns.findIndex((c) => c.name === schema.key);
    const fileNames = rows.map((row, i) => {
      const image = rowImages.find((img) => img.row === i + 1);
      if (!image) return '';
      const base = toFileName(row[keyIndex] ?? '') || `radek_${i + 1}`;
      const file = `${base}.${image.extension}`;
      images.set(`images/${schema.name}/${file}`, image.data);
      return file;
    });
    rows = rows.map((row, i) => [...row, fileNames[i]!]);
    schema = { ...schema, columns: [...schema.columns, { name: column, type: 'text' }], image: `images/${schema.name}/{${column}}` };
  }

  if (options.source) schema = { ...schema, source: options.source };
  const header = schema.columns.map((c) => c.name);
  const files: TableFiles = {
    schemaJson: JSON.stringify(schema, null, 2) + '\n',
    dataCsv: writeCsv([header, ...rows]),
    images,
  };
  const check = loadTable(files.schemaJson, files.dataCsv, options.registry);
  return { files, diagnostics: [...inferred.diagnostics, ...check.diagnostics] };
}

/** Parses CSV text and imports it (see importTable). */
export function importCsv(text: string, options: ImportOptions): ImportResult {
  return importTable(parseCsv(text), options);
}

function toFileName(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Builds all tables stored in a document. */
export function documentTables(doc: SheetDocument, registry: UnitRegistry): { tables: Table[]; diagnostics: Diagnostic[] } {
  const tables: Table[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const stored of doc.tables.values()) {
    const loaded = loadTable(stored.schemaJson, stored.dataCsv, registry);
    tables.push(loaded.table);
    diagnostics.push(...loaded.diagnostics);
  }
  return { tables, diagnostics };
}

/** Evaluates a document with its own tables. Table problems come first in the diagnostics. */
/** The blocks of a document, as the calculation takes them. */
export function documentBlocks(doc: SheetDocument): Map<string, BlockSource> {
  return new Map([...doc.blocks].map(([name, block]) => [name, { name, source: block.source, version: block.version }]));
}

export function evaluateDocument(
  doc: SheetDocument,
  registry: UnitRegistry,
): { result: SheetResult; evaluation: LayerEvaluation; tableDiagnostics: Diagnostic[] } {
  const { tables, diagnostics } = documentTables(doc, registry);
  const evaluation = new LayerSessions(registry).evaluate(doc.source, doc.layers, tables, documentBlocks(doc));
  return { result: evaluation.main, evaluation, tableDiagnostics: diagnostics };
}
