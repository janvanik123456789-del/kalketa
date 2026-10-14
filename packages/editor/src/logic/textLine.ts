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
  /** One of RUN_COLORS; the colour of the line when absent. */
  readonly color?: string;
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

/** The named colours a part of a text may have ({red}words{/}); any other as {#c00000}words{/}. */
export const RUN_COLORS = ['gray', 'blue', 'red', 'green'] as const;
const COLORED = /\{(gray|blue|red|green|#[0-9a-fA-F]{6})\}([\s\S]*?)\{\/\}/g;

/** **bold**, *italic* and {red}coloured{/} words of the language as runs; a lone * (2 * 3) stays a character. */
export function runsOf(content: string): TextRun[] {
  const runs: TextRun[] = [];
  const same = (a: TextRun, b: Omit<TextRun, 'text'>) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && a.color === b.color;
  const push = (text: string, format: Omit<TextRun, 'text'> = {}) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && same(last, format)) runs[runs.length - 1] = { ...last, text: last.text + text };
    else runs.push({ text, ...format });
  };
  const emphasis = (part: string, color: string | undefined) => {
    const tint = color ? { color } : {};
    const pattern = /\*\*\*([^*\s](?:.*?[^*\s])?)\*\*\*|\*\*([^*\s](?:.*?[^*\s])?)\*\*|(^|[^*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?!\*)/g;
    let at = 0;
    for (const m of part.matchAll(pattern)) {
      push(part.slice(at, m.index! + (m[3]?.length ?? 0)), tint);
      if (m[1] !== undefined) push(m[1], { bold: true, italic: true, ...tint });
      else if (m[2] !== undefined) push(m[2], { bold: true, ...tint });
      else push(m[4]!, { italic: true, ...tint });
      at = m.index! + m[0].length;
    }
    push(part.slice(at), tint);
  };
  let at = 0;
  for (const m of content.matchAll(COLORED)) {
    emphasis(content.slice(at, m.index), undefined);
    emphasis(m[2]!, m[1]);
    at = m.index! + m[0].length;
  }
  emphasis(content.slice(at), undefined);
  return runs;
}

/** Runs written with the marks of the language; the spaces at the edge of a run stay outside its marks. */
export function marksOf(runs: readonly TextRun[]): string {
  const emphasis = (run: TextRun) => {
    if (!run.bold && !run.italic) return run.text;
    const lead = /^\s*/.exec(run.text)![0];
    const tail = /\s*$/.exec(run.text)![0];
    const core = run.text.slice(lead.length, run.text.length - tail.length);
    if (!core) return run.text;
    const mark = run.bold && run.italic ? '***' : run.bold ? '**' : '*';
    return `${lead}${mark}${core}${mark}${tail}`;
  };
  // Runs of one colour one after another stand in one {colour}…{/}.
  let out = '';
  for (let i = 0; i < runs.length; ) {
    const color = runs[i]!.color;
    let group = '';
    for (; i < runs.length && runs[i]!.color === color; i++) group += emphasis(runs[i]!);
    out += color && group.trim() ? `{${color}}${group}{/}` : group;
  }
  return out;
}

/** The words of a line as plain text (what search and an empty check read). */
export function plainOf(line: TextLine): string {
  return line.runs.map((r) => r.text).join('');
}

/** The words from start to end in a colour of their own (undefined: that of the line). */
export function recolor(runs: readonly TextRun[], start: number, end: number, color: string | undefined): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  const put = (run: TextRun, text: string, inside: boolean) => {
    if (!text) return;
    const { color: own, ...rest } = run;
    const next: TextRun = { ...rest, text, ...(inside ? (color ? { color } : {}) : own ? { color: own } : {}) };
    const last = out[out.length - 1];
    if (last && !!last.bold === !!next.bold && !!last.italic === !!next.italic && last.color === next.color) out[out.length - 1] = { ...last, text: last.text + text };
    else out.push(next);
  };
  for (const run of runs) {
    const from = Math.max(0, Math.min(run.text.length, start - at));
    const to = Math.max(0, Math.min(run.text.length, end - at));
    put(run, run.text.slice(0, from), false);
    put(run, run.text.slice(from, to), true);
    put(run, run.text.slice(to), false);
    at += run.text.length;
  }
  return out;
}
