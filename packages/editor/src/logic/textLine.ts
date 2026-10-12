/**
 * A line of text or a heading of the sheet as a person edits it in a word
 * processor: its words with bold and italic parts, its paragraph style and the
 * look of the whole line. The marks of the language ("…", **, *, #, {size=12})
 * stay out of sight; this reads them from the line and writes them back.
 *
 *   "Mez pevnosti *oceli*" [T1] {size=12 align=center}  ' a note
 *   ## Zadání {pos}
 */

import { lineAttributesOf, withLineAttributes, type LineAttributes } from './lineFormat.js';

/** A piece of the words in one format. */
export interface TextRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
}

export interface TextLine {
  /** 0 for a paragraph of text, 1–3 for a heading (#, ##, ###). */
  readonly level: number;
  readonly indent: string;
  readonly runs: readonly TextRun[];
  /** The sources after the text, " [T1] [ST:T2]", as written. */
  readonly cites: string;
  readonly attributes: LineAttributes;
  /** A note after ', as written (with its ' and the space before it). */
  readonly comment: string;
}

const TEXT = /^(\s*)"([^"\n]*)(")((?:\s*\[[^\]\n]+\])*)\s*(\{[^{}"\n]*\})?\s*('.*)?$/;
/** A text whose closing quote got lost: its marks {…} at the end are still its marks, not its words. */
const OPEN_TEXT = /^(\s*)"([^"\n]*?)()((?:\s*\[[^\]\n]+\])*)\s*(\{[^{}"\n]*\})?\s*$/;
const HEADING = /^(\s*)(#{1,3})(?:\s+(.*?))?\s*(\{[^{}"\n]*\})?\s*$/;

/** The line as a person edits it; undefined when it is no text or heading (a formula, a line of more lines). */
export function parseTextLine(line: string): TextLine | undefined {
  if (line.includes('\n')) return undefined;
  const heading = HEADING.exec(line);
  if (heading) {
    return { level: heading[2]!.length, indent: heading[1]!, runs: runsOf(heading[3] ?? ''), cites: '', attributes: lineAttributesOf(line), comment: '' };
  }
  const text = TEXT.exec(line) ?? OPEN_TEXT.exec(line);
  if (!text) return undefined;
  return { level: 0, indent: text[1]!, runs: runsOf(text[2]!), cites: text[4] ?? '', attributes: text[5] ? lineAttributesOf(line) : new Map(), comment: text[6] ? `  ${text[6]}` : '' };
}

/** The line written back in the language: its words in quotes (or after #), its marks after them. */
export function formatTextLine(line: TextLine): string {
  // A quote would end the text: the words get a typographic one instead.
  const words = marksOf(line.runs).replace(/"/g, '”');
  const body = line.level > 0 ? `${line.indent}${'#'.repeat(line.level)} ${words}` : `${line.indent}"${words}"${line.cites}`;
  const withMarks = withLineAttributes(body, line.attributes);
  return line.comment ? `${withMarks}${line.comment}` : withMarks;
}

/** **bold** and *italic* words of the language as runs; a lone * (2 * 3) stays a character. */
export function runsOf(content: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (text: string, format: Omit<TextRun, 'text'> = {}) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && !!last.bold === !!format.bold && !!last.italic === !!format.italic) runs[runs.length - 1] = { ...last, text: last.text + text };
    else runs.push({ text, ...format });
  };
  const pattern = /\*\*\*([^*\s](?:.*?[^*\s])?)\*\*\*|\*\*([^*\s](?:.*?[^*\s])?)\*\*|(^|[^*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?!\*)/g;
  let at = 0;
  for (const m of content.matchAll(pattern)) {
    push(content.slice(at, m.index! + (m[3]?.length ?? 0)));
    if (m[1] !== undefined) push(m[1], { bold: true, italic: true });
    else if (m[2] !== undefined) push(m[2], { bold: true });
    else push(m[4]!, { italic: true });
    at = m.index! + m[0].length;
  }
  push(content.slice(at));
  return runs;
}

/** Runs written with the marks of the language; the spaces at the edge of a run stay outside its marks. */
export function marksOf(runs: readonly TextRun[]): string {
  return runs
    .map((run) => {
      if (!run.bold && !run.italic) return run.text;
      const lead = /^\s*/.exec(run.text)![0];
      const tail = /\s*$/.exec(run.text)![0];
      const core = run.text.slice(lead.length, run.text.length - tail.length);
      if (!core) return run.text;
      const mark = run.bold && run.italic ? '***' : run.bold ? '**' : '*';
      return `${lead}${mark}${core}${mark}${tail}`;
    })
    .join('');
}

/** The words of a line as plain text (what search and an empty check read). */
export function plainOf(line: TextLine): string {
  return line.runs.map((r) => r.text).join('');
}
