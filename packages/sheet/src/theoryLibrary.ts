/**
 * Theory libraries (docs/01-filozofie.md, ch. 9.6): theory larger than a sheet
 * holds, in a file of its own, .kalkt. A ZIP container like .kalk:
 *
 *   manifest.json   what the library is: id, short key, version, title, source,
 *                   language, field, whether it may be shared, content hash
 *   theory.md       the theory in the notes Markdown, sections by heading {#T3}
 *   images/…        pictures of the theory
 *   index.json      the sections with their search terms, for the content hash
 *
 * A library is made from a sources layer. A sheet that uses one keeps a link
 * (id, version, content hash) and a copy of the sections it cited, as the
 * entry theory/<id>.json among its files: the sheet traces its citations
 * without the library, and an older program keeps the entry as it is.
 * Sections of a library are cited with its key: [PP:T3].
 */

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { hashEntries, isSafePath, type SheetDocument } from './container.js';
import type { Layer } from './layers.js';

export const THEORY_FORMAT = 'kalketa-theory';
export const THEORY_FORMAT_VERSION = 1;

export interface TheorySource {
  /** Book, standard or thesis. */
  readonly title: string;
  readonly edition?: string;
  readonly pages?: string;
  readonly publisher?: string;
  readonly year?: string;
}

export interface TheoryManifest {
  readonly format: typeof THEORY_FORMAT;
  readonly formatVersion: number;
  readonly id: string;
  /** Short key the citations carry: "PP" in [PP:T3]. */
  readonly key: string;
  /** Raised by the author with each change worth telling. */
  readonly version: string;
  readonly title: string;
  readonly source: TheorySource;
  /** BCP 47 tag of the text. */
  readonly language: string;
  /** Field of engineering ("statika", "elektro"…). */
  readonly field?: string;
  /** May leave the company (excerpts of standards often may not). */
  readonly shareable: boolean;
  readonly created: string;
  readonly modified: string;
  readonly contentHash?: string;
}

export interface TheoryLibrary {
  readonly manifest: TheoryManifest;
  readonly text: string;
  /** Pictures by path inside the library (images/…). */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/** What the program checks before a library is written; codes, the editor words them. */
export type LibraryProblem =
  | { readonly code: 'noTitle' | 'noSource' | 'noHeadings' | 'badKey'; readonly level: 'error' }
  | { readonly code: 'longSection'; readonly level: 'warning'; readonly section: string; readonly chars: number };

/** A section longer than this is better split. */
const LONG_SECTION = 6000;
const KEY = /^[A-Z][A-Z0-9]{0,5}$/;
const HEADING = /^(#{1,3})\s+(.*?)\s*$/;
const ID = /\s*\{#(T\d+)\}$/;

/** Initials of a title as a key: "Pružnost a pevnost" → "PP". */
export function keyOf(title: string): string {
  const letters = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    // Words and abbreviations ("EN", "ČSN") count; numbers and short words ("a", "do") do not.
    .filter((w) => /^[A-Za-z]/.test(w) && (w.length > 2 || /^[A-Z]{2}$/.test(w)))
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 4);
  return KEY.test(letters) ? letters : 'TEO';
}

/** Sections of a library's text: by heading, ids as written. */
export function librarySections(library: TheoryLibrary): { id?: string; title: string; text: string }[] {
  const sections: { id?: string; title: string; text: string }[] = [];
  let current: { id?: string; title: string; lines: string[] } = { title: library.manifest.title, lines: [] };
  const close = () => {
    const text = current.lines.join('\n').trim();
    if (text || current.id) sections.push({ ...(current.id ? { id: `${library.manifest.key}:${current.id}` } : {}), title: current.title, text });
  };
  for (const line of library.text.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      const id = ID.exec(heading[2]!)?.[1];
      current = { ...(id ? { id } : {}), title: heading[2]!.replace(ID, ''), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  close();
  return sections;
}

export function checkTheoryLibrary(library: TheoryLibrary): LibraryProblem[] {
  const problems: LibraryProblem[] = [];
  const m = library.manifest;
  if (!m.title.trim()) problems.push({ code: 'noTitle', level: 'error' });
  if (!m.source.title.trim()) problems.push({ code: 'noSource', level: 'error' });
  if (!KEY.test(m.key)) problems.push({ code: 'badKey', level: 'error' });
  const sections = librarySections(library);
  if (!sections.some((s) => s.id)) problems.push({ code: 'noHeadings', level: 'error' });
  for (const s of sections) if (s.text.length > LONG_SECTION) problems.push({ code: 'longSection', level: 'warning', section: s.title, chars: s.text.length });
  return problems;
}

/**
 * A library from a sources layer (whose headings have their ids): its pictures
 * move from layers/<id>/images/ to images/.
 */
export function libraryFromLayer(layer: Layer, sheetFiles: ReadonlyMap<string, Uint8Array>, meta: Omit<TheoryManifest, 'format' | 'formatVersion' | 'created' | 'modified' | 'contentHash' | 'id'> & { id?: string; created?: string }, now = new Date()): TheoryLibrary {
  const folder = `layers/${layer.id}/images/`;
  const files = new Map<string, Uint8Array>();
  const text = (layer.text ?? '').replace(/\]\((layers\/[^)\s]+)\)/g, (whole, path: string) => {
    if (!path.startsWith(folder) || !sheetFiles.has(path)) return whole;
    const inside = `images/${path.slice(folder.length)}`;
    files.set(inside, sheetFiles.get(path)!);
    return `](${inside})`;
  });
  const stamp = now.toISOString();
  return {
    manifest: { format: THEORY_FORMAT, formatVersion: THEORY_FORMAT_VERSION, ...meta, id: meta.id ?? globalThis.crypto.randomUUID(), created: meta.created ?? stamp, modified: stamp },
    text,
    files,
  };
}

/** The bytes of a .kalkt; `terms` gives the search terms of a section for the index. */
export async function writeTheoryLibrary(library: TheoryLibrary, terms: (text: string) => string[] = () => []): Promise<Uint8Array> {
  const content: [string, Uint8Array][] = [['theory.md', strToU8(library.text)], ...[...library.files].sort(([a], [b]) => a.localeCompare(b))];
  const contentHash = await hashEntries(content);
  const index = { contentHash, sections: librarySections(library).map((s) => ({ ...(s.id ? { id: s.id } : {}), title: s.title, chars: s.text.length, terms: terms(`${s.title}\n${s.text}`) })) };
  const zippable: Zippable = {
    'manifest.json': strToU8(JSON.stringify({ ...library.manifest, contentHash }, null, 2) + '\n'),
    'index.json': strToU8(JSON.stringify(index) + '\n'),
  };
  for (const [path, data] of content) zippable[path] = data;
  return zipSync(zippable, { level: 6 });
}

export type ReadLibraryResult = { readonly library: TheoryLibrary } | { readonly problem: 'notZip' | 'notLibrary' | 'newer' | 'damaged' };

export async function readTheoryLibrary(bytes: Uint8Array): Promise<ReadLibraryResult> {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    return { problem: 'notZip' };
  }
  let manifest: TheoryManifest;
  try {
    manifest = JSON.parse(strFromU8(raw['manifest.json'] ?? new Uint8Array())) as TheoryManifest;
  } catch {
    return { problem: 'notLibrary' };
  }
  if (manifest.format !== THEORY_FORMAT || !raw['theory.md'] || typeof manifest.id !== 'string' || !KEY.test(String(manifest.key))) return { problem: 'notLibrary' };
  if (manifest.formatVersion > THEORY_FORMAT_VERSION) return { problem: 'newer' };
  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(raw)) if (path.startsWith('images/') && isSafePath(path)) files.set(path, data);
  const library: TheoryLibrary = { manifest, text: strFromU8(raw['theory.md']), files };
  // A library changed outside the program no longer matches its hash: it is not trusted as that version.
  const content: [string, Uint8Array][] = [['theory.md', raw['theory.md']], ...[...files].sort(([a], [b]) => a.localeCompare(b))];
  if (manifest.contentHash && manifest.contentHash !== (await hashEntries(content))) return { problem: 'damaged' };
  return { library };
}

// ---------------------------------------------------------------------------
// The link a sheet keeps

/** A library a sheet uses, with the sections it cited (so they trace without it). */
export interface LibraryLink {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly version: string;
  readonly contentHash?: string;
  readonly source: TheorySource;
  /** Copies of the cited sections, ids with the key ("PP:T3"). */
  readonly sections: readonly { readonly id: string; readonly title: string; readonly text: string }[];
}

const LINK = /^theory\/([^/]+)\.json$/;

function linkPath(id: string): string {
  return `theory/${id.replace(/[^A-Za-z0-9-]/g, '')}.json`;
}

export function linkedLibraries(doc: SheetDocument): LibraryLink[] {
  const links: LibraryLink[] = [];
  for (const [path, data] of doc.files) {
    if (!LINK.test(path)) continue;
    try {
      const link = JSON.parse(strFromU8(data)) as LibraryLink;
      if (typeof link.id === 'string' && typeof link.key === 'string') links.push({ ...link, sections: Array.isArray(link.sections) ? link.sections : [] });
    } catch {
      // A damaged link is left out; the file keeps it as it is.
    }
  }
  return links.sort((a, b) => a.key.localeCompare(b.key));
}

export function linkFor(library: TheoryLibrary, sections: LibraryLink['sections'] = []): LibraryLink {
  const m = library.manifest;
  return { id: m.id, key: m.key, title: m.title, version: m.version, ...(m.contentHash ? { contentHash: m.contentHash } : {}), source: m.source, sections };
}

export function withLibraryLink(doc: SheetDocument, link: LibraryLink): SheetDocument {
  const files = new Map(doc.files);
  files.set(linkPath(link.id), strToU8(JSON.stringify(link, null, 2) + '\n'));
  return { ...doc, files };
}

export function withoutLibraryLink(doc: SheetDocument, id: string): SheetDocument {
  const files = new Map(doc.files);
  files.delete(linkPath(id));
  return { ...doc, files };
}

/** The link with copies of newly cited sections added; the same link when nothing is new. */
export function withCitedSections(link: LibraryLink, cited: readonly { id: string; title: string; text: string }[]): LibraryLink {
  const fresh = cited.filter((c) => c.id.startsWith(`${link.key}:`) && !link.sections.some((s) => s.id === c.id));
  return fresh.length ? { ...link, sections: [...link.sections, ...fresh].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) } : link;
}
