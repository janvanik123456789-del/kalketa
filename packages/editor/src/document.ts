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
// Files. In the desktop application the bridge gives native dialogs and saves
// back to the same path. In a browser, the File System Access API (Chromium)
// does the same; other browsers download a copy.
// ---------------------------------------------------------------------------

/** Functions of the desktop application (packages/desktop/src/preload.cts). */
export interface DesktopBridge {
  openDialog(labels: { sheets: string }): Promise<DesktopFile | undefined>;
  openPath(path: string): Promise<DesktopFile | undefined>;
  save(request: { path?: string; suggestedName: string; bytes: Uint8Array }): Promise<string | undefined>;
  print(html: string): Promise<boolean>;
  exportPdf(request: { html: string; suggestedName: string }): Promise<string | undefined>;
  setCloseGuard(guard: { dirty: boolean; message: string; discard: string; cancel: string }): void;
  onOpenFile(listener: (file: DesktopFile) => void): void;
}

export interface DesktopFile {
  readonly path: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** The desktop bridge, or undefined when running in a browser. */
export const desktop: DesktopBridge | undefined = (window as unknown as { calccanvasDesktop?: DesktopBridge }).calccanvasDesktop;

interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

interface FsWindow {
  showOpenFilePicker?: (options: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<FileHandle>;
}

/** Where the document is saved: a path (desktop) or a browser file handle. */
export type FileRef = { readonly kind: 'path'; readonly path: string } | { readonly kind: 'handle'; readonly handle: FileHandle };

const CALC_TYPES = [{ description: 'CalcCanvas', accept: { 'application/zip': ['.calc'] } }];

export interface OpenedFile {
  readonly document?: SheetDocument;
  readonly diagnostics: Diagnostic[];
  readonly ref?: FileRef;
}

/** Opens file bytes: a .calc container, or a .cc sheet text. */
export async function openBytes(name: string, bytes: Uint8Array, ref?: FileRef): Promise<OpenedFile> {
  if (name.toLowerCase().endsWith('.cc')) {
    // A bare .cc has no container yet; saving asks for a new .calc file.
    return { document: newDocument(name.replace(/\.cc$/i, ''), new TextDecoder().decode(bytes)), diagnostics: [] };
  }
  const read = await readSheetFile(bytes);
  return { ...read, ...(ref && read.document ? { ref } : {}) };
}

/** Opens with a file dialog. Returns undefined when cancelled. */
export async function pickAndOpen(labels: { sheets: string }): Promise<OpenedFile | undefined> {
  if (desktop) {
    const file = await desktop.openDialog(labels);
    return file ? openBytes(file.name, file.bytes, { kind: 'path', path: file.path }) : undefined;
  }
  const fs = window as unknown as FsWindow;
  if (fs.showOpenFilePicker) {
    try {
      const [handle] = await fs.showOpenFilePicker({ types: [...CALC_TYPES, { description: 'CalcCanvas text', accept: { 'text/plain': ['.cc'] } }] });
      if (!handle) return undefined;
      const file = await handle.getFile();
      return openBytes(file.name, new Uint8Array(await file.arrayBuffer()), { kind: 'handle', handle });
    } catch {
      return undefined; // cancelled
    }
  }
  const file = await chooseFile('.calc,.cc');
  return file ? openBytes(file.name, new Uint8Array(await file.arrayBuffer())) : undefined;
}

/** Saves the document; returns where it went (undefined if cancelled or downloaded). */
export async function saveDocument(doc: SheetDocument, ref: FileRef | undefined): Promise<FileRef | undefined> {
  const stamped = { ...doc, manifest: { ...doc.manifest, modified: new Date().toISOString() } };
  const bytes = await writeSheetFile(stamped);

  if (desktop) {
    const path = await desktop.save({ ...(ref?.kind === 'path' ? { path: ref.path } : {}), suggestedName: fileName(doc), bytes });
    return path ? { kind: 'path', path } : undefined;
  }

  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const fs = window as unknown as FsWindow;
  try {
    const handle = ref?.kind === 'handle' ? ref.handle : fs.showSaveFilePicker ? await fs.showSaveFilePicker({ suggestedName: `${fileName(doc)}.calc`, types: CALC_TYPES }) : undefined;
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { kind: 'handle', handle };
    }
  } catch {
    return undefined; // cancelled
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

export function fileName(doc: SheetDocument): string {
  return doc.manifest.title.replace(/[\/:*?"<>|]+/g, '_').trim() || 'vypocet';
}
