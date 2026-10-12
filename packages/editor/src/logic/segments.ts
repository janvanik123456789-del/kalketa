/**
 * The editor works on segments: the source lines of one statement (a
 * statement may continue over several lines while brackets are open), or a
 * single blank line. Editing a segment replaces exactly those lines, so the
 * source text stays the single source of truth.
 */

import type { Statement } from '@kalketa/core';
import { lineAttributesOf, withLineAttribute } from './lineFormat.js';

export interface Segment {
  /** First and last source line, 1-based, inclusive. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Index into the parsed statements; undefined for blank lines. */
  readonly statement?: number;
}

export function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

/**
 * Splits the source into segments. `fixed` is the line range being edited:
 * it stays one segment even if an unfinished line (an open bracket) makes the
 * parser run on into the following lines, which then show as plain lines.
 */
export function segments(source: string, statements: readonly Statement[], fixed?: { start: number; end: number }): Segment[] {
  const lines = splitLines(source);
  const out: Segment[] = [];
  let line = 1;
  const pushPlain = (upTo: number) => {
    for (; line < upTo; line++) out.push({ start: line, end: line, text: lines[line - 1] ?? '' });
  };
  const push = (start: number, end: number, statement: number | undefined) => {
    pushPlain(start);
    out.push({ start, end, text: lines.slice(start - 1, end).join('\n'), ...(statement !== undefined ? { statement } : {}) });
    line = end + 1;
  };

  statements.forEach((s, index) => {
    const start = s.span.line;
    let end = start + (source.slice(s.span.offset, s.span.offset + s.span.length).match(/\n/g)?.length ?? 0);
    if (start < line) return; // already covered
    if (fixed && start < fixed.start && end >= fixed.start) end = fixed.start - 1;
    if (fixed && start >= fixed.start && start <= fixed.end) {
      if (start === fixed.start) push(fixed.start, fixed.end, index);
      return;
    }
    if (fixed && line <= fixed.start && start > fixed.end) push(fixed.start, fixed.end, undefined);
    push(start, end, index);
  });
  if (fixed && line <= fixed.start) push(fixed.start, fixed.end, undefined);
  // A trailing newline leaves one empty line at the end; keep it editable.
  pushPlain(lines.length + 1);
  return out;
}

/** Replaces lines start..end (1-based, inclusive) with new text (may contain newlines). */
export function replaceLines(source: string, start: number, end: number, text: string): string {
  const lines = splitLines(source);
  lines.splice(start - 1, end - start + 1, ...text.split(/\r?\n/));
  return lines.join('\n');
}

/** Inserts a new line after `line` (0 = at the top). */
export function insertLineAfter(source: string, line: number, text = ''): string {
  const lines = splitLines(source);
  lines.splice(line, 0, text);
  return lines.join('\n');
}

/** Moves lines start..end so they follow line `after` of the text as it is now (0 = to the top). */
export function moveLines(source: string, start: number, end: number, after: number): string {
  if (after >= start - 1 && after <= end) return source;
  const lines = splitLines(source);
  const moved = lines.splice(start - 1, end - start + 1);
  lines.splice(after > end ? after - moved.length : after, 0, ...moved);
  return lines.join('\n');
}

/** Several line ranges at once, the lowest last so the numbers of the others hold. */
export function deleteLineRanges(source: string, ranges: readonly { start: number; end: number }[]): string {
  const lines = splitLines(source);
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) removeLines(lines, r.start, r.end);
  return lines.join('\n');
}

export function deleteLines(source: string, start: number, end: number): string {
  const lines = splitLines(source);
  removeLines(lines, start, end);
  return lines.join('\n');
}

/**
 * Lines start..end taken out. The first cell of a row gone, the cell beside it starts the row
 * (its {beside} goes), so it never moves up beside the row above.
 */
function removeLines(lines: string[], start: number, end: number): void {
  const first = lines[start - 1] ?? '';
  const next = lines[end];
  lines.splice(start - 1, end - start + 1);
  if (next !== undefined && !lineAttributesOf(first).has('beside') && lineAttributesOf(next).has('beside')) {
    lines[start - 1] = withLineAttribute(next, 'beside', undefined);
  }
}
