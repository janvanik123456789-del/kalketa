/**
 * Undo/redo over whole document states. Documents are immutable, so a
 * snapshot is just a reference.
 *
 * Changes with the same `group` that follow each other quickly (typing in one
 * line, dragging a value) merge into one undo step.
 */

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** Group and time of the last change, for merging. */
  readonly lastGroup?: string;
  readonly lastTime: number;
}

export const MERGE_WINDOW_MS = 1500;
const LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastTime: 0 };
}

export function record<T>(h: History<T>, next: T, group?: string, now = Date.now()): History<T> {
  if (next === h.present) return h;
  const merge = group !== undefined && group === h.lastGroup && now - h.lastTime < MERGE_WINDOW_MS && h.past.length > 0;
  const past = merge ? h.past : [...h.past, h.present].slice(-LIMIT);
  return { past, present: next, future: [], ...(group !== undefined ? { lastGroup: group } : {}), lastTime: now };
}

export function undo<T>(h: History<T>): History<T> {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastTime: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1), lastTime: 0 };
}

/** Starts over (a new or opened document); nothing to undo. */
export function reset<T>(present: T): History<T> {
  return createHistory(present);
}
