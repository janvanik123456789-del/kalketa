/**
 * Conversations with the AI, kept in the AI notes layer (docs/01-filozofie.md,
 * ch. 9.3): what the user asked, what the model answered, which model and
 * when, and which theory sections it had. They belong to the calculation
 * file, are never printed, and a conversation can be taken up again after the
 * file is opened.
 *
 * Stored as layers/<ai layer id>/conversations.json among the files of the
 * sheet: an older program keeps the entry as it is.
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
}

export interface Conversation {
  readonly id: string;
  /** ISO time of the first question. */
  readonly started: string;
  /** Provider and model it was held with (the last used). */
  readonly provider?: string;
  readonly model?: string;
  readonly turns: readonly ConversationTurn[];
}

function path(layerId: string): string {
  return `layers/${layerId}/conversations.json`;
}

/** Whether the sheet keeps conversations for this layer: then its AI notes layer stays. */
export function hasConversations(files: ReadonlyMap<string, Uint8Array>, layerId: string): boolean {
  return files.has(path(layerId));
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
