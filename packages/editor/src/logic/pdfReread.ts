/**
 * Text of the sources read again from the pages of its PDF (docs/navrhy/RESIC-A-STYLY.md,
 * point 5): the text layer of a scanned book reads Greek letters, indexes and formulas wrongly,
 * so each run of text of a page (the lines between two cut-outs) is cut out as a picture and
 * written again by a model that reads images, with the old text as a hint. Here: which pages
 * the sources took, the runs of a laid-out page, and which paragraphs of the sources a run
 * replaces. The user confirms every change.
 */
import type { Box, LayoutItem } from './pdfLayout.js';

/** The pages the chapters of the sources took, from their headings: "## Střih (s. 36–38) {#T1}". */
export function sourcePageLabels(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const range = /^#{1,3}\s.*\(s\.\s*([^)–-]+?)(?:\s*[–-]\s*([^)]+?))?\)/.exec(line);
    if (!range) continue;
    const [from, to] = [range[1]!.trim(), range[2]?.trim()];
    const [a, b] = [Number(from), Number(to)];
    if (to && Number.isInteger(a) && Number.isInteger(b) && b >= a && b - a < 500) for (let p = a; p <= b; p++) out.push(String(p));
    else out.push(from, ...(to ? [to] : []));
  }
  return [...new Set(out)];
}

/** A run of text lines of a page between two cut-outs, and where it stands. */
export interface TextRun {
  readonly text: string;
  readonly box: Box;
}

/** The runs of text of a laid-out page, in order; a cut-out ends a run. */
export function textRuns(items: readonly LayoutItem[]): TextRun[] {
  const runs: TextRun[] = [];
  let lines: string[] = [];
  let box: Box | undefined;
  const close = () => {
    if (lines.length > 0 && box) runs.push({ text: lines.join('\n'), box });
    lines = [];
    box = undefined;
  };
  for (const item of items) {
    if (item.kind !== 'text' || !item.box) {
      close();
      continue;
    }
    lines.push(item.text);
    box = box ? { top: Math.min(box.top, item.box.top), bottom: Math.max(box.bottom, item.box.bottom), left: Math.min(box.left, item.box.left), right: Math.max(box.right, item.box.right) } : item.box;
  }
  close();
  return runs;
}

/** Words of a text that tell it apart: letters only, lower case, three and more of them. */
function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}{3,}/gu) ?? [];
}

/** A paragraph of the sources: its lines, and whether it is plain text the run may replace. */
interface Block {
  readonly text: string;
  readonly plain: boolean;
}

/** The sources as blocks: paragraphs of text, and everything else (headings, pictures, code, tables) kept as it is. */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let current: string[] = [];
  let fence = false;
  const close = () => {
    if (current.length === 0) return;
    const joined = current.join('\n');
    blocks.push({ text: joined, plain: !/^\s*(#|!\[|```|\||>|[-*]\s)/.test(joined) });
    current = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      if (!fence) close();
      current.push(line);
      fence = !fence;
      if (!fence) close();
      continue;
    }
    if (fence) {
      current.push(line);
      continue;
    }
    if (line.trim() === '') close();
    else current.push(line);
  }
  close();
  return blocks;
}

/** A paragraph of the sources written again: which blocks go, and the text in their place. */
export interface RereadChange {
  /** Index of the first and the last block replaced. */
  readonly from: number;
  readonly to: number;
  readonly old: string;
  readonly text: string;
}

/**
 * The paragraphs of the sources a run of a page was: the plain paragraphs whose words are
 * mostly in the run (most of a paragraph, as the tidying of the text may have changed a little),
 * one after another. Undefined when the sources do not hold it any more.
 */
export function matchRun(sources: string, runText: string): { from: number; to: number; old: string } | undefined {
  const blocks = blocksOf(sources);
  const inRun = new Map<string, number>();
  for (const w of words(runText)) inRun.set(w, (inRun.get(w) ?? 0) + 1);
  const covered = (block: Block) => {
    const own = words(block.text);
    if (own.length === 0) return 0;
    const left = new Map(inRun);
    let found = 0;
    for (const w of own) {
      const n = left.get(w) ?? 0;
      if (n > 0) {
        found++;
        left.set(w, n - 1);
      }
    }
    return found / own.length;
  };
  const hits = blocks.map((b, i) => (b.plain && covered(b) >= 0.7 ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) return undefined;
  // The longest stretch of hits next to each other (blocks between them that are not text, like a heading, end it).
  let best = { from: hits[0]!, to: hits[0]! };
  let run = { ...best };
  for (const i of hits.slice(1)) {
    run = i === run.to + 1 ? { from: run.from, to: i } : { from: i, to: i };
    if (run.to - run.from > best.to - best.from) best = run;
  }
  return { ...best, old: blocks.slice(best.from, best.to + 1).map((b) => b.text).join('\n\n') };
}

/** The sources with the accepted changes in their place (the blocks they replace, from the end). */
export function applyReread(sources: string, changes: readonly RereadChange[]): string {
  const blocks = blocksOf(sources).map((b) => b.text);
  for (const c of [...changes].sort((a, b) => b.from - a.from)) blocks.splice(c.from, c.to - c.from + 1, c.text);
  return blocks.join('\n\n');
}
