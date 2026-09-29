/**
 * File access for the CLI. A sheet is either a .calc file (ZIP container) or
 * an unpacked folder with the same layout:
 *
 *   nosnik.cc                    (sheet.cc inside the container)
 *   layout.json                  optional
 *   tables/<Name>/schema.json
 *   tables/<Name>/data.csv
 *   images/...
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import type { Diagnostic } from '@calccanvas/core';
import {
  DEFAULT_LAYOUT,
  FILE_EXTENSION,
  isSafePath,
  newDocument,
  readSheetFile,
  tableFolder,
  writeSheetFile,
  type Layout,
  type SheetDocument,
  type StoredTable,
  type TableFiles,
} from '@calccanvas/sheet';

/** Folders next to a sheet whose files travel with it. */
const CARRIED_FOLDERS = ['images', 'ai'];

export interface OpenResult {
  readonly document?: SheetDocument;
  readonly diagnostics: Diagnostic[];
}

/** Opens a .calc file or a .cc file with its folder. */
export async function openSheet(path: string): Promise<OpenResult> {
  if (extname(path).toLowerCase() === FILE_EXTENSION) {
    return readSheetFile(new Uint8Array(readFileSync(path)));
  }
  return { document: readFolder(path), diagnostics: [] };
}

/** Builds a document from a .cc file and the tables and images next to it. */
export function readFolder(sheetFile: string): SheetDocument {
  const dir = dirname(sheetFile);
  const created = statSync(sheetFile).birthtime;
  const base = newDocument(basename(sheetFile, extname(sheetFile)), readFileSync(sheetFile, 'utf8'), created);

  const tables = new Map<string, StoredTable>();
  const tablesDir = join(dir, 'tables');
  if (existsSync(tablesDir)) {
    for (const entry of readdirSync(tablesDir, { withFileTypes: true })) {
      const folder = join(tablesDir, entry.name);
      if (!entry.isDirectory() || !existsSync(join(folder, 'schema.json')) || !existsSync(join(folder, 'data.csv'))) continue;
      tables.set(entry.name, {
        schemaJson: readFileSync(join(folder, 'schema.json'), 'utf8'),
        dataCsv: readFileSync(join(folder, 'data.csv'), 'utf8'),
      });
    }
  }

  const files = new Map<string, Uint8Array>();
  for (const folder of CARRIED_FOLDERS) {
    for (const file of listFiles(join(dir, folder))) {
      files.set(relative(dir, file).split(sep).join('/'), new Uint8Array(readFileSync(file)));
    }
  }

  const layoutPath = join(dir, 'layout.json');
  const layout: Layout = existsSync(layoutPath) ? { ...DEFAULT_LAYOUT, ...JSON.parse(readFileSync(layoutPath, 'utf8')) } : DEFAULT_LAYOUT;
  return { ...base, manifest: { ...base.manifest, modified: new Date().toISOString() }, layout, tables, files };
}

/** Writes a document as a folder; returns the written paths. */
export function writeFolder(doc: SheetDocument, dir: string, sheetName: string): string[] {
  const written: string[] = [];
  const put = (path: string, data: string | Uint8Array) => {
    if (!isSafePath(path)) throw new Error(`Unsafe path: ${path}`);
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written.push(target);
  };
  put(`${sheetName}.cc`, doc.source);
  put('layout.json', JSON.stringify(doc.layout, null, 2) + '\n');
  for (const [name, table] of doc.tables) {
    put(`${tableFolder(name)}/schema.json`, table.schemaJson);
    put(`${tableFolder(name)}/data.csv`, table.dataCsv);
  }
  for (const [path, data] of doc.files) put(path, data);
  return written;
}

export async function saveSheetFile(doc: SheetDocument, path: string): Promise<void> {
  writeFileSync(path, await writeSheetFile(doc));
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

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}
