/**
 * Reads .xlsx workbooks: cell grids and pictures anchored to rows.
 *
 * A picture placed over a row in Excel becomes that row's image, so a
 * catalogue kept in Excel with pictures next to the records imports as a
 * table with an image per record.
 *
 * An .xlsx file is a zip of XML parts (Office Open XML, ECMA-376). Only what
 * a table needs is read: the sheets with their names, cell values (shared and
 * inline strings, numbers, booleans, formula results, dates) and the pictures
 * of their drawings, by the row their top left corner is anchored to.
 */

import { unzipSync, strFromU8 } from 'fflate';

export interface WorkbookImage {
  /** 0-based row in the grid (row 0 is the header). */
  readonly row: number;
  readonly extension: string;
  readonly data: Uint8Array;
}

export interface WorkbookSheet {
  readonly name: string;
  readonly rows: string[][];
  readonly images: WorkbookImage[];
}

export async function readWorkbook(data: Uint8Array): Promise<WorkbookSheet[]> {
  const files = unzipSync(data);
  const text = (path: string): string | undefined => (files[path] ? strFromU8(files[path]!) : undefined);
  const workbook = text('xl/workbook.xml');
  if (workbook === undefined) throw new Error('not an xlsx workbook: xl/workbook.xml is missing');

  const strings = sharedStrings(text('xl/sharedStrings.xml') ?? '');
  const dates = dateStyles(text('xl/styles.xml') ?? '');
  // Dates count from 1900, or from 1904 in workbooks made so (old Excel for Mac).
  const epoch = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904="(?:1|true)"/.test(workbook) ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const workbookRels = relationships(text('xl/_rels/workbook.xml.rels') ?? '', 'xl/workbook.xml');

  return [...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)].flatMap((m) => {
    const attrs = attributes(m[1]!);
    const path = workbookRels.get(attrs['r:id'] ?? '');
    const xml = path ? text(path) : undefined;
    if (xml === undefined) return [];
    const grid = cells(xml, strings, dates, epoch);
    return [{ name: decode(attrs['name'] ?? ''), rows: trimGrid(grid), images: pictures(path!, xml, text, files) }];
  });
}

/** The texts of the shared string table, rich text runs joined, phonetic guides left out. */
function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1]!.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '')));
}

/** All <t> texts of a piece of XML, joined. */
function texts(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => decode(t[1]!)).join('');
}

/** Number formats that show a date: built-in ids 14–22 and 45–47, and own formats with day, month or year. */
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** For each cell style (the s of a cell), whether it shows a date. */
function dateStyles(xml: string): boolean[] {
  const own = new Map<number, string>();
  for (const m of xml.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) {
    const a = attributes(m[1]!);
    own.set(Number(a['numFmtId']), decode(a['formatCode'] ?? ''));
  }
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml)?.[1] ?? '';
  return [...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = Number(attributes(m[1]!)['numFmtId'] ?? 0);
    const code = own.get(id);
    // Quoted text and [colour] or [h] parts are no date letters.
    return code !== undefined ? /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) : DATE_FORMAT_IDS.has(id);
  });
}

/** The cells of a worksheet as a grid of texts, row 0 first. */
function cells(xml: string, strings: readonly string[], dates: readonly boolean[], epoch: number): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const row of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const r = Number(attributes(row[1]!)['r'] ?? nextRow + 1) - 1;
    nextRow = r + 1;
    const line: string[] = [];
    let nextCol = 0;
    for (const cell of (row[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = attributes(cell[1]!);
      const col = a['r'] ? columnIndex(a['r']) : nextCol;
      nextCol = col + 1;
      line[col] = cellText(a['t'], cell[2] ?? '', strings, dates[Number(a['s'] ?? 0)] ?? false, epoch);
    }
    rows[r] = Array.from(line, (c) => c ?? '');
  }
  return Array.from(rows, (r) => r ?? []);
}

/** The text of one cell: its value by its type; of a formula its last calculated result. */
function cellText(type: string | undefined, inner: string, strings: readonly string[], date: boolean, epoch: number): string {
  const value = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
  switch (type) {
    case 's':
      return strings[Number(value)] ?? '';
    case 'inlineStr':
      return texts(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner)?.[1] ?? '');
    case 'str':
      return decode(value ?? '');
    case 'b':
      return value === undefined ? '' : value === '1' ? 'true' : 'false';
    case 'e':
      return '';
    case 'd':
      return decode(value ?? '').slice(0, 10);
  }
  if (value === undefined) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return decode(value);
  return date ? new Date(epoch + Math.round(n * 86_400_000)).toISOString().slice(0, 10) : String(n);
}

/** The pictures of a worksheet's drawing, each by the row its top left corner sits on. */
function pictures(sheetPath: string, sheetXml: string, text: (path: string) => string | undefined, files: Record<string, Uint8Array>): WorkbookImage[] {
  const sheetRels = relationships(text(relsPath(sheetPath)) ?? '', sheetPath);
  return [...sheetXml.matchAll(/<(?:\w+:)?drawing\b([^>]*)\/?>/g)].flatMap((d) => {
    const drawingPath = sheetRels.get(attributes(d[1]!)['r:id'] ?? '');
    const drawing = drawingPath ? text(drawingPath) : undefined;
    if (!drawing) return [];
    const drawingRels = relationships(text(relsPath(drawingPath!)) ?? '', drawingPath!);
    return [...drawing.matchAll(/<(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:\w+:)?(?:twoCellAnchor|oneCellAnchor)>/g)].flatMap((anchor) => {
      const row = /<(?:\w+:)?from\b[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/.exec(anchor[0])?.[1];
      const embed = /<(?:\w+:)?blip\b[^>]*\br:embed="([^"]+)"/.exec(anchor[0])?.[1];
      const media = embed ? drawingRels.get(embed) : undefined;
      const data = media ? files[media] : undefined;
      if (row === undefined || !data) return [];
      return [{ row: Number(row), extension: (/\.([A-Za-z0-9]+)$/.exec(media!)?.[1] ?? 'png').toLowerCase(), data }];
    });
  });
}

/** The relationships of a part, by their id, as paths in the zip. */
function relationships(xml: string, owner: string): Map<string, string> {
  const base = owner.slice(0, owner.lastIndexOf('/') + 1);
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const a = attributes(m[1]!);
    if (!a['Id'] || !a['Target'] || a['TargetMode'] === 'External') continue;
    out.set(a['Id'], resolvePath(base, decode(a['Target'])));
  }
  return out;
}

/** xl/worksheets/sheet1.xml -> xl/worksheets/_rels/sheet1.xml.rels */
function relsPath(path: string): string {
  const at = path.lastIndexOf('/');
  return `${path.slice(0, at + 1)}_rels/${path.slice(at + 1)}.rels`;
}

/** A target relative to its owner's folder (or from the root with a leading /), as a path in the zip. */
function resolvePath(base: string, target: string): string {
  const parts = (target.startsWith('/') ? target.slice(1) : base + target).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

/** The attributes of a tag, by their name as written (r:id). */
function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]!] = m[2] ?? m[3] ?? '';
  return out;
}

/** "B12" -> 1 (column B). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of /^[A-Za-z]+/.exec(ref)?.[0].toUpperCase() ?? '') n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** XML entities and the _xHHHH_ escapes of Office strings. */
function decode(text: string): string {
  return text
    .replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (whole, name: string) => {
      if (name === 'lt') return '<';
      if (name === 'gt') return '>';
      if (name === 'quot') return '"';
      if (name === 'apos') return "'";
      if (name === 'amp') return '&';
      const code = name.startsWith('#x') ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Drops empty rows at the end and empty columns on the right. */
function trimGrid(grid: string[][]): string[][] {
  const rows = [...grid];
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
  const width = Math.max(0, ...rows.map((r) => r.reduce((w, c, i) => (c.trim() !== '' ? i + 1 : w), 0)));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}
