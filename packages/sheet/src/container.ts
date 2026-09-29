/**
 * The .calc file: one ZIP container holding everything a sheet needs
 * (docs/02-architektura.md, ch. 4).
 *
 *   manifest.json      format version, title, dates, content hash
 *   sheet.cc           the calculation as text
 *   layout.json        print settings
 *   tables/<Name>/     schema.json + data.csv
 *   images/...         pictures of table rows and of the printout
 *   (anything else)    kept unchanged, so newer files survive older programs
 *
 * Everything inside is an open format and readable without CalcCanvas.
 * Entries are written in a fixed order with a fixed timestamp, so the same
 * content always gives the same bytes.
 */

import { diagnostic, NO_SPAN, type Diagnostic } from '@calccanvas/core';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

export const FORMAT_ID = 'calccanvas-sheet';
export const FORMAT_VERSION = 1;
export const FILE_EXTENSION = '.calc';

export interface Manifest {
  readonly format: typeof FORMAT_ID;
  readonly formatVersion: number;
  readonly title: string;
  /** Language of the printout (BCP 47), independent of the program's language. */
  readonly language?: string;
  readonly author?: string;
  /** ISO 8601 timestamps. */
  readonly created: string;
  readonly modified: string;
  /** Program that wrote the file. */
  readonly generator: string;
  /** SHA-256 of all other entries; detects changes made outside the program. */
  readonly contentHash?: string;
}

export interface Layout {
  readonly paper: 'A4' | 'A3' | 'Letter';
  readonly orientation: 'portrait' | 'landscape';
  /** Significant digits of printed numbers. */
  readonly digits: number;
}

export const DEFAULT_LAYOUT: Layout = { paper: 'A4', orientation: 'portrait', digits: 4 };

export interface StoredTable {
  readonly schemaJson: string;
  readonly dataCsv: string;
}

export interface SheetDocument {
  readonly manifest: Manifest;
  readonly source: string;
  readonly layout: Layout;
  /** By table name. */
  readonly tables: ReadonlyMap<string, StoredTable>;
  /** All other entries by path (images/..., ai/..., unknown future content). */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface ReadResult {
  /** Undefined when the file cannot be used at all. */
  readonly document?: SheetDocument;
  readonly diagnostics: Diagnostic[];
}

const MANIFEST = 'manifest.json';
const SHEET = 'sheet.cc';
const LAYOUT = 'layout.json';
const TABLE_ENTRY = /^tables\/([^/]+)\/(schema\.json|data\.csv)$/;

/** Fixed timestamp for every entry (the ZIP epoch), for reproducible bytes. */
const ZIP_MTIME = new Date('1980-01-01T00:00:00Z');

export function newDocument(title: string, source = '', now = new Date()): SheetDocument {
  const stamp = now.toISOString();
  return {
    manifest: { format: FORMAT_ID, formatVersion: FORMAT_VERSION, title, created: stamp, modified: stamp, generator: 'CalcCanvas' },
    source,
    layout: DEFAULT_LAYOUT,
    tables: new Map(),
    files: new Map(),
  };
}

/** Serializes a document; the content hash in the manifest is recomputed. */
export async function writeSheetFile(doc: SheetDocument): Promise<Uint8Array> {
  const entries = contentEntries(doc);
  const manifest: Manifest = { ...doc.manifest, format: FORMAT_ID, formatVersion: FORMAT_VERSION, contentHash: await hashEntries(entries) };

  const zippable: Zippable = {};
  zippable[MANIFEST] = [json(manifest), { mtime: ZIP_MTIME }];
  for (const [path, data] of entries) zippable[path] = [data, { mtime: ZIP_MTIME }];
  return zipSync(zippable, { level: 6 });
}

export async function readSheetFile(bytes: Uint8Array): Promise<ReadResult> {
  const diagnostics: Diagnostic[] = [];
  const invalid = (problem: string, value = '') => {
    diagnostics.push(diagnostic('E-FILE-INVALID', NO_SPAN, { problem, value }));
    return { diagnostics };
  };

  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    return invalid('not-zip');
  }

  for (const path of Object.keys(raw)) {
    if (!isSafePath(path)) return invalid('path', path);
  }

  const manifestBytes = raw[MANIFEST];
  if (!manifestBytes) return invalid('missing', MANIFEST);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as Manifest;
  } catch {
    return invalid('json', MANIFEST);
  }
  if (manifest.format !== FORMAT_ID) return invalid('format', String(manifest.format));
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > FORMAT_VERSION) {
    diagnostics.push(diagnostic('E-FILE-VERSION', NO_SPAN, { found: String(manifest.formatVersion), supported: FORMAT_VERSION }));
    return { diagnostics };
  }

  const sheetBytes = raw[SHEET];
  if (!sheetBytes) return invalid('missing', SHEET);

  let layout = DEFAULT_LAYOUT;
  if (raw[LAYOUT]) {
    try {
      layout = { ...DEFAULT_LAYOUT, ...(JSON.parse(strFromU8(raw[LAYOUT])) as Partial<Layout>) };
    } catch {
      return invalid('json', LAYOUT);
    }
  }

  const tableParts = new Map<string, { schemaJson?: string; dataCsv?: string }>();
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(raw)) {
    if (path === MANIFEST || path === SHEET || path === LAYOUT || path.endsWith('/')) continue;
    const match = TABLE_ENTRY.exec(path);
    if (match) {
      const part = tableParts.get(match[1]!) ?? {};
      if (match[2] === 'schema.json') part.schemaJson = strFromU8(data);
      else part.dataCsv = strFromU8(data);
      tableParts.set(match[1]!, part);
    } else {
      files.set(path, data);
    }
  }
  const tables = new Map<string, StoredTable>();
  for (const [name, part] of tableParts) {
    if (part.schemaJson === undefined || part.dataCsv === undefined) return invalid('table', name);
    tables.set(name, { schemaJson: part.schemaJson, dataCsv: part.dataCsv });
  }

  const document: SheetDocument = { manifest, source: strFromU8(sheetBytes), layout, tables, files };
  if (manifest.contentHash && manifest.contentHash !== (await hashEntries(contentEntries(document)))) {
    diagnostics.push(diagnostic('W-FILE-HASH', NO_SPAN));
  }
  return { document, diagnostics };
}

/** Entries other than the manifest, in a stable order. */
function contentEntries(doc: SheetDocument): [string, Uint8Array][] {
  const entries: [string, Uint8Array][] = [
    [SHEET, strToU8(doc.source)],
    [LAYOUT, json(doc.layout)],
  ];
  for (const name of [...doc.tables.keys()].sort()) {
    const table = doc.tables.get(name)!;
    entries.push([`tables/${name}/schema.json`, strToU8(table.schemaJson)]);
    entries.push([`tables/${name}/data.csv`, strToU8(table.dataCsv)]);
  }
  for (const path of [...doc.files.keys()].sort()) {
    if (!isSafePath(path)) throw new Error(`Unsafe path in sheet document: ${path}`);
    entries.push([path, doc.files.get(path)!]);
  }
  return entries;
}

async function hashEntries(entries: readonly [string, Uint8Array][]): Promise<string> {
  const parts: Uint8Array[] = [];
  for (const [path, data] of entries) parts.push(strToU8(`${path}\0${data.length}\0`), data);
  const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    total.set(p, offset);
    offset += p.length;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', total);
  return 'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Relative, forward-slash paths without "..", so unpacking cannot escape its folder. */
export function isSafePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every((part) => part !== '..' && part !== '.');
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2) + '\n');
}
