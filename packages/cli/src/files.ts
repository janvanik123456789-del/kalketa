/**
 * File access for the CLI. A sheet for now is a folder:
 *
 *   nosnik.cc
 *   tables/<Name>/schema.json
 *   tables/<Name>/data.csv
 *   images/<Name>/...
 *
 * which is the layout of the future .calc container (F4).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Diagnostic, Table, UnitRegistry } from '@calccanvas/core';
import { loadTable, tableFolder, type TableFiles } from '@calccanvas/sheet';

export interface LoadedTables {
  readonly tables: Table[];
  readonly diagnostics: Diagnostic[];
}

/** Loads every table stored next to a sheet file. */
export function loadTablesNextTo(sheetFile: string, registry: UnitRegistry): LoadedTables {
  const root = join(dirname(sheetFile), 'tables');
  const tables: Table[] = [];
  const diagnostics: Diagnostic[] = [];
  if (!existsSync(root)) return { tables, diagnostics };

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(root, entry.name);
    const schemaPath = join(folder, 'schema.json');
    const dataPath = join(folder, 'data.csv');
    if (!existsSync(schemaPath) || !existsSync(dataPath)) continue;
    const loaded = loadTable(readFileSync(schemaPath, 'utf8'), readFileSync(dataPath, 'utf8'), registry);
    tables.push(loaded.table);
    diagnostics.push(...loaded.diagnostics);
  }
  return { tables, diagnostics };
}

/** Writes an imported table into a sheet folder. */
export function writeTable(sheetDir: string, name: string, files: TableFiles): string[] {
  const folder = join(sheetDir, tableFolder(name));
  mkdirSync(folder, { recursive: true });
  const written = [join(folder, 'schema.json'), join(folder, 'data.csv')];
  writeFileSync(written[0]!, files.schemaJson);
  writeFileSync(written[1]!, files.dataCsv);
  for (const [path, data] of files.images) {
    const target = join(sheetDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written.push(target);
  }
  return written;
}
