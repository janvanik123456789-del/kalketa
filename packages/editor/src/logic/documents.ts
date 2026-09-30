/**
 * Open documents, one tab each. Every document keeps its own undo history,
 * saved state, file and open layers; the window around them is shared.
 */

import { createHistory, type History } from './history.js';

export interface DocTab<D, R> {
  readonly id: number;
  readonly history: History<D>;
  /** The state last saved (or opened); the document is unsaved when it differs. */
  readonly savedDoc: D;
  readonly fileRef?: R;
  /** File path when there is one, to find a file that is already open. */
  readonly path?: string;
  /** Layers open side by side, and which of them is being worked on. */
  readonly panes: readonly string[];
  readonly activePane: number;
  /** A new, empty calculation: a file opened while it is untouched takes its place. */
  readonly blank?: boolean;
}

let lastId = 0;

export function newTab<D, R>(doc: D, firstPane: string, file?: { ref: R; path?: string }, blank = false): DocTab<D, R> {
  return {
    id: ++lastId,
    ...(blank ? { blank: true } : {}),
    history: createHistory(doc),
    savedDoc: doc,
    ...(file ? { fileRef: file.ref, ...(file.path !== undefined ? { path: file.path } : {}) } : {}),
    panes: [firstPane],
    activePane: 0,
  };
}

export function isDirty<D, R>(tab: DocTab<D, R>): boolean {
  return tab.history.present !== tab.savedDoc;
}

/**
 * A new, empty document nobody has touched: opening a file may take its place
 * (as in a word processor). The example and files are never replaced.
 */
export function isPristine<D, R>(tab: DocTab<D, R>): boolean {
  return tab.blank === true && !isDirty(tab) && tab.fileRef === undefined && tab.history.past.length === 0;
}

export interface Tabs<D, R> {
  readonly tabs: readonly DocTab<D, R>[];
  readonly active: number;
}

/**
 * Shows a document: a file that is already open is only switched to; a file
 * takes the place of an untouched new document; otherwise (and always for a
 * new document) a tab is added after the active one.
 */
export function openTab<D, R>(state: Tabs<D, R>, tab: DocTab<D, R>): Tabs<D, R> {
  const existing = tab.path !== undefined ? state.tabs.find((t) => t.path === tab.path) : undefined;
  if (existing) return { tabs: state.tabs, active: existing.id };
  const index = state.tabs.findIndex((t) => t.id === state.active);
  const current = state.tabs[index];
  if (current && !tab.blank && isPristine(current)) {
    return { tabs: state.tabs.map((t) => (t.id === current.id ? tab : t)), active: tab.id };
  }
  const tabs = [...state.tabs];
  tabs.splice(index + 1, 0, tab);
  return { tabs, active: tab.id };
}

/** Closes a tab; its right neighbour (else the left one) becomes active. The last tab is replaced by `empty`. */
export function closeTab<D, R>(state: Tabs<D, R>, id: number, empty: () => DocTab<D, R>): Tabs<D, R> {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index === -1) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (tabs.length === 0) {
    const fresh = empty();
    return { tabs: [fresh], active: fresh.id };
  }
  const active = state.active === id ? tabs[Math.min(index, tabs.length - 1)]!.id : state.active;
  return { tabs, active };
}

/** The next (+1) or previous (-1) tab, wrapping around. */
export function cycleTab<D, R>(state: Tabs<D, R>, direction: 1 | -1): number {
  const index = state.tabs.findIndex((t) => t.id === state.active);
  const next = (index + direction + state.tabs.length) % state.tabs.length;
  return state.tabs[next]?.id ?? state.active;
}

/** "Nosnik.calc" from "C:\Vypocty\Nosnik.calc" or "/home/x/Nosnik.calc". */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
