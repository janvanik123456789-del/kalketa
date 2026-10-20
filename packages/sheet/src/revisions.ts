/**
 * Revisions of a sheet (docs/01-filozofie.md, ch. 7): a frozen copy of the
 * whole content (calculation, layers, tables, blocks, pictures) with its
 * SHA-256 fingerprint. The fingerprint is printed in the footer, so a printed
 * calculation can be traced to the revision it shows.
 *
 * In the file a revision is revisions/<label>/: revision.json and the frozen
 * entries under the same paths as in the sheet (revisions/A/sheet.cc, …).
 */

import { strFromU8, strToU8 } from 'fflate';
import { hashEntries, readSheetEntries, sheetEntries, type ReadResult, type SheetDocument } from './container.js';
import { withoutAiRecords } from './conversations.js';

export interface Revision {
  /** "A", "B", … or a label of the user's own ("01", "P1"). */
  readonly label: string;
  /** ISO 8601. */
  readonly created: string;
  readonly author?: string;
  /** What the revision is for: "k odevzdání", "po připomínkách statika". */
  readonly note?: string;
  /** SHA-256 of the frozen entries: the content hash the sheet had then. */
  readonly hash: string;
  /** The frozen content: manifest.json and the entries of the sheet, by path. */
  readonly entries: ReadonlyMap<string, Uint8Array>;
}

export const REVISION_LABEL = /^[A-Za-z0-9_-]{1,12}$/;
const REVISION_INFO = 'revision.json';
const MANIFEST = 'manifest.json';

/** The fingerprint of the current content (the same as the manifest's content hash on save). */
export function contentHash(doc: SheetDocument): Promise<string> {
  return hashEntries(sheetEntries(doc));
}

/** "3f9c 21ab": the first 8 hex digits of a fingerprint, as printed. */
export function shortHash(hash: string): string {
  const hex = hash.replace(/^sha256:/, '');
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)}`;
}

/** The label after the last one: A, B, … Z, AA, AB … (labels of the user's own are skipped). */
export function nextRevisionLabel(revisions: readonly Revision[]): string {
  const letters = revisions.map((r) => r.label).filter((l) => /^[A-Z]+$/.test(l));
  const value = (label: string) => [...label].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  let n = Math.max(0, ...letters.map(value)) + 1;
  let label = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    label = String.fromCharCode(65 + r) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export interface FreezeOptions {
  readonly label?: string;
  readonly note?: string;
  readonly now?: Date;
}

/** Freezes the current content as a new revision; the sheet stays editable. */
export async function freezeRevision(doc: SheetDocument, options: FreezeOptions = {}): Promise<SheetDocument> {
  const label = options.label ?? nextRevisionLabel(doc.revisions);
  if (!REVISION_LABEL.test(label)) throw new Error(`Invalid revision label: ${label}`);
  if (doc.revisions.some((r) => r.label === label)) throw new Error(`Revision ${label} exists`);
  const created = (options.now ?? new Date()).toISOString();
  const content = sheetEntries(doc);
  const hash = await hashEntries(content);
  const { contentHash: _old, ...manifest } = doc.manifest;
  const entries = new Map<string, Uint8Array>([[MANIFEST, strToU8(JSON.stringify({ ...manifest, contentHash: hash }, null, 2) + '\n')], ...content]);
  const revision: Revision = {
    label,
    created,
    ...(doc.manifest.author ? { author: doc.manifest.author } : {}),
    ...(options.note ? { note: options.note } : {}),
    hash,
    entries,
  };
  return { ...doc, revisions: [...doc.revisions, revision] };
}

/**
 * A copy of the sheet without the conversations, memory and journal of the AI, its revisions included: a revision
 * that had them gets the fingerprint of its content without them (printouts of it then match the original file only).
 */
export async function copyWithoutAiRecords(doc: SheetDocument): Promise<SheetDocument> {
  const revisions: Revision[] = [];
  for (const revision of doc.revisions) {
    const frozen = (await revisionDocument(revision)).document;
    const stripped = frozen && withoutAiRecords(frozen);
    if (!frozen || !stripped || stripped === frozen) {
      revisions.push(revision);
      continue;
    }
    const content = sheetEntries(stripped);
    const hash = await hashEntries(content);
    const { contentHash: _old, ...manifest } = stripped.manifest;
    revisions.push({ ...revision, hash, entries: new Map([[MANIFEST, strToU8(JSON.stringify({ ...manifest, contentHash: hash }, null, 2) + '\n')], ...content]) });
  }
  return { ...withoutAiRecords(doc), revisions };
}

/** Removes a revision (only the user can decide that; frozen content is gone then). */
export function removeRevision(doc: SheetDocument, label: string): SheetDocument {
  return { ...doc, revisions: doc.revisions.filter((r) => r.label !== label) };
}

/** The sheet as it was in a revision (without revisions of its own). */
export function revisionDocument(revision: Revision): Promise<ReadResult> {
  return readSheetEntries(Object.fromEntries(revision.entries));
}

export interface RevisionState {
  readonly hash: string;
  /** The last revision. */
  readonly latest?: Revision;
  /** The content differs from the last revision. */
  readonly changed: boolean;
  /** The revision whose content the sheet has now, if any. */
  readonly current?: Revision;
}

export async function revisionState(doc: SheetDocument): Promise<RevisionState> {
  const hash = await contentHash(doc);
  const latest = doc.revisions.at(-1);
  const current = [...doc.revisions].reverse().find((r) => r.hash === hash);
  return { hash, ...(latest ? { latest } : {}), changed: !!latest && latest.hash !== hash, ...(current ? { current } : {}) };
}

/**
 * Which content a fingerprint from a printout belongs to: a revision, the
 * current content, or nothing. Spaces and case do not matter; the 8 printed
 * digits are enough.
 */
export function matchHash(hash: string, text: string): boolean {
  const wanted = text.toLowerCase().replace(/^sha256:/, '').replace(/[^0-9a-f]/g, '');
  return wanted.length >= 8 && hash.replace(/^sha256:/, '').startsWith(wanted);
}

// ---------------------------------------------------------------- file entries

/** Entries of the revisions in a file, after the sheet's own. */
export function revisionEntries(revisions: readonly Revision[]): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  for (const r of revisions) {
    const info = { label: r.label, created: r.created, ...(r.author ? { author: r.author } : {}), ...(r.note ? { note: r.note } : {}), hash: r.hash };
    out.push([`revisions/${r.label}/${REVISION_INFO}`, strToU8(JSON.stringify(info, null, 2) + '\n')]);
    for (const path of [...r.entries.keys()].sort((a, b) => (a === MANIFEST ? -1 : b === MANIFEST ? 1 : a.localeCompare(b)))) {
      out.push([`revisions/${r.label}/${path}`, r.entries.get(path)!]);
    }
  }
  return out;
}

const REVISION_ENTRY = /^revisions\/([A-Za-z0-9_-]{1,12})\/(.+)$/;

/**
 * Takes the revisions out of the entries of a file. A revision whose content
 * does not match its fingerprint is reported (changed outside the program).
 */
export async function readRevisions(raw: Record<string, Uint8Array>): Promise<{ revisions: Revision[]; damaged: string[] }> {
  const parts = new Map<string, Map<string, Uint8Array>>();
  for (const [path, data] of Object.entries(raw)) {
    const m = REVISION_ENTRY.exec(path);
    if (!m) continue;
    delete raw[path];
    const entries = parts.get(m[1]!) ?? new Map<string, Uint8Array>();
    entries.set(m[2]!, data);
    parts.set(m[1]!, entries);
  }
  const revisions: Revision[] = [];
  const damaged: string[] = [];
  for (const [label, entries] of parts) {
    const infoBytes = entries.get(REVISION_INFO);
    entries.delete(REVISION_INFO);
    let info: Partial<Revision> = {};
    try {
      info = infoBytes ? (JSON.parse(strFromU8(infoBytes)) as Partial<Revision>) : {};
    } catch {
      damaged.push(label);
    }
    // The frozen manifest holds the fingerprint; reading the content checks it (W-FILE-HASH).
    const read = await readSheetEntries(Object.fromEntries(entries));
    const hash = read.document ? await contentHash(read.document) : '';
    if (!read.document || read.diagnostics.length > 0 || info.hash !== hash) damaged.push(label);
    revisions.push({
      label,
      created: typeof info.created === 'string' ? info.created : '',
      ...(typeof info.author === 'string' ? { author: info.author } : {}),
      ...(typeof info.note === 'string' ? { note: info.note } : {}),
      hash: typeof info.hash === 'string' ? info.hash : hash,
      entries,
    });
  }
  revisions.sort((a, b) => a.created.localeCompare(b.created) || a.label.localeCompare(b.label));
  return { revisions, damaged: [...new Set(damaged)] };
}
