/**
 * What the AI keeps in the AI notes layer (docs/01-filozofie.md, ch. 9.7):
 *
 *   memory.md            the sheet's memory for the model (English, short): the
 *                        intent, agreed assumptions, what was checked; the model
 *                        gets it at the start of every conversation and updates
 *                        it after one, so it does not start from nothing
 *   conversations.json   the conversations: questions, answers, model, time, the
 *                        theory the model had and the sources it cited with
 *                        their state; never printed
 *   entries.json         the journal: changes the model proposed, with what they
 *                        replace, and whether the user accepted or rejected them
 *
 * Both are files of the sheet under layers/<ai layer id>/: an older program
 * keeps them as they are.
 */

import { strFromU8, strToU8 } from 'fflate';
import type { SheetDocument } from './container.js';
import { withAiLayer } from './layers.js';

export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  /** ISO time it was written. */
  readonly time?: string;
  /** For an answer: the model that wrote it. */
  readonly model?: string;
  /** For an answer: the theory sections the model was given, and how many there were. */
  readonly theory?: { readonly sent: readonly string[]; readonly total: number };
  /** For an answer: the sources it cited, with their state when it was written (ch. 9.6). */
  readonly citations?: readonly { readonly id: string; readonly status: 'ok' | 'unknown' | 'misquoted'; readonly quote?: string }[];
}

export interface Conversation {
  readonly id: string;
  /** ISO time of the first question. */
  readonly started: string;
  /** Provider and model it was held with (the last used). */
  readonly provider?: string;
  readonly model?: string;
  readonly turns: readonly ConversationTurn[];
  /** How many of its turns the sheet's memory already takes in (the memory was updated after them). */
  readonly remembered?: number;
}

function path(layerId: string): string {
  return `layers/${layerId}/conversations.json`;
}

function memoryPath(layerId: string): string {
  return `layers/${layerId}/memory.md`;
}

function entriesPath(layerId: string): string {
  return `layers/${layerId}/entries.json`;
}

/** Whether the sheet keeps conversations, a memory or a journal for this layer: then its AI notes layer stays. */
export function hasConversations(files: ReadonlyMap<string, Uint8Array>, layerId: string): boolean {
  return files.has(path(layerId)) || files.has(memoryPath(layerId)) || files.has(entriesPath(layerId));
}

/** A change of the calculation the model proposed, and what became of it (ch. 9.7). */
export interface ChangeEntry {
  /** "<conversation id>:<turn>:<n>": the answer it came from. */
  readonly id: string;
  readonly kind: 'change';
  /** ISO time the answer came. */
  readonly time: string;
  readonly model?: string;
  readonly conversation?: string;
  /** Lines of the printed sheet it replaces (1-based), or after which it inserts. */
  readonly from: number;
  readonly to: number;
  readonly insert?: boolean;
  /** The lines it replaces, as they were when it was proposed; absent when they were not there. */
  readonly before?: readonly string[];
  readonly after: readonly string[];
  readonly state: 'open' | 'accepted' | 'rejected';
  /** ISO time of the decision. */
  readonly decided?: string;
  /** ISO time a person marked the accepted lines as reviewed; until then the sheet marks them as made by the AI. */
  readonly reviewed?: string;
  /** Accepted into a copy of the sheet with this title (a new tab); this sheet stayed as it was. */
  readonly copiedTo?: string;
}

/** A whole new calculation the model wrote, and whether it was opened as a new sheet. */
export interface SheetEntry {
  /** "<conversation id>:<turn>:s<n>": the answer it came from. */
  readonly id: string;
  readonly kind: 'sheet';
  readonly time: string;
  readonly model?: string;
  readonly conversation?: string;
  readonly title: string;
  readonly lines: readonly string[];
  readonly state: 'open' | 'accepted';
  readonly decided?: string;
  /** Title of the sheet it was opened as. */
  readonly copiedTo?: string;
}

export type JournalEntry = ChangeEntry | SheetEntry;

/** Every entry of the journal, of every kind (one this program does not know stays as it is). */
function journalOf(doc: SheetDocument): { id: string; kind: string }[] {
  const layer = doc.layers.find((l) => l.kind === 'ai');
  const data = layer && doc.files.get(entriesPath(layer.id));
  if (!data) return [];
  try {
    const value = JSON.parse(strFromU8(data)) as { entries?: unknown };
    return (Array.isArray(value.entries) ? value.entries : []).filter((e): e is { id: string; kind: string } => typeof e === 'object' && e !== null && typeof (e as { id?: unknown }).id === 'string');
  } catch {
    return [];
  }
}

/** The proposed changes of the journal, oldest first. */
export function entriesOf(doc: SheetDocument): ChangeEntry[] {
  return journalOf(doc).filter((e): e is ChangeEntry => e.kind === 'change');
}

/** The new sheets the model wrote, oldest first. */
export function newSheetsOf(doc: SheetDocument): SheetEntry[] {
  return journalOf(doc).filter((e): e is SheetEntry => e.kind === 'sheet' && Array.isArray((e as SheetEntry).lines));
}

/**
 * Lines of the sheet that came from accepted AI changes nobody has reviewed yet,
 * by line number (1-based). A change is found by its lines as accepted, nearest
 * to where it was put, so it follows when lines above are added or removed; once
 * a person edits such a line, it is theirs and no longer marked.
 */
export function aiMadeLines(source: string, entries: readonly ChangeEntry[]): Map<number, ChangeEntry> {
  const lines = source.split(/\r?\n/);
  const made = new Map<number, ChangeEntry>();
  for (const entry of entries) {
    if (entry.state !== 'accepted' || entry.reviewed || entry.copiedTo || entry.after.length === 0) continue;
    const anchor = entry.insert ? entry.from + 1 : entry.from;
    let best: number | undefined;
    for (let at = 1; at + entry.after.length - 1 <= lines.length; at++) {
      if (!entry.after.every((l, i) => lines[at - 1 + i] === l)) continue;
      if (best === undefined || Math.abs(at - anchor) < Math.abs(best - anchor)) best = at;
    }
    if (best !== undefined) for (let i = 0; i < entry.after.length; i++) made.set(best + i, entry);
  }
  return made;
}

/** The sheet with these entries added, or replaced by id. */
export function withEntries(doc: SheetDocument, entries: readonly JournalEntry[]): SheetDocument {
  if (entries.length === 0) return doc;
  const list: { id: string }[] = journalOf(doc);
  for (const entry of entries) {
    const at = list.findIndex((e) => e.id === entry.id);
    if (at < 0) list.push(entry);
    else list[at] = entry;
  }
  const layers = withAiLayer(doc.layers);
  const layer = layers.find((l) => l.kind === 'ai')!;
  const files = new Map(doc.files);
  files.set(entriesPath(layer.id), strToU8(JSON.stringify({ version: 1, entries: list }, null, 2) + '\n'));
  return { ...doc, layers, files };
}

/** The sheet's memory for the model, or '' when there is none. */
export function aiMemoryOf(doc: SheetDocument): string {
  const layer = doc.layers.find((l) => l.kind === 'ai');
  const data = layer && doc.files.get(memoryPath(layer.id));
  return data ? strFromU8(data) : '';
}

/** The sheet with a new memory for the model; '' removes it. */
export function withAiMemory(doc: SheetDocument, memory: string): SheetDocument {
  const text = memory.trim();
  const layers = text ? withAiLayer(doc.layers) : doc.layers;
  const layer = layers.find((l) => l.kind === 'ai');
  if (!layer) return doc;
  const files = new Map(doc.files);
  if (text) files.set(memoryPath(layer.id), strToU8(`${text}\n`));
  else files.delete(memoryPath(layer.id));
  return { ...doc, layers, files };
}

/** The conversations of a sheet, oldest first. */
export function conversationsOf(doc: SheetDocument): Conversation[] {
  const layer = doc.layers.find((l) => l.kind === 'ai');
  const data = layer && doc.files.get(path(layer.id));
  if (!data) return [];
  try {
    const value = JSON.parse(strFromU8(data)) as { conversations?: unknown };
    const list = Array.isArray(value.conversations) ? value.conversations : [];
    return list.filter((c): c is Conversation => typeof c === 'object' && c !== null && typeof (c as Conversation).id === 'string' && Array.isArray((c as Conversation).turns));
  } catch {
    return [];
  }
}

function withList(doc: SheetDocument, list: readonly Conversation[]): SheetDocument {
  // The AI notes layer comes with the first conversation (and none is made for an empty list).
  const layers = list.length > 0 ? withAiLayer(doc.layers) : doc.layers;
  const layer = layers.find((l) => l.kind === 'ai');
  if (!layer) return doc;
  const files = new Map(doc.files);
  if (list.length === 0) files.delete(path(layer.id));
  else files.set(path(layer.id), strToU8(JSON.stringify({ version: 1, conversations: list }, null, 2) + '\n'));
  return { ...doc, layers, files };
}

/** The sheet with this conversation added, or replaced when it is there already. */
export function withConversation(doc: SheetDocument, conversation: Conversation): SheetDocument {
  const list = conversationsOf(doc);
  const at = list.findIndex((c) => c.id === conversation.id);
  return withList(doc, at < 0 ? [...list, conversation] : list.map((c, i) => (i === at ? conversation : c)));
}

export function withoutConversation(doc: SheetDocument, id: string): SheetDocument {
  return withList(doc, conversationsOf(doc).filter((c) => c.id !== id));
}
