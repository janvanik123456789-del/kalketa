/**
 * What of a PDF page goes into the sources as text and what as a cut-out
 * (docs/01-filozofie.md, ch. 9.6): pictures (where the PDF draws an image, or
 * a drawing made of lines and shapes) and formulas (lines whose text comes out
 * as scraps, or a formula number alone) are cut out at their place; the rest is
 * text. A picture covering most of the page is a scanned page, not a figure.
 *
 * A drawing is found from its solid shapes (rectangles, arrow heads, supports);
 * thin lines join it only where they touch it, so the bar of a fraction, a rule
 * under a heading or the lines of a table make no picture. A formula is cut out
 * from the line of text above it to the one below it (at most a line and a half
 * more), across the column of text, so the parts of a fraction are not lost.
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

/** A line thinner than this (points) is a rule, not a shape of a drawing. */
const THIN = 2;
/** A drawing smaller than this (points²) is a sign, not a picture: a root, a bullet. */
const MIN_DRAWING = 30 * 20;

/** Drawings made of shapes: solid shapes close together, with the thin lines that touch them. */
function drawingsOf(drawn: readonly Box[], lines: readonly LayoutLine[], page: { width: number; height: number }): Box[] {
  const usable = drawn.filter((d) => area(d) < SCAN_SHARE * page.width * page.height);
  const thin = (d: Box) => Math.min(d.right - d.left, d.bottom - d.top) < THIN;
  let boxes = merged(usable.filter((d) => !thin(d)), 8);
  // A thin line may touch the drawing only through another one (a dimension line): passes until none is added.
  let left = usable.filter(thin);
  for (let added = true; added && boxes.length > 0; ) {
    added = false;
    left = left.filter((line) => {
      const at = boxes.findIndex((b) => near(b, line, 3));
      if (at < 0) return true;
      boxes[at] = union(boxes[at]!, line);
      added = true;
      return false;
    });
  }
  boxes = merged(boxes, 8);
  // A shape under text (a coloured cell, a highlighted word) is not a picture.
  const covered = (b: Box) => lines.reduce((sum, l) => sum + Math.max(0, Math.min(b.right, l.right) - Math.max(b.left, l.left)) * Math.max(0, Math.min(b.bottom, l.bottom) - Math.max(b.top, l.top)), 0);
  return boxes.filter((b) => area(b) >= MIN_DRAWING && covered(b) < 0.5 * area(b));
}

/**
 * Room kept from a line of text (a share of its height): a recognised line (OCR)
 * is smaller than its letters on the scan, ascenders and descenders reach out of it.
 */
const KEEP_OFF = 0.5;

/**
 * Where a picture has ink: the bounds of its pixels darker than `threshold` (RGBA),
 * or undefined when it is blank. A cut-out is trimmed to them, so no white
 * margin (or what of the text reached into it) stays around a figure.
 */
export function inkBounds(pixels: ArrayLike<number>, width: number, height: number, threshold = 200): Box | undefined {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if ((pixels[i + 3] ?? 255) < 32 || ((pixels[i] ?? 255) + (pixels[i + 1] ?? 255) + (pixels[i + 2] ?? 255)) / 3 >= threshold) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  return bottom < 0 ? undefined : { top, bottom: bottom + 1, left, right: right + 1 };
}

/** A caption under a figure: "Obr. 40 Vetknutý nosník", "Obrázek 3", "Fig. 2". */
const CAPTION = /^(Obr\.|Obrázek|Fig\.|Figure)\s*\d+/i;

export function pageLayout(lines: readonly LayoutLine[], pictures: readonly Box[], page: { readonly width: number; readonly height: number }, drawn: readonly Box[] = []): LayoutItem[] {
  const pageArea = page.width * page.height;
  // A scanned page: one picture over most of it, its text recognised (OCR) on top.
  const scanned = pictures.some((p) => area(p) >= SCAN_SHARE * pageArea);
  const figures = merged([...pictures.filter((p) => p.right - p.left >= MIN_PICTURE && p.bottom - p.top >= MIN_PICTURE && area(p) < SCAN_SHARE * pageArea), ...drawingsOf(drawn, lines, page)], 6);
  const lineHeight = (l: Box) => Math.max(4, l.bottom - l.top);
  const inside = (l: Box, f: Box) => (l.top + l.bottom) / 2 >= f.top - PAD && (l.top + l.bottom) / 2 <= f.bottom + PAD && (l.left + l.right) / 2 >= f.left - PAD && (l.left + l.right) / 2 <= f.right + PAD;

  // Each line: text, a numbered formula, or scraps (also a lone one- or two-character line, the index
  // of a formula; the page number on the last line stays text).
  const sorted = [...lines].sort((a, b) => a.top - b.top || a.left - b.left);
  const kindOf = (l: LayoutLine, i: number): 'text' | 'formula' | 'scraps' => formulaOrScraps(l.text) ?? (l.text.trim().length <= 2 && i < sorted.length - 1 ? 'scraps' : 'text');
  let classified = sorted.map((l, i) => ({ line: l, kind: kindOf(l, i) })).filter((x) => !figures.some((f) => inside(x.line, f)));
  // Scraps level with a line of text are an index or a fraction inside that sentence ("M_omax", "x = 2/3 l"): they belong to it.
  const textLines = classified.filter((x) => x.kind === 'text').map((x) => x.line);
  classified = classified.filter((x) => x.kind !== 'scraps' || !textLines.some((t) => { const mid = (x.line.top + x.line.bottom) / 2; const lh = lineHeight(t); return mid >= t.top - 0.6 * lh && mid <= t.bottom + 0.6 * lh && x.line.left < t.right + lh && x.line.right > t.left - lh; }));

  // A figure the PDF has no shapes for (a scan): the gap in the text above its caption, or on a
  // scan a large empty gap. A numbered formula at the top of the gap stays a formula of its own.
  const real = classified.filter((x) => x.kind === 'text').map((x) => x.line);
  // Figures found as gaps in the text: they keep off the text, no room is added around them.
  const gaps = new Set<Box>();
  const column = real.length > 0 ? { left: Math.min(...real.map((l) => l.left)), right: Math.max(...real.map((l) => l.right)) } : { left: PAD, right: page.width - PAD };
  // A figure at the top of the page has no text above it: the top of what the page holds stands for that line.
  const firstTop = Math.min(...sorted.map((l) => l.top));
  const pageTop: LayoutLine = { text: '', top: 0, bottom: Math.max(0, firstTop - lineHeight(real[0] ?? { top: 0, bottom: 12, left: 0, right: 0 })), left: column.left, right: column.right };
  const above = [pageTop, ...real];
  for (let i = 1; i < above.length; i++) {
    const a = above[i - 1]!;
    const b = above[i]!;
    const lh = lineHeight(b);
    if (b.top - a.bottom < 2.5 * lh) continue;
    const between = classified.filter((x) => x.line.top >= a.bottom - 1 && x.line.bottom <= b.top + 1);
    const caption = CAPTION.test(b.text.trim());
    if (!caption && !(a !== pageTop && scanned && between.length === 0 && b.top - a.bottom >= 4 * lh)) continue;
    const formulasAbove = between.filter((x) => x.kind === 'formula').map((x) => x.line.bottom);
    const top = Math.max(a === pageTop ? a.bottom : a.bottom + KEEP_OFF * lineHeight(a), ...formulasAbove.map((y) => y + KEEP_OFF * lh));
    const bottom = b.top - KEEP_OFF * lh;
    if (bottom - top < 2 * lh) continue;
    const gap = { top, bottom, left: column.left, right: column.right };
    // The PDF drew the figure itself: it was found already.
    if (figures.some((f) => near(f, gap, 0))) continue;
    figures.push(gap);
    gaps.add(gap);
  }
  classified = classified.filter((x) => x.kind !== 'scraps' || !figures.some((f) => inside(x.line, f)));
  classified = classified.filter((x) => x.kind === 'formula' || !figures.some((f) => inside(x.line, f)));

  const text = classified.filter((x) => x.kind === 'text').map((x) => x.line);
  const formulaLines = classified.filter((x) => x.kind !== 'text').map((x) => x.line);
  // Formula lines one under another make one formula; one touching a figure drawn by shapes joins it.
  const formulas: Box[] = [];
  for (const l of formulaLines) {
    const last = formulas[formulas.length - 1];
    if (last && l.top - last.bottom < 1.2 * lineHeight(l)) formulas[formulas.length - 1] = union(last, l);
    else formulas.push({ top: l.top, bottom: l.bottom, left: l.left, right: l.right });
  }
  const cuts: { box: Box; why: 'picture' | 'formula' }[] = figures.map((box) => ({ box, why: 'picture' as const }));
  for (const f of formulas) {
    const touching = cuts.find((c) => c.why === 'picture' && near(c.box, f, PAD) && !(f.bottom <= c.box.top + 2));
    if (touching) {
      const joined = union(touching.box, f);
      if (gaps.has(touching.box)) gaps.add(joined);
      touching.box = joined;
    }
    else cuts.push({ box: f, why: 'formula' });
  }
  // A formula from the text (or figure) above it to the one below it, across the column.
  const obstacles: Box[] = [...text, ...cuts.filter((c) => c.why === 'picture').map((c) => c.box)];
  const formulaBox = (f: Box): Box => {
    const lh = Math.max(...formulaLines.filter((l) => l.top >= f.top - 1 && l.bottom <= f.bottom + 1).map(lineHeight), 8);
    const above = obstacles.filter((o) => o.bottom <= f.top + 1).reduce((m, o) => Math.max(m, o.bottom), -Infinity);
    const below = obstacles.filter((o) => o.top >= f.bottom - 1).reduce((m, o) => Math.min(m, o.top), Infinity);
    return {
      top: Math.max(0, f.top - 1.5 * lh, Math.min(f.top, above + KEEP_OFF * lh)),
      bottom: Math.min(page.height, f.bottom + 1.5 * lh, Math.max(f.bottom, below - KEEP_OFF * lh)),
      left: Math.max(0, Math.min(f.left, column.left) - PAD),
      right: Math.min(page.width, Math.max(f.right, column.right) + PAD),
    };
  };
  // A cut-out right above a caption ("Obr. 33") is a figure, however small and formula-like its labels.
  for (const c of cuts) {
    if (c.why !== 'formula') continue;
    const next = text.filter((l) => l.top >= c.box.bottom - 1).sort((x, y) => x.top - y.top)[0];
    if (!next || !CAPTION.test(next.text.trim())) continue;
    // As far as a formula reaches (from the text above to the caption), then trimmed to its ink.
    c.box = formulaBox(c.box);
    c.why = 'picture';
    gaps.add(c.box);
  }
  // Formulas whose cut-outs would overlap are one cut-out.
  const placed: { box: Box; why: 'picture' | 'formula' }[] = [];
  for (const c of cuts.map((c) => ({ box: c.why === 'formula' ? formulaBox(c.box) : gaps.has(c.box) ? c.box : padded(c.box, page), why: c.why })).sort((x, y) => x.box.top - y.box.top)) {
    const last = placed[placed.length - 1];
    if (last && c.why === 'formula' && last.why === 'formula' && c.box.top < last.box.bottom) last.box = union(last.box, c.box);
    else placed.push(c);
  }
  const items: { top: number; item: LayoutItem }[] = [
    ...text.map((l) => ({ top: l.top, item: { kind: 'text' as const, text: l.text } })),
    ...placed.map((c) => ({ top: c.box.top, item: { kind: 'cut' as const, box: c.box, why: c.why } })),
  ];
  return items.sort((a, b) => a.top - b.top).map((x) => x.item);
}
