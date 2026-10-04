/**
 * What of a PDF page goes into the sources as text and what as a cut-out
 * (docs/01-filozofie.md, ch. 9.6): pictures (where the PDF draws an image) and
 * formulas (lines whose text comes out as scraps, or a formula number alone)
 * are cut out at their place; the rest is text. A picture covering most of the
 * page is a scanned page, not a figure: it is left out of the search.
 *
 * Coordinates are those of the page at scale 1 (PDF points), y downwards.
 */
import { formulaOrScraps } from './pdfText.js';

export interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface LayoutLine extends Box {
  readonly text: string;
}

export type LayoutItem = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'cut'; readonly box: Box; readonly why: 'picture' | 'formula' };

/** A picture covering more of the page than this is a scanned page. */
const SCAN_SHARE = 0.6;
/** Smaller pictures (points) are decoration: bullets, rules. */
const MIN_PICTURE = 16;
/** Room around a cut-out (points), so nothing at its edge is lost. */
const PAD = 4;

const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);
const near = (a: Box, b: Box, gap: number) => a.left - gap <= b.right && b.left - gap <= a.right && a.top - gap <= b.bottom && b.top - gap <= a.bottom;
const union = (a: Box, b: Box): Box => ({ top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) });
const padded = (b: Box, page: { width: number; height: number }): Box => ({ top: Math.max(0, b.top - PAD), bottom: Math.min(page.height, b.bottom + PAD), left: Math.max(0, b.left - PAD), right: Math.min(page.width, b.right + PAD) });

/** Boxes that touch or nearly touch become one: a figure drawn in pieces is one cut-out. */
function merged(boxes: readonly Box[], gap: number): Box[] {
  const out = [...boxes];
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++)
      for (let j = i + 1; j < out.length && !changed; j++)
        if (near(out[i]!, out[j]!, gap)) {
          out[i] = union(out[i]!, out[j]!);
          out.splice(j, 1);
          changed = true;
        }
  }
  return out;
}

export function pageLayout(lines: readonly LayoutLine[], pictures: readonly Box[], page: { readonly width: number; readonly height: number }): LayoutItem[] {
  const figures = merged(
    pictures.filter((p) => p.right - p.left >= MIN_PICTURE && p.bottom - p.top >= MIN_PICTURE && area(p) < SCAN_SHARE * page.width * page.height),
    6,
  );
  // Text inside a figure (its labels) belongs to the figure.
  const inFigure = (l: LayoutLine) => figures.some((f) => (l.top + l.bottom) / 2 >= f.top - PAD && (l.top + l.bottom) / 2 <= f.bottom + PAD && (l.left + l.right) / 2 >= f.left - PAD && (l.left + l.right) / 2 <= f.right + PAD);
  const sorted = [...lines].sort((a, b) => a.top - b.top || a.left - b.left);
  const text: LayoutLine[] = [];
  const formulaLines: LayoutLine[] = [];
  for (const l of sorted) {
    if (inFigure(l)) continue;
    if (formulaOrScraps(l.text)) formulaLines.push(l);
    else text.push(l);
  }
  // Formula lines one under another make one formula; one touching a figure joins it.
  const lineHeight = (l: Box) => Math.max(4, l.bottom - l.top);
  const formulas: Box[] = [];
  for (const l of formulaLines) {
    const last = formulas[formulas.length - 1];
    if (last && l.top - last.bottom < 1.2 * lineHeight(l)) formulas[formulas.length - 1] = union(last, l);
    else formulas.push({ top: l.top, bottom: l.bottom, left: l.left, right: l.right });
  }
  const cuts: { box: Box; why: 'picture' | 'formula' }[] = figures.map((box) => ({ box, why: 'picture' as const }));
  for (const f of formulas) {
    const touching = cuts.find((c) => near(c.box, f, PAD));
    if (touching) touching.box = union(touching.box, f);
    else cuts.push({ box: f, why: 'formula' });
  }
  const items: { top: number; item: LayoutItem }[] = [
    ...text.map((l) => ({ top: l.top, item: { kind: 'text' as const, text: l.text } })),
    ...cuts.map((c) => ({ top: c.box.top, item: { kind: 'cut' as const, box: padded(c.box, page), why: c.why } })),
  ];
  return items.sort((a, b) => a.top - b.top).map((x) => x.item);
}
