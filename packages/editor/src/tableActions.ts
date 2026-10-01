/**
 * Creating and importing tables; used by the table editor and by the Insert menu.
 */

import { defaultRegistry } from '@kalketa/core';
import { formatDiagnostic, t, type Catalog } from '@kalketa/i18n';
import { importTable, parseCsv, readWorkbook, toIdentifier, type SheetDocument, type StoredTable } from '@kalketa/sheet';
import { chooseFile } from './document.js';
import { ask } from './components/Ask.js';
import { fromEditable, newTable } from './logic/tableEdit.js';

export interface TableChange {
  readonly doc: SheetDocument;
  readonly name: string;
  readonly messages: string[];
}

export function withTable(doc: SheetDocument, name: string, stored: StoredTable, files?: ReadonlyMap<string, Uint8Array>): SheetDocument {
  const tables = new Map(doc.tables);
  tables.set(name, stored);
  const allFiles = new Map(doc.files);
  for (const [path, data] of files ?? []) allFiles.set(path, data);
  return { ...doc, tables, files: allFiles };
}

/** Asks for a name and adds an empty table. */
export async function createTable(doc: SheetDocument, catalog: Catalog): Promise<TableChange | undefined> {
  const name = toIdentifier((await ask(t(catalog, 'editor.tableName'), 'Tabulka')) ?? '');
  if (!name || doc.tables.has(name)) return undefined;
  return { doc: withTable(doc, name, fromEditable(newTable(name))), name, messages: [] };
}

/** Lets the user pick a CSV or Excel file and imports it as a table. */
export async function importTableFile(doc: SheetDocument, catalog: Catalog): Promise<TableChange | undefined> {
  const file = await chooseFile('.csv,.txt,.xlsx');
  if (!file) return undefined;
  const suggested = toIdentifier(file.name.replace(/\.[^.]+$/, ''));
  const name = toIdentifier((await ask(t(catalog, 'editor.tableName'), suggested)) ?? '');
  if (!name) return undefined;
  const source = { title: file.name, retrieved: new Date().toISOString().slice(0, 10) };
  let imported;
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const [sheet] = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
    if (!sheet) return undefined;
    imported = importTable(sheet.rows, { name, registry: defaultRegistry, source, images: sheet.images });
  } else {
    imported = importTable(parseCsv(await file.text()), { name, registry: defaultRegistry, source });
  }
  return {
    doc: withTable(doc, name, { schemaJson: imported.files.schemaJson, dataCsv: imported.files.dataCsv }, imported.files.images),
    name,
    messages: imported.diagnostics.map((d) => formatDiagnostic(d, catalog)),
  };
}
