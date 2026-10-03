/**
 * Document helpers of the editor: example sheet, opening and saving files in
 * the browser, images as data URIs.
 */

import { documentTables, newDocument, readSheetFile, writeSheetFile, type SheetDocument, type StoredTable } from '@kalketa/sheet';
import type { Diagnostic, Table, UnitRegistry } from '@kalketa/core';
import { isCanvasPath, readScene, sceneDataUri } from '@kalketa/canvas';

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
  // A canvas is drawn from its scene; pictures inside it resolve the same way.
  if (isCanvasPath(path)) {
    if (!data) return undefined;
    let uri = uriCache.get(data);
    if (!uri) {
      uri = sceneDataUri(readScene(data), (inner) => (isCanvasPath(inner) ? undefined : fileUri(doc, inner)));
      uriCache.set(data, uri);
    }
    return uri;
  }
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
  /**
   * Saves to `path`, or asks where. `current` is the document's own file; any
   * other open file is refused with the message `openElsewhere`.
   */
  save(request: { path?: string; current?: string; suggestedName: string; bytes: Uint8Array; openElsewhere?: string }): Promise<string | undefined>;
  print(html: string): Promise<boolean>;
  exportPdf(request: { html: string; suggestedName: string }): Promise<string | undefined>;
  /** Opens another editor window with an empty calculation. */
  newWindow(): Promise<void>;
  setCloseGuard(guard: { dirty: boolean; message: string; discard: string; cancel: string }): void;
  onOpenFile(listener: (file: DesktopFile) => void): void;
  /** Files this window has open; the application keeps each file in one window only. */
  setOpenFiles(paths: string[]): void;
  /** Another window tried to open a file this one has: show its tab. */
  onShowFile(listener: (path: string) => void): void;
  /** Pictures on the clipboard: picture files copied in a file manager, or a copied picture. */
  clipboardPictures(): Promise<{ name: string; type: string; bytes: Uint8Array }[]>;
  /** Company rules for the AI (read by the application from next to the program). */
  aiPolicy(): Promise<unknown>;
  aiKeyState(provider: string): Promise<AiKeyState>;
  /** Hands a key to the application; the editor never reads it back. */
  aiSetKey(request: { provider: string; key: string; remember: boolean }): Promise<AiKeyState>;
  aiForgetKey(provider: string): Promise<AiKeyState>;
  /** Asks the provider for its models with the key the application holds (or at the address given). */
  aiTest(provider: string, url?: string): Promise<AiConnectionResult>;
  /** One short question to a model of a local server: its reply and how long it took. */
  aiTry(provider: string, model: string, url?: string): Promise<{ readonly ok: true; readonly reply: string; readonly ms: number } | { readonly ok: false; readonly problem: string; readonly detail?: string }>;
  /** A conversation turn; the answer arrives in pieces through onAiChatEvent, the promise gives the whole. */
  aiChat(ask: AiChatAsk): Promise<{ readonly ok: true; readonly text: string; readonly model: string } | { readonly ok: false; readonly problem: string; readonly detail?: string }>;
  aiChatCancel(id: string): Promise<void>;
  onAiChatEvent(listener: (piece: { readonly id: string; readonly text?: string; readonly thinking?: boolean }) => void): void;
  /** Local servers running now, with their models, by provider. */
  aiDiscover(): Promise<Record<string, readonly { readonly id: string; readonly name: string }[]>>;
}

export interface AiChatAsk {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly url?: string;
  /** The user's language; the model answers in it. */
  readonly language: string;
  readonly sheet: { readonly title: string; readonly source: string; readonly findings?: readonly string[] };
  readonly languageGuide?: string;
  readonly turns: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
}

export interface AiKeyState {
  readonly hasKey: boolean;
  readonly remembered: boolean;
  readonly canRemember: boolean;
}

export type AiConnectionResult =
  | { readonly ok: true; readonly models: readonly { readonly id: string; readonly name: string }[] }
  | { readonly ok: false; readonly problem: string; readonly detail?: string };

export interface DesktopFile {
  readonly path: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** The desktop bridge, or undefined when running in a browser. */
export const desktop: DesktopBridge | undefined = (window as unknown as { kalketaDesktop?: DesktopBridge }).kalketaDesktop;

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

const CALC_TYPES = [{ description: 'Kalketa', accept: { 'application/zip': ['.kalk', '.calc'] } }];

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
      const [handle] = await fs.showOpenFilePicker({ types: [...CALC_TYPES, { description: 'Kalketa text', accept: { 'text/plain': ['.cc'] } }] });
      if (!handle) return undefined;
      const file = await handle.getFile();
      return openBytes(file.name, new Uint8Array(await file.arrayBuffer()), { kind: 'handle', handle });
    } catch {
      return undefined; // cancelled
    }
  }
  const file = await chooseFile('.kalk,.calc,.cc');
  return file ? openBytes(file.name, new Uint8Array(await file.arrayBuffer())) : undefined;
}

/** Saves the document; returns where it went (undefined if cancelled or downloaded). `onBytes` sees the file content. */
export async function saveDocument(
  doc: SheetDocument,
  ref: FileRef | undefined,
  onBytes?: (bytes: Uint8Array) => void,
  labels?: { openElsewhere: string; current?: string },
): Promise<FileRef | undefined> {
  const stamped = { ...doc, manifest: { ...doc.manifest, modified: new Date().toISOString() } };
  const bytes = await writeSheetFile(stamped);
  onBytes?.(bytes);

  if (desktop) {
    const path = await desktop.save({ ...(ref?.kind === 'path' ? { path: ref.path } : {}), suggestedName: fileName(doc), bytes, ...(labels ?? {}) });
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

/** The largest parts of a document, for the file size warning. */
export function largestParts(doc: SheetDocument, count = 3): { name: string; bytes: number }[] {
  const parts: { name: string; bytes: number }[] = [];
  for (const [path, data] of doc.files) parts.push({ name: path, bytes: data.length });
  for (const [name, table] of doc.tables) parts.push({ name: `tables/${name}`, bytes: table.dataCsv.length + table.schemaJson.length });
  for (const layer of doc.layers) if (layer.text) parts.push({ name: layer.name ?? layer.id, bytes: layer.text.length });
  return parts.sort((a, b) => b.bytes - a.bytes).slice(0, count);
}
