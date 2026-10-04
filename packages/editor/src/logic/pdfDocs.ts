/**
 * Study PDFs drawn in the editor with pdf.js (the main process has no canvas):
 * loading a file once, the lines and pictures of a page with where they are,
 * and a cut-out of a page as a PNG.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { desktop } from '../document.js';
import { inkBounds, type Box, type LayoutLine } from './pdfLayout.js';

type PdfJs = typeof import('pdfjs-dist');
export type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
export type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

/** Cut-outs are drawn at this resolution, however small the page is on screen. */
export const CUT_DPI = 200;

let pdfjs: Promise<PdfJs> | undefined;
const loaded = new Map<string, Promise<PdfDocument>>();

function library(): Promise<PdfJs> {
  pdfjs ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  });
  return pdfjs;
}

/** A study PDF of the theory folders, read once. */
export function loadPdf(path: string, sheetPath?: string): Promise<PdfDocument> {
  let doc = loaded.get(path);
  if (!doc) {
    doc = (async () => (await library()).getDocument({ data: await desktop!.studyBytes(path, sheetPath) }).promise)();
    // A file that could not be read is tried again next time.
    doc.catch(() => loaded.delete(path));
    loaded.set(path, doc);
  }
  return doc;
}

/** The lines of a page with their boxes, and where it draws pictures; page coordinates at scale 1, y downwards. */
export async function pageContent(page: PdfPage): Promise<{ lines: LayoutLine[]; pictures: Box[]; drawn: Box[]; width: number; height: number }> {
  const lib = await library();
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  type Part = { x: number; right: number; y: number; size: number; text: string };
  const parts: Part[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [x, y] = viewport.convertToViewportPoint(item.transform[4] as number, item.transform[5] as number) as [number, number];
    const size = Math.max(1, Math.hypot(item.transform[2] as number, item.transform[3] as number));
    parts.push({ x, right: x + (item.width ?? 0), y, size, text: item.str });
  }
  // Parts on one baseline make a line, left to right; a gap between them is a space.
  parts.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: LayoutLine[] = [];
  let current: Part[] = [];
  const close = () => {
    if (current.length === 0) return;
    const row = [...current].sort((a, b) => a.x - b.x);
    let text = '';
    row.forEach((p, i) => {
      const gap = i > 0 ? p.x - row[i - 1]!.right : 0;
      text += (i > 0 && gap > 0.15 * p.size && !text.endsWith(' ') && !p.text.startsWith(' ') ? ' ' : '') + p.text;
    });
    const size = Math.max(...row.map((p) => p.size));
    const base = Math.max(...row.map((p) => p.y));
    lines.push({ text: text.replace(/\s+/g, ' ').trim(), top: base - size, bottom: base + size * 0.25, left: Math.min(...row.map((p) => p.x)), right: Math.max(...row.map((p) => p.right)) });
    current = [];
  };
  for (const p of parts) {
    if (current.length > 0 && Math.abs(p.y - current[0]!.y) > 0.4 * p.size) close();
    current.push(p);
  }
  close();

  // Pictures: where the drawing operations paint an image, through the transforms that place it.
  const ops = await page.getOperatorList();
  const { OPS, Util } = lib;
  const images = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat].filter((n): n is number => typeof n === 'number'));
  let ctm: number[] = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const pictures: Box[] = [];
  const drawn: Box[] = [];
  /** A rectangle of user space on the page. */
  const onPage = (x0: number, y0: number, x1: number, y1: number): Box => {
    const corners = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].map((c) => {
      // applyTransform moves the point in place.
      const point = [...c];
      Util.applyTransform(point, ctm);
      return viewport.convertToViewportPoint(point[0]!, point[1]!) as [number, number];
    });
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]!;
    const args = ops.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform && args) ctm = Util.transform(ctm, args as number[]) as number[];
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const matrix = args?.[0];
      if (Array.isArray(matrix) && matrix.length === 6) ctm = Util.transform(ctm, matrix as number[]) as number[];
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (images.has(fn)) pictures.push(onPage(0, 0, 1, 1));
    else if (fn === OPS.constructPath && args) {
      // A shape drawn (not a clipping path): where it lies, from its bounds.
      const [op, , bounds] = args as [number, unknown, ArrayLike<number> | null];
      if (op !== OPS.endPath && bounds && bounds.length >= 4 && [0, 1, 2, 3].every((k) => Number.isFinite(bounds[k]!))) drawn.push(onPage(bounds[0]!, bounds[1]!, bounds[2]!, bounds[3]!));
    }
  }
  return { lines, pictures, drawn, width: viewport.width, height: viewport.height };
}

/**
 * A part of a page as a PNG at CUT_DPI. Drawn as for print: at once, not frame by
 * frame, which waits while the window is in the background.
 */
export async function cutOut(page: PdfPage, box: Box, trim?: false): Promise<Uint8Array>;
/** Trimmed to its ink; undefined when the part holds nothing. */
export async function cutOut(page: PdfPage, box: Box, trim: true): Promise<Uint8Array | undefined>;
export async function cutOut(page: PdfPage, box: Box, trim = false): Promise<Uint8Array | undefined> {
  const k = CUT_DPI / 72;
  let out = document.createElement('canvas');
  out.width = Math.max(1, Math.round((box.right - box.left) * k));
  out.height = Math.max(1, Math.round((box.bottom - box.top) * k));
  const viewport = page.getViewport({ scale: k, offsetX: -box.left * k, offsetY: -box.top * k });
  await page.render({ canvas: out, viewport, intent: 'print' }).promise;
  // Found by the program, not dragged by the user: trimmed to its ink, with a little room.
  if (trim) {
    const ink = inkBounds(out.getContext('2d')!.getImageData(0, 0, out.width, out.height).data, out.width, out.height);
    // Nothing drawn there: a blank part of the page is no picture.
    if (!ink) return undefined;
    {
      const room = Math.round(6 * (CUT_DPI / 72));
      const left = Math.max(0, ink.left - room);
      const top = Math.max(0, ink.top - room);
      const trimmed = document.createElement('canvas');
      trimmed.width = Math.min(out.width, ink.right + room) - left;
      trimmed.height = Math.min(out.height, ink.bottom + room) - top;
      trimmed.getContext('2d')!.drawImage(out, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
      out = trimmed;
    }
  }
  // At once, not through toBlob, whose answer can wait while the window is in the background.
  return Uint8Array.from(atob(out.toDataURL('image/png').split(',')[1] ?? ''), (c) => c.charCodeAt(0));
}
