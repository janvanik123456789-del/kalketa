/**
 * Document helpers of the editor: example sheet, opening and saving files in
 * the browser, images as data URIs.
 */

import { documentTables, newDocument, readSheetFile, writeSheetFile, type SheetDocument, type StoredTable } from '@calccanvas/sheet';
import type { Diagnostic, Table, UnitRegistry } from '@calccanvas/core';

import exampleSheet from '../../../reference/R1-nosnik/nosnik.cc?raw';
import profilesSchema from '../../../reference/R1-nosnik/tables/Profily_IPE/schema.json?raw';
import profilesData from '../../../reference/R1-nosnik/tables/Profily_IPE/data.csv?raw';
import materialsSchema from '../../../reference/R1-nosnik/tables/Materialy/schema.json?raw';
import materialsData from '../../../reference/R1-nosnik/tables/Materialy/data.csv?raw';

export function exampleDocument(): SheetDocument {
  const base = newDocument('Posouzení nosníku N1', exampleSheet);
  return {
    ...base,
    manifest: { ...base.manifest, language: 'cs' },
    tables: new Map<string, StoredTable>([
      ['Materialy', { schemaJson: materialsSchema, dataCsv: materialsData }],
      ['Profily_IPE', { schemaJson: profilesSchema, dataCsv: profilesData }],
    ]),
  };
}

export function emptyDocument(title: string, language: string): SheetDocument {
  const base = newDocument(title, `# ${title}\n\n`);
  return { ...base, manifest: { ...base.manifest, language } };
}

/** Builds tables, reusing earlier builds of unchanged stored tables. */
export function tableCache(registry: UnitRegistry) {
  let cache = new Map<StoredTable, { table: Table; diagnostics: Diagnostic[] }>();
  return (doc: SheetDocument): { tables: Table[]; diagnostics: Diagnostic[] } => {
    const next = new Map<StoredTable, { table: Table; diagnostics: Diagnostic[] }>();
    const tables: Table[] = [];
    const diagnostics: Diagnostic[] = [];
    for (const stored of doc.tables.values()) {
      const built = cache.get(stored) ?? oneTable(stored, registry);
      next.set(stored, built);
      tables.push(built.table);
      diagnostics.push(...built.diagnostics);
    }
    cache = next;
    return { tables, diagnostics };
  };
}

function oneTable(stored: StoredTable, registry: UnitRegistry) {
  const single = { ...newDocument(''), tables: new Map([['t', stored]]) };
  const { tables, diagnostics } = documentTables(single, registry);
  return { table: tables[0]!, diagnostics };
}

const MIME: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
};

/** A file of the sheet (images/...) as a data: URI, cached per byte array. */
const uriCache = new WeakMap<Uint8Array, string>();
export function fileUri(doc: SheetDocument, path: string): string | undefined {
  const data = doc.files.get(path);
  const mime = MIME[path.split('.').pop()?.toLowerCase() ?? ''];
  if (!data || !mime) return undefined;
  let uri = uriCache.get(data);
  if (!uri) {
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    uri = `data:${mime};base64,${btoa(binary)}`;
    uriCache.set(data, uri);
  }
  return uri;
}

// ---------------------------------------------------------------------------
// Files. The File System Access API (Chromium) allows saving back to the same
// file; other browsers download a copy.
// ---------------------------------------------------------------------------

interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

interface FsWindow {
  showOpenFilePicker?: (options: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<FileHandle>;
}

const CALC_TYPES = [{ description: 'CalcCanvas', accept: { 'application/zip': ['.calc'] } }];

export interface OpenedFile {
  readonly document?: SheetDocument;
  readonly diagnostics: Diagnostic[];
  readonly handle?: FileHandle;
}

export async function openFile(file: File, handle?: FileHandle): Promise<OpenedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.cc')) {
    return { document: newDocument(file.name.replace(/\.cc$/i, ''), new TextDecoder().decode(bytes)), diagnostics: [] };
  }
  const read = await readSheetFile(bytes);
  return { ...read, ...(handle ? { handle } : {}) };
}

/** Opens with a file picker; falls back to a hidden <input type=file>. */
export async function pickAndOpen(): Promise<OpenedFile | undefined> {
  const fs = window as unknown as FsWindow;
  if (fs.showOpenFilePicker) {
    try {
      const [handle] = await fs.showOpenFilePicker({ types: [...CALC_TYPES, { description: 'CalcCanvas text', accept: { 'text/plain': ['.cc'] } }] });
      if (!handle) return undefined;
      return openFile(await handle.getFile(), handle);
    } catch {
      return undefined; // cancelled
    }
  }
  const file = await chooseFile('.calc,.cc');
  return file ? openFile(file) : undefined;
}

export async function saveDocument(doc: SheetDocument, handle: FileHandle | undefined): Promise<FileHandle | undefined> {
  const stamped = { ...doc, manifest: { ...doc.manifest, modified: new Date().toISOString() } };
  const blob = new Blob([(await writeSheetFile(stamped)) as BlobPart], { type: 'application/zip' });
  const fs = window as unknown as FsWindow;
  try {
    const target = handle ?? (fs.showSaveFilePicker ? await fs.showSaveFilePicker({ suggestedName: `${fileName(doc)}.calc`, types: CALC_TYPES }) : undefined);
    if (target) {
      const writable = await target.createWritable();
      await writable.write(blob);
      await writable.close();
      return target;
    }
  } catch {
    return handle; // cancelled
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName(doc)}.calc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return undefined;
}

export function chooseFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

function fileName(doc: SheetDocument): string {
  return doc.manifest.title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'vypocet';
}

export type { FileHandle };
