/**
 * The .calc file: one ZIP container holding everything a sheet needs
 * (docs/02-architektura.md, ch. 4).
 *
 *   manifest.json      format version, title, dates, content hash
 *   sheet.cc           the calculation as text
 *   layout.json        print settings
 *   tables/<Name>/     schema.json + data.csv
 *   blocks/<Name>/     block.cc (calculation with "input" lines) + block.json (version, origin)
 *   images/...         pictures of table rows and of the printout
 *   revisions/<label>/ frozen revisions: revision.json + the entries above as they were
 *   (anything else)    kept unchanged, so newer files survive older programs
 *
 * Everything inside is an open format and readable without Kalketa.
 * Entries are written in a fixed order with a fixed timestamp, so the same
 * content always gives the same bytes.
 */

import { diagnostic, NO_SPAN, type Diagnostic } from '@kalketa/core';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { defaultLayers, withoutEmptyAiLayer, type Layer, type LayerKind } from './layers.js';
import { readRevisions, revisionEntries, type Revision } from './revisions.js';
import { hasConversations } from './conversations.js';

export const FORMAT_ID = 'kalketa-sheet';
/** Files written before the program was renamed (it was CalcCanvas) say this; they are read the same way. */
export const LEGACY_FORMAT_IDS: readonly string[] = ['calccanvas-sheet'];
/**
 * 1: sheet + tables. 2: adds layers (layers.json, layers/<id>/). 3: adds blocks
 * (blocks/<Name>/). Older files still open; an older program refuses a newer
 * file rather than calculating it without its blocks.
 */
export const FORMAT_VERSION = 3;
export const FILE_EXTENSION = '.kalk';
/** Extensions of calculation files: .kalk, and .calc from before the rename. */
export const SHEET_FILE_EXTENSIONS: readonly string[] = ['.kalk', '.calc'];

export interface Manifest {
  readonly format: string;
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
  /** How the calculation is set (docs/navrhy/RESIC-A-STYLY.md); a file without it keeps the airy style it was made with. */
  readonly style?: 'compact' | 'airy' | 'book';
  /** Where the summary of checks stands: at the top (when left out), at the bottom, or nowhere. */
  readonly summary?: 'top' | 'bottom' | 'none';
  /** Equation numbers at the right: none (when left out), of lines with a formula, of every result. */
  readonly equations?: 'none' | 'formulas' | 'results';
  /** How a check says its result: VYHOVUJE (when left out), VYHOVÍ, or a sign only. */
  readonly verdict?: 'present' | 'future' | 'sign';
}

export const DEFAULT_LAYOUT: Layout = { paper: 'A4', orientation: 'portrait', digits: 4 };

export interface StoredTable {
  readonly schemaJson: string;
  readonly dataCsv: string;
}

/** A reusable block stored in the sheet (docs/01-filozofie.md, ch. 6.2). */
export interface StoredBlock {
  /** Calculation text; inputs are marked "input". */
  readonly source: string;
  readonly version: string;
  /** Where it was taken from (file name), to find newer versions later. */
  readonly origin?: string;
}

export interface SheetDocument {
  readonly manifest: Manifest;
  readonly source: string;
  readonly layout: Layout;
  /** By table name. */
  readonly tables: ReadonlyMap<string, StoredTable>;
  /** All other entries by path (images/..., layers/<id>/images/..., unknown future content). */
  readonly files: ReadonlyMap<string, Uint8Array>;
  /** Layers in order; the first is always the printed sheet (its text is `source`). */
  readonly layers: readonly Layer[];
  /** Blocks by name; the sheet calls them like functions. */
  readonly blocks: ReadonlyMap<string, StoredBlock>;
  /** Frozen revisions, oldest first; not part of the content hash (each has its own). */
  readonly revisions: readonly Revision[];
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
const LAYERS = 'layers.json';
/** Text of a layer: a calculation or notes. */
const LAYER_TEXT = /^layers\/([^/]+)\/(sheet\.cc|notes\.md)$/;
const LAYER_KINDS: readonly LayerKind[] = ['sheet', 'calc', 'data', 'ai', 'sources'];
const BLOCK_ENTRY = /^blocks\/([^/]+)\/(block\.cc|block\.json)$/;

function layerTextPath(layer: Layer): string | undefined {
  if (layer.kind === 'calc') return `layers/${layer.id}/sheet.cc`;
  if (layer.kind === 'ai' || layer.kind === 'sources') return `layers/${layer.id}/notes.md`;
  return undefined;
}

/** Fixed timestamp for every entry (the ZIP epoch), for reproducible bytes. */
const ZIP_MTIME = new Date('1980-01-01T00:00:00Z');

export function newDocument(title: string, source = '', now = new Date()): SheetDocument {
  const stamp = now.toISOString();
  return {
    manifest: { format: FORMAT_ID, formatVersion: FORMAT_VERSION, title, created: stamp, modified: stamp, generator: 'Kalketa' },
    source,
    // A new calculation is set in the compact (school) style.
    layout: { ...DEFAULT_LAYOUT, style: 'compact' },
    tables: new Map(),
    files: new Map(),
    layers: defaultLayers(),
    blocks: new Map(),
    revisions: [],
  };
}

/** Serializes a document; the content hash in the manifest is recomputed. */
export async function writeSheetFile(doc: SheetDocument): Promise<Uint8Array> {
  const entries = sheetEntries(doc);
  const manifest: Manifest = { ...doc.manifest, format: FORMAT_ID, formatVersion: FORMAT_VERSION, contentHash: await hashEntries(entries) };

  const zippable: Zippable = {};
  zippable[MANIFEST] = [json(manifest), { mtime: ZIP_MTIME }];
  for (const [path, data] of [...entries, ...revisionEntries(doc.revisions)]) zippable[path] = [data, { mtime: ZIP_MTIME }];
  return zipSync(zippable, { level: 6 });
}

export async function readSheetFile(bytes: Uint8Array): Promise<ReadResult> {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    return { diagnostics: [diagnostic('E-FILE-INVALID', NO_SPAN, { problem: 'not-zip', value: '' })] };
  }
  return readSheetEntries(raw);
}

/**
 * Reads a document from its entries (path -> bytes), as found in the ZIP
 * container or in an unpacked folder.
 */
export async function readSheetEntries(entries: Readonly<Record<string, Uint8Array>>): Promise<ReadResult> {
  const diagnostics: Diagnostic[] = [];
  const raw: Record<string, Uint8Array> = { ...entries };
  const invalid = (problem: string, value = '') => {
    diagnostics.push(diagnostic('E-FILE-INVALID', NO_SPAN, { problem, value }));
    return { diagnostics };
  };

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
  if (manifest.format !== FORMAT_ID && !LEGACY_FORMAT_IDS.includes(String(manifest.format))) return invalid('format', String(manifest.format));
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > FORMAT_VERSION) {
    diagnostics.push(diagnostic('E-FILE-VERSION', NO_SPAN, { found: String(manifest.formatVersion), supported: FORMAT_VERSION }));
    return { diagnostics };
  }

  const sheetBytes = raw[SHEET];
  if (!sheetBytes) return invalid('missing', SHEET);

  // Revisions come out first; a revision changed outside the program is reported.
  const { revisions, damaged } = await readRevisions(raw);
  for (const label of damaged) diagnostics.push(diagnostic('W-REVISION-HASH', NO_SPAN, { revision: label }));

  let layout = DEFAULT_LAYOUT;
  if (raw[LAYOUT]) {
    try {
      layout = { ...DEFAULT_LAYOUT, ...(JSON.parse(strFromU8(raw[LAYOUT])) as Partial<Layout>) };
    } catch {
      return invalid('json', LAYOUT);
    }
  }

  // Version 1 files have no layer list: they get the default layers.
  let layers: Layer[] = defaultLayers();
  if (raw[LAYERS]) {
    try {
      layers = parseLayers(JSON.parse(strFromU8(raw[LAYERS])));
    } catch {
      return invalid('json', LAYERS);
    }
  }
  const layerTexts = new Map<string, string>();

  const tableParts = new Map<string, { schemaJson?: string; dataCsv?: string }>();
  const blockParts = new Map<string, { source?: string; info?: string }>();
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(raw)) {
    if (path === MANIFEST || path === SHEET || path === LAYOUT || path === LAYERS || path.endsWith('/')) continue;
    const text = LAYER_TEXT.exec(path);
    if (text && layers.some((l) => l.id === text[1] && layerTextPath(l) === path)) {
      layerTexts.set(text[1]!, strFromU8(data));
      continue;
    }
    const blockEntry = BLOCK_ENTRY.exec(path);
    if (blockEntry) {
      const part = blockParts.get(blockEntry[1]!) ?? {};
      if (blockEntry[2] === 'block.cc') part.source = strFromU8(data);
      else part.info = strFromU8(data);
      blockParts.set(blockEntry[1]!, part);
      continue;
    }
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

  const blocks = new Map<string, StoredBlock>();
  for (const [name, part] of blockParts) {
    if (part.source === undefined) return invalid('block', name);
    let info: { version?: unknown; origin?: unknown } = {};
    try {
      info = part.info ? (JSON.parse(part.info) as typeof info) : {};
    } catch {
      return invalid('json', `blocks/${name}/block.json`);
    }
    blocks.set(name, {
      source: part.source,
      version: typeof info.version === 'string' ? info.version : '1',
      ...(typeof info.origin === 'string' ? { origin: info.origin } : {}),
    });
  }

  layers = withoutEmptyAiLayer(
    layers.map((l) => (layerTextPath(l) ? { ...l, text: layerTexts.get(l.id) ?? '' } : l)),
    (id) => hasConversations(files, id),
  );
  const document: SheetDocument = { manifest, source: strFromU8(sheetBytes), layout, tables, files, layers, blocks, revisions };
  if (manifest.contentHash && manifest.contentHash !== (await hashEntries(sheetEntries(document)))) {
    diagnostics.push(diagnostic('W-FILE-HASH', NO_SPAN));
  }
  return { document, diagnostics };
}

/** Entries other than the manifest, in a stable order: what an unpacked folder holds. */
export function sheetEntries(doc: SheetDocument): [string, Uint8Array][] {
  const entries: [string, Uint8Array][] = [
    [SHEET, strToU8(doc.source)],
    [LAYOUT, json(doc.layout)],
    // The list of layers without their texts; each text is its own entry below.
    [LAYERS, json(doc.layers.map(layerInfo))],
  ];
  for (const layer of doc.layers) {
    const path = layerTextPath(layer);
    if (path) entries.push([path, strToU8(layer.text ?? '')]);
  }
  for (const name of [...doc.tables.keys()].sort()) {
    const table = doc.tables.get(name)!;
    entries.push([`tables/${name}/schema.json`, strToU8(table.schemaJson)]);
    entries.push([`tables/${name}/data.csv`, strToU8(table.dataCsv)]);
  }
  for (const name of [...doc.blocks.keys()].sort()) {
    const block = doc.blocks.get(name)!;
    entries.push([`blocks/${name}/block.cc`, strToU8(block.source)]);
    entries.push([`blocks/${name}/block.json`, json({ version: block.version, ...(block.origin !== undefined ? { origin: block.origin } : {}) })]);
  }
  // A picture of the sources no text refers to any more (a cut-out of a confirmed formula, a
  // picture deleted) is not saved: the file gets smaller as the sources are worked through.
  const texts = [doc.source, ...doc.layers.map((l) => l.text ?? '')];
  const sources = new Set(doc.layers.filter((l) => l.kind === 'sources').map((l) => l.id));
  const unused = (path: string) => {
    const own = /^layers\/([^/]+)\/images\//.exec(path);
    return !!own && sources.has(own[1]!) && !texts.some((text) => text.includes(path));
  };
  for (const path of [...doc.files.keys()].sort()) {
    if (!isSafePath(path)) throw new Error(`Unsafe path in sheet document: ${path}`);
    if (unused(path)) continue;
    entries.push([path, doc.files.get(path)!]);
  }
  return entries;
}

export async function hashEntries(entries: readonly [string, Uint8Array][]): Promise<string> {
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

/** A layer without its text, keys always in the same order (stable bytes and content hash). */
function layerInfo(l: Layer): Omit<Layer, 'text'> {
  return {
    id: l.id,
    kind: l.kind,
    ...(l.name !== undefined ? { name: l.name } : {}),
    visible: l.visible,
    locked: l.locked,
    appendix: l.appendix,
    ...(l.tables !== undefined ? { tables: l.tables } : {}),
    ...(l.source !== undefined ? { source: l.source } : {}),
  };
}

/** Validates the stored layer list; the printed sheet is always first and unique. */
function parseLayers(value: unknown): Layer[] {
  if (!Array.isArray(value)) throw new Error('layers');
  const ids = new Set<string>();
  const layers = value.map((raw): Layer => {
    const l = raw as Partial<Layer>;
    if (typeof l.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(l.id) || ids.has(l.id)) throw new Error('layer id');
    if (!LAYER_KINDS.includes(l.kind as LayerKind)) throw new Error('layer kind');
    ids.add(l.id);
    return {
      id: l.id,
      kind: l.kind!,
      ...(typeof l.name === 'string' ? { name: l.name } : {}),
      visible: l.visible !== false,
      locked: l.locked === true,
      appendix: l.appendix === true,
      ...(l.kind === 'data' ? { tables: Array.isArray(l.tables) ? l.tables.filter((t): t is string => typeof t === 'string') : [] } : {}),
      ...(l.kind === 'sources' && typeof l.source === 'string' ? { source: l.source } : {}),
    };
  });
  const sheets = layers.filter((l) => l.kind === 'sheet');
  if (sheets.length !== 1 || layers[0]?.kind !== 'sheet') throw new Error('sheet layer');
  // At most one AI notes layer.
  return layers.filter((l, i) => l.kind !== 'ai' || layers.findIndex((x) => x.kind === 'ai') === i);
}
