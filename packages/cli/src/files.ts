/**
 * File access for the CLI. A sheet is either a .calc file (ZIP container) or
 * an unpacked folder with the same layout:
 *
 *   nosnik.cc                    (sheet.cc inside the container)
 *   layout.json                  optional
 *   tables/<Name>/schema.json
 *   tables/<Name>/data.csv
 *   images/...
 *   layers.json, layers/<id>/  further layers (auxiliary calculations, notes)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import type { Diagnostic } from '@calccanvas/core';
import {
  FILE_EXTENSION,
  isSafePath,
  newDocument,
  readSheetEntries,
  readSheetFile,
  sheetEntries,
  tableFolder,
  writeSheetFile,
  type SheetDocument,
  type TableFiles,
} from '@calccanvas/sheet';

/** Files and folders next to a sheet that belong to it. */
const CARRIED_FILES = ['layout.json', 'layers.json'];
const CARRIED_FOLDERS = ['tables', 'images', 'layers', 'ai'];

export interface OpenResult {
  readonly document?: SheetDocument;
  readonly diagnostics: Diagnostic[];
}

/** Opens a .calc file or a .cc file with its folder. */
export async function openSheet(path: string): Promise<OpenResult> {
  if (extname(path).toLowerCase() === FILE_EXTENSION) {
    return readSheetFile(new Uint8Array(readFileSync(path)));
  }
  return readFolder(path);
}

/**
 * Reads a .cc file and what belongs to it in its folder. The folder holds the
 * same entries as the .calc container, except that the sheet is named after
 * the file and there is no manifest.
 */
export async function readFolder(sheetFile: string): Promise<OpenResult> {
  const dir = dirname(sheetFile);
  const entries: Record<string, Uint8Array> = { 'sheet.cc': new Uint8Array(readFileSync(sheetFile)) };
  for (const name of CARRIED_FILES) {
    if (existsSync(join(dir, name))) entries[name] = new Uint8Array(readFileSync(join(dir, name)));
  }
  for (const folder of CARRIED_FOLDERS) {
    for (const file of listFiles(join(dir, folder))) entries[relative(dir, file).split(sep).join('/')] = new Uint8Array(readFileSync(file));
  }
  const manifest = newDocument(basename(sheetFile, extname(sheetFile)), '', statSync(sheetFile).birthtime).manifest;
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify({ ...manifest, modified: new Date().toISOString() }));
  return readSheetEntries(entries);
}

/** Writes a document as a folder; returns the written paths. */
export function writeFolder(doc: SheetDocument, dir: string, sheetName: string): string[] {
  const written: string[] = [];
  for (const [path, data] of sheetEntries(doc)) {
    const name = path === 'sheet.cc' ? `${sheetName}.cc` : path;
    if (!isSafePath(name)) throw new Error(`Unsafe path: ${name}`);
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written.push(target);
  }
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
