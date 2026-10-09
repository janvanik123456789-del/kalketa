/**
 * The sheet as a column of rows. A row shows its statement typeset exactly as
 * in print; clicking it turns it into a text line that is re-evaluated on
 * every keystroke.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { formatExpr, formatPicture, fromDecimalComma, parsePicture, TEXT_ALIGNS, TEXT_COLORS, toDecimalComma, type SheetResult, type Statement } from '@kalketa/core';
import { formatDate, formatNumber, t, type Catalog, type UiKey } from '@kalketa/i18n';
import { labelParts, xPosition, xValueAt } from '@kalketa/chart';
import { isInput, renderBlockHtml, renderSummary, type CalcStyle, type PrintBlock, type PrintDocument } from '@kalketa/render';
import { isCanvasPath } from '@kalketa/canvas';
import { paginate, type PageGeometry } from '../logic/pages.js';
import { segments, type Segment } from '../logic/segments.js';
import { lineAttributesOf, lineFormatOf, withLineAttribute, withLineAttributes, withLineFormat, type LineFormatChoice } from '../logic/lineFormat.js';
import { defineShortcut } from '../logic/shortcuts.js';
import { pickOf } from '../logic/pick.js';
import { placeable } from '../logic/placement.js';
import { PickControl } from './PickControl.js';
import { SheetTableGrid } from './SheetTableGrid.js';
import { parseSheetTable } from '../logic/sheetTableEdit.js';
import { ContextMenu, type MenuItem } from './MenuBar.js';
import { ask } from './Ask.js';
import type { Command } from '../commands.js';

export interface EditRange {
  readonly start: number;
  readonly end: number;
  /** Caret position when editing starts (default: end of the text). */
  readonly cursor?: number;
}

interface Props {
  readonly source: string;
  readonly result: SheetResult;
  readonly print: PrintDocument;
  /** Catalog of the printout language (numbers, labels in the sheet). */
  readonly printCatalog: Catalog;
  readonly editing: EditRange | undefined;
  readonly selected: number | undefined;
  readonly resolveFile: (path: string) => string | undefined;
  onEdit(range: EditRange | undefined): void;
  onSelect(statement: number | undefined): void;
  /** Replaces lines start..end with text; returns nothing, the source flows back through props. */
  onReplace(start: number, end: number, text: string): void;
  /** Several rows at once (a format set to all marked rows), in one step to undo. */
  onReplaceRows(rows: readonly { start: number; end: number; text: string }[]): void;
  onInsertAfter(line: number): void;
  onDelete(start: number, end: number): void;
  /** Several rows at once (marked ones), in one step to undo. */
  onDeleteRows(rows: readonly { start: number; end: number }[]): void;
  onPick(statement: Statement, key: string): void;
  /** Moves lines start..end after line `after` (a picture dragged elsewhere). */
  onMoveLines(start: number, end: number, after: number): void;
  /** A picture placed freely: its line becomes `text` and goes after line `after`, as one step. */
  onPlace?(start: number, end: number, after: number, text: string): void;
  /** Starts editing a canvas shown in the sheet (in the sheet or in the window, as set). */
  onEditCanvas(path: string): void;
  /** Opens a canvas in the large window. */
  onEditCanvasWindow(path: string): void;
  /** The canvas being edited right in the sheet, drawn by the caller in place of its picture. */
  readonly inlineCanvas?: { readonly path: string; render(): ReactNode };
  /** Lets the user choose another file for the picture on lines start..end. */
  onReplacePicture(start: number, end: number): void;
  /** Page size and margins of the printout. */
  readonly geometry: PageGeometry;
  /** Scale of the pages (1 = 100 %). */
  readonly zoom: number;
  /** Title in the page header. */
  readonly title: string;
  /** Left of the page footer: the revision and fingerprint, as printed. */
  readonly footer?: string;
  readonly uiCatalog: Catalog;
  /** Show and accept numbers with a decimal comma (50,5; arguments separated by ";"). */
  readonly decimalComma: boolean;
  /** How the calculation is set, as in print. */
  readonly calcStyle?: CalcStyle;
  /** Lines from accepted AI changes nobody has reviewed yet: line -> the change and its tooltip. */
  readonly aiMade?: ReadonlyMap<number, { readonly id: string; readonly title: string }>;
  /** A person reviewed the lines of this change. */
  onAiReviewed?(id: string): void;
  /** Shows the change in the AI notes. */
  onAiShow?(id: string): void;
}

const NO_COMMANDS: ReadonlyMap<string, Command> = new Map<string, Command>();

/** A change of the text of a row, put to one row or to all rows marked. */
type RowChange = (change: (text: string) => string) => void;

/**
 * The menu of a row with a result: how its numbers are shown, here and in every substitution
 * below. Only the display changes; the calculation goes on with the exact value.
 */
function formatMenuItems(seg: Segment, catalog: Catalog, change: RowChange): MenuItem[] {
  const current = lineFormatOf(seg.text);
  const choose = (format: LineFormatChoice) => change((text) => withLineFormat(text, format));
  return [
    { kind: 'action', label: t(catalog, 'format.default'), checked: current === undefined, run: () => choose(undefined) },
    {
      kind: 'submenu',
      label: t(catalog, 'format.decimals'),
      items: [0, 1, 2, 3, 4].map((n): MenuItem => ({ kind: 'action', label: String(n), checked: current !== undefined && 'decimals' in current && current.decimals === n, run: () => choose({ decimals: n }) })),
    },
    {
      kind: 'submenu',
      label: t(catalog, 'format.digits'),
      items: [2, 3, 4, 5, 6].map((n): MenuItem => ({ kind: 'action', label: String(n), checked: current !== undefined && 'digits' in current && current.digits === n, run: () => choose({ digits: n }) })),
    },
  ];
}

const TEXT_KEYS = ['size', 'font', 'italic', 'bold', 'align', 'color'];

/** The menu of a text line or heading: size, font, italic, bold, alignment and color, written as {size=12 italic} at its end. */
function textMenuItems(seg: Segment, catalog: Catalog, change: RowChange): MenuItem[] {
  const current = lineAttributesOf(seg.text);
  const set = (key: string, value: string | undefined) => change((text) => withLineAttribute(text, key, value));
  const choices = (key: string, values: readonly (string | undefined)[], label: (value: string) => string): MenuItem[] =>
    values.map((value): MenuItem => ({
      kind: 'action',
      label: value === undefined ? t(catalog, 'textStyle.defaultValue') : label(value),
      checked: value === undefined ? !current.has(key) : current.get(key) === value,
      run: () => set(key, value),
    }));
  return [
    {
      kind: 'action',
      label: t(catalog, 'textStyle.default'),
      checked: !TEXT_KEYS.some((key) => current.has(key)),
      run: () => change((text) => withLineAttributes(text, new Map([...lineAttributesOf(text)].filter(([key]) => !TEXT_KEYS.includes(key))))),
    },
    { kind: 'submenu', label: t(catalog, 'textStyle.size'), items: choices('size', [undefined, '9', '10', '11', '12', '14', '16', '20'], (n) => `${n} pt`) },
    { kind: 'submenu', label: t(catalog, 'textStyle.font'), items: choices('font', [undefined, 'serif', 'sans', 'mono'], (f) => t(catalog, `textStyle.font.${f}` as UiKey)) },
    { kind: 'action', label: t(catalog, 'textStyle.italic'), checked: current.has('italic'), run: () => set('italic', current.has('italic') ? undefined : '') },
    { kind: 'action', label: t(catalog, 'textStyle.bold'), checked: current.has('bold'), run: () => set('bold', current.has('bold') ? undefined : '') },
    { kind: 'submenu', label: t(catalog, 'textStyle.align'), items: choices('align', [undefined, ...TEXT_ALIGNS], (a) => t(catalog, `textStyle.align.${a}` as UiKey)) },
    { kind: 'submenu', label: t(catalog, 'textStyle.color'), items: choices('color', [undefined, ...TEXT_COLORS], (c) => t(catalog, `textStyle.color.${c}` as UiKey)) },
  ];
}

export function SheetView(props: Props) {
  const { source, result, print, editing } = props;
  // The menu of a picture: opened by clicking it (or right click).
  const [pictureMenu, setPictureMenu] = useState<{ seg: Segment; at: { x: number; y: number }; flow?: boolean } | undefined>();
  // The right button on a solve line whose unknown was expressed by a formula.
  const [solveMenu, setSolveMenu] = useState<{ seg: Segment; line: string; at: { x: number; y: number } } | undefined>();
  // The right button on a row with a result: how its numbers are shown ({decimals=2} at its end).
  // A table of the sheet opens as a grid (by its first line): only a row that is a table when it
  // opens, so a table being typed stays in the text; "as text" closes the grid.
  const [gridAt, setGridAt] = useState<number | undefined>();
  const [formatMenu, setFormatMenu] = useState<{ seg: Segment; at: { x: number; y: number }; text?: boolean } | undefined>();
  // Where a dragged picture would land: a line across the page body.
  const [dropMark, setDropMark] = useState<{ x: number; y: number; width: number } | undefined>();
  // Where a picture placed freely would stand while it is dragged.
  const [dropBox, setDropBox] = useState<{ x: number; y: number; width: number; height: number; src: string } | undefined>();
  // The menu of an AI mark: reviewed, or where it came from.
  const [aiMenu, setAiMenu] = useState<{ id: string; at: { x: number; y: number } } | undefined>();
  const segs = segments(source, result.sheet.statements, editing);
  useEffect(() => {
    const opened = editing ? segs.find((s) => s.start === editing.start) : undefined;
    const statement = opened?.statement !== undefined ? result.statements[opened.statement]?.statement : undefined;
    setGridAt(opened && statement?.kind === 'table' ? opened.start : undefined);
    // Only when another row opens, not while the open one changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.start]);
  // Rows marked for deleting, by their first line: Ctrl+click one, Shift+click a range; Delete removes them.
  const [marked, setMarked] = useState<ReadonlySet<number>>(() => new Set());
  const markAnchor = useRef<number | undefined>(undefined);
  useEffect(() => setMarked(new Set()), [source]);
  useEffect(() => {
    if (marked.size === 0) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape') return setMarked(new Set());
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      props.onDeleteRows(segs.filter((s) => marked.has(s.start)).map((s) => ({ start: s.start, end: s.end })));
      setMarked(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [marked, segs, props]);
  /** Ctrl+click adds or takes away one row, Shift+click marks all rows from the last one marked or open. */
  const mark = (seg: Segment, range: boolean) => {
    const from = markAnchor.current ?? editing?.start;
    const a = segs.findIndex((s) => s.start === from);
    const b = segs.indexOf(seg);
    if (range && a >= 0 && b >= 0) {
      setMarked(new Set(segs.slice(Math.min(a, b), Math.max(a, b) + 1).map((s) => s.start)));
    } else {
      const next = new Set(marked);
      if (!next.delete(seg.start)) next.add(seg.start);
      setMarked(next);
      markAnchor.current = seg.start;
    }
    props.onEdit(undefined);
  };
  /** Marks from a row to the one under the mouse while the button is held (by the line numbers). */
  const dragMark = (from: Segment) => {
    props.onEdit(undefined);
    markAnchor.current = from.start;
    setMarked(new Set([from.start]));
    const a = segs.indexOf(from);
    const move = (e: MouseEvent) => {
      const line = Number((document.elementFromPoint(e.clientX, e.clientY)?.closest('.row[data-line]') as HTMLElement | null)?.dataset['line']);
      const b = segs.findIndex((s) => s.start === line);
      if (a >= 0 && b >= 0) setMarked(new Set(segs.slice(Math.min(a, b), Math.max(a, b) + 1).map((s) => s.start)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const blockByLine = new Map<number, PrintBlock>();
  for (const block of print.blocks) if ('line' in block) blockByLine.set(block.line, block);

  const move = (from: Segment, direction: -1 | 1) => {
    const index = segs.indexOf(from) + direction;
    const target = segs[index];
    if (target) {
      props.onEdit({ start: target.start, end: target.end });
      props.onSelect(target.statement);
    }
  };

  // Items laid out on pages: the summary of checks first, then the rows. A side
  // picture and the lines beside it are one item: two columns kept on one page,
  // unless they are taller than a page; then the picture goes back above the lines.
  const [tooTall, setTooTall] = useState<ReadonlySet<number>>(() => new Set());
  type Item = { kind: 'summary' } | { kind: 'row'; seg: Segment } | { kind: 'side'; picture: Segment; rows: Segment[]; block: Extract<PrintBlock, { kind: 'picture' }> } | { kind: 'flow'; rows: Segment[] };
  const items: Item[] = print.summary ? [{ kind: 'summary' }] : [];
  // Compact style: inputs one after another stand side by side, as in print; each stays a row of its own to edit.
  const inputAt = (seg: Segment | undefined) => {
    const block = seg && seg.statement !== undefined && editing?.start !== seg.start ? blockByLine.get(seg.start) : undefined;
    return !!block && isInput(block);
  };
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const block = seg.statement !== undefined ? blockByLine.get(seg.start) : undefined;
    if (props.calcStyle === 'compact' && inputAt(seg) && inputAt(segs[i + 1])) {
      const rows: Segment[] = [];
      while (inputAt(segs[i])) rows.push(segs[i++]!);
      i--;
      items.push({ kind: 'flow', rows });
      continue;
    }
    if (block?.kind === 'picture' && block.side && block.beside?.length && !tooTall.has(seg.start)) {
      const beside = new Set(block.beside);
      const rows: Segment[] = [];
      while (segs[i + 1] && beside.has(segs[i + 1]!.start)) rows.push(segs[++i]!);
      items.push({ kind: 'side', picture: seg, rows, block });
    } else {
      items.push({ kind: 'row', seg });
    }
  }
  const breakAfter = items.map((item) => item.kind === 'row' && /^\s*@page\b/.test(item.seg.text));

  // Pagination measures the rendered items, then places them on pages. Heights
  // do not depend on the page an item is on (the margin above the first item of
  // a page counts as it does further down), so this settles in one pass.
  const [starts, setStarts] = useState<number[]>([0]);
  // A picture knows its height only once loaded; then the pages are laid out again.
  const [, relayout] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  // Layouts of the same content tried so far: should the pages still swap back and
  // forth (an item a pixel too tall on one page and not on the next), the layout with
  // more pages stays, instead of rendering for ever.
  const tried = useRef<{ content: string; layouts: string[] }>({ content: '', layouts: [] });
  const content = segs.map((s) => s.text).join('\n');
  useLayoutEffect(() => {
    const root = container.current;
    const body = root?.querySelector<HTMLElement>('.page-body');
    if (!root || !body) return;
    const measured = [...root.querySelectorAll<HTMLElement>('[data-item]')];
    // How far each item pushes the flow down on its page: rows beside a wrapped picture push nothing until they pass its bottom.
    let reached = 0;
    let page: Element | null = null;
    const heights = measured.map((el) => {
      let first = false;
      if (el.parentElement !== page) {
        page = el.parentElement;
        reached = 0;
        first = true;
      }
      const bottom = el.offsetTop + el.offsetHeight;
      // The top margin of the first item of a page merges with the page and is not in its offsetTop.
      const from = first ? Math.min(0, el.offsetTop - (parseFloat(getComputedStyle(el).marginTop) || 0)) : reached;
      const advance = Math.max(0, bottom - from);
      reached = Math.max(reached, bottom);
      return advance;
    });
    const tall = measured.filter((el) => el.classList.contains('side-group') && el.offsetHeight > body.clientHeight).map((el) => Number(el.dataset['picture']));
    if (tall.some((line) => !tooTall.has(line))) setTooTall(new Set([...tooTall, ...tall]));
    const next = paginate(heights, body.clientHeight, breakAfter);
    if (next.join() === starts.join()) return;
    if (tried.current.content !== content) tried.current = { content, layouts: [] };
    const seen = tried.current.layouts.includes(next.join());
    tried.current.layouts.push(starts.join());
    if (seen && next.length <= starts.length) return;
    setStarts(next);
  });

  const pages = starts.map((start, i) => items.slice(start, starts[i + 1] ?? items.length)).filter((page) => page.length > 0);
  const { geometry } = props;
  const mm = (value: number) => `${value}mm`;

  /**
   * A picture pressed with the mouse: released in place it opens its menu
   * (beside it, so the menu covers neither the picture nor its handles);
   * dragged, it moves between the rows of the sheet.
   */
  const pressPicture = (e: ReactMouseEvent, seg: Segment, figure: Element) => {
    const from = { x: e.clientX, y: e.clientY };
    const start = figure.getBoundingClientRect();
    // Where in the picture it was taken: the picture follows the pointer from there.
    const grab = { x: from.x - start.left, y: from.y - start.top };
    let dragging = false;
    let place: ReturnType<typeof freePlace>;
    const svg = figure.querySelector('svg');
    const src = figure.querySelector('img')?.getAttribute('src') ?? (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}` : '');
    const original = figure as HTMLElement;
    const move = (event: MouseEvent) => {
      if (!dragging && Math.hypot(event.clientX - from.x, event.clientY - from.y) < 5) return;
      if (!dragging) original.style.opacity = '0.3';
      dragging = true;
      // The picture itself follows the pointer, as on a slide; where it is let go, it stays.
      const box = { x: event.clientX - grab.x, y: event.clientY - grab.y, width: start.width, height: start.height, src };
      setDropBox(box);
      // Off the pages the last place shown stays: releasing there uses it.
      const next = freePlace(box.x, box.y, start.width, start.height, seg, event.clientY);
      if (!next) return;
      place = next;
      setDropMark(next.mark);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      original.style.opacity = '';
      setDropMark(undefined);
      setDropBox(undefined);
      if (!dragging) {
        // A click on a chart selects it (its frame and handles); on a picture it also offers what can be done with it.
        const box = figure.getBoundingClientRect();
        if (placeable(seg.text)?.kind !== 'chart') setPictureMenu({ seg, at: { x: box.right + 12, y: box.top } });
      } else if (place) {
        if (place.text === seg.text) props.onMoveLines(seg.start, seg.end, place.after);
        else if (props.onPlace) props.onPlace(seg.start, seg.end, place.after, place.text);
        else props.onMoveLines(seg.start, seg.end, place.after);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /** The line after which a dragged row lands at (x, y): before the row whose middle is below the pointer, on the page under it. */
  const dropPlace = (x: number, y: number, dragged: Segment) => {
    const root = container.current;
    if (!root) return undefined;
    const page = [...root.querySelectorAll('.page')].find((p) => {
      const box = p.getBoundingClientRect();
      return box.left <= x && x <= box.right && box.top <= y && y <= box.bottom;
    });
    const body = page?.querySelector('.page-body')?.getBoundingClientRect();
    if (!page || !body) return undefined;
    const rows = [...page.querySelectorAll<HTMLElement>('.row[data-line]')].filter((r) => Number(r.dataset['line']) !== dragged.start);
    const below = rows.find((r) => {
      const box = r.getBoundingClientRect();
      return box.top + box.height / 2 > y;
    });
    if (below) return { after: Number(below.dataset['line']) - 1, mark: { x: body.left, y: below.getBoundingClientRect().top, width: body.width } };
    const last = rows.at(-1);
    if (!last) return undefined;
    const end = segs.find((s) => s.start === Number(last.dataset['line']))?.end ?? Number(last.dataset['line']);
    return { after: end, mark: { x: body.left, y: last.getBoundingClientRect().bottom, width: body.width } };
  };

  /**
   * A picture dragged with its top left corner at (left, top): dropped in the middle
   * of the text column (a picture without the flow around it) it only moves between
   * the rows; anywhere else it is placed freely there, the rows flowing around it on
   * its wider side. It belongs to the last row above it, moved down from that row and
   * away from its edge (dy in mm, dx in percent of the text width).
   */
  const freePlace = (left: number, top: number, width: number, height: number, dragged: Segment, pointerY: number) => {
    const item = placeable(dragged.text);
    const root = container.current;
    if (!item || !root) return undefined;
    const picture = item.place;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const page = [...root.querySelectorAll<HTMLElement>('.page')].find((p) => {
      const box = p.getBoundingClientRect();
      return box.left <= cx && cx <= box.right && box.top <= cy && cy <= box.bottom;
    });
    const body = page?.querySelector('.page-body')?.getBoundingClientRect();
    if (!page || !body) return undefined;
    const middle = body.left + body.width / 2;
    // Never flowed around: it moves between the rows, to the edge or the middle it is dropped at.
    if (picture.noWrap) {
      const moved = dropPlace(cx, pointerY, dragged);
      if (!moved) return undefined;
      const third = (cx - body.left) / body.width;
      const align = third < 1 / 3 ? 'left' : third > 2 / 3 ? 'right' : undefined;
      const { align: _old, ...rest } = picture;
      return { after: moved.after, text: item.write({ ...rest, ...(align ? { align } : {}) }), mark: moved.mark };
    }
    const share = picture.width ?? Math.min(100, Math.round((width / body.width) * 100));
    // As wide as the text: nothing can flow beside it, it only moves between the rows.
    if (share >= 90) {
      const moved = dropPlace(cx, pointerY, dragged);
      return moved ? { after: moved.after, text: dragged.text, mark: moved.mark } : undefined;
    }
    const own = root.querySelector<HTMLElement>(`.row[data-line="${dragged.start}"]`);
    const rows = [...page.querySelectorAll<HTMLElement>('.row[data-line]')].filter((r) => r !== own && !own?.contains(r));
    // The rows as they stand once the picture has left its place: a picture on lines of its own
    // pushes the rows after it down by its height, a picture flowed around or beside them does not.
    const ownBox = own?.getBoundingClientRect();
    const next = own ? rows.find((r) => Number(r.dataset['line']) > dragged.start && r.getBoundingClientRect().top >= ownBox!.bottom - 1) : undefined;
    const shift = !picture.wrap && !picture.side && ownBox && next && page.contains(own) ? next.getBoundingClientRect().top - ownBox.top : 0;
    const bottomOf = (r: HTMLElement) => r.getBoundingClientRect().bottom - (Number(r.dataset['line']) > dragged.start ? shift : 0);
    const lineEnd = (row: HTMLElement) => segs.find((s) => s.start === Number(row.dataset['line']))?.end ?? Number(row.dataset['line']);
    // The row it belongs to: the last one that ends above its top.
    const above = rows.filter((r) => bottomOf(r) <= top + 2).sort((a, b) => bottomOf(a) - bottomOf(b));
    const anchor = above.at(-1);
    const first = rows[0];
    const after = anchor ? lineEnd(anchor) : first ? Number(first.dataset['line']) - 1 : dragged.start - 1;
    const from = anchor ? bottomOf(anchor) : body.top;
    const pxPerMm = page.getBoundingClientRect().width / props.geometry.width;
    // The text flows beside it on the wider side.
    const side: 'left' | 'right' = cx > middle ? 'right' : 'left';
    const dx = Math.max(0, Math.min(100 - share, Math.round(((side === 'right' ? body.right - (left + width) : left - body.left) / body.width) * 100)));
    const dy = Math.max(0, Math.round((top - from) / pxPerMm));
    const text = item.write({ width: share, wrap: side, ...(dx >= 1 ? { dx } : {}), ...(dy >= 1 ? { dy } : {}) });
    return { after, text, mark: { x: body.left, y: from, width: body.width } };
  };

  type Side = 'left' | 'right' | undefined;
  /** Changes of a picture line: each placement clears the others, offsets go with the flow. */
  const pictureSetters = (seg: Segment, picture: NonNullable<ReturnType<typeof parsePicture>>) => {
    const set = (change: Partial<{ caption: string; width: number | undefined; side: Side; wrap: Side; align: Side; noWrap: boolean; dx: number | undefined; dy: number | undefined }>) => {
      const { width, side, wrap, align, noWrap, dx, dy, ...rest } = { ...picture, ...change };
      props.onReplace(
        seg.start,
        seg.end,
        formatPicture({ ...rest, ...(width !== undefined ? { width } : {}), ...(side ? { side } : {}), ...(wrap ? { wrap } : {}), ...(align ? { align } : {}), ...(noWrap ? { noWrap } : {}), ...(dx ? { dx } : {}), ...(dy ? { dy } : {}) }),
      );
    };
    const setAlign = (align: Side) => set({ align, side: undefined, wrap: undefined });
    // Beside the text a picture takes at most a good part of the width, so the lines keep room.
    const narrow = picture.width === undefined || picture.width > 60 ? { width: 40 } : {};
    const setSide = (side: Side) => set({ side, wrap: undefined, align: undefined, noWrap: false, ...(side ? narrow : {}) });
    const setWrap = (wrap: 'left' | 'right') => set({ wrap, side: undefined, align: undefined, noWrap: false, ...narrow });
    return { set, setAlign, setSide, setWrap };
  };

  /** The right button on a picture or a canvas: how the text goes around it. */
  const flowItems = (seg: Segment, at: { x: number; y: number }): MenuItem[] => {
    const item = placeable(seg.text);
    if (!item) return [];
    const c = props.uiCatalog;
    const place = item.place;
    const set = (change: Partial<Record<keyof typeof place, unknown>>) => props.onReplace(seg.start, seg.end, item.write({ ...place, ...change } as typeof place));
    // Flowed around, it takes at most a good part of the width, so the lines keep room.
    const narrow = place.width === undefined || place.width > 60 ? { width: 40 } : {};
    const setWrap = (wrap: 'left' | 'right') => set({ wrap, side: undefined, align: undefined, noWrap: undefined, ...narrow });
    const setAlign = (align: 'left' | 'right' | undefined) => set({ align, side: undefined, wrap: undefined, dx: undefined, dy: undefined });
    const auto = !place.noWrap && !place.wrap && !place.side;
    return [
      { kind: 'action', label: t(c, 'picture.flowAuto'), checked: auto, run: () => set({ noWrap: undefined, wrap: undefined, side: undefined, dx: undefined, dy: undefined }) },
      { kind: 'action', label: t(c, 'picture.noWrap'), checked: !!place.noWrap, run: () => set({ noWrap: true, wrap: undefined, side: undefined, dx: undefined, dy: undefined, align: place.align ?? place.wrap ?? place.side }) },
      { kind: 'separator' },
      { kind: 'action', label: t(c, 'picture.wrapRight'), checked: place.wrap === 'right', run: () => setWrap('right') },
      { kind: 'action', label: t(c, 'picture.wrapLeft'), checked: place.wrap === 'left', run: () => setWrap('left') },
      ...(place.wrap && (place.dx || place.dy) ? [{ kind: 'action' as const, label: t(c, 'picture.toEdge'), run: () => set({ dx: undefined, dy: undefined }) }] : []),
      ...(!place.wrap && !place.side
        ? [
            { kind: 'separator' as const },
            { kind: 'action' as const, label: t(c, 'picture.alignLeft'), checked: place.align === 'left', run: () => setAlign('left') },
            { kind: 'action' as const, label: t(c, 'picture.center'), checked: !place.align, run: () => setAlign(undefined) },
            { kind: 'action' as const, label: t(c, 'picture.alignRight'), checked: place.align === 'right', run: () => setAlign('right') },
          ]
        : []),
      { kind: 'separator' },
      item.kind === 'chart'
        ? {
            // A chart has no corner handles: its width is chosen here.
            kind: 'submenu',
            label: t(c, 'picture.width'),
            items: [
              ...[25, 40, 50, 75].map((width): MenuItem => ({ kind: 'action', label: `${width} %`, checked: place.width === width, run: () => set({ width }) })),
              { kind: 'action', label: t(c, 'chart.fullWidth'), checked: place.width === undefined, run: () => set({ width: undefined }) },
            ],
          }
        : { kind: 'action', label: t(c, 'picture.more'), run: () => setPictureMenu({ seg, at }) },
    ];
  };

  const pictureItems = (seg: Segment): MenuItem[] => {
    const picture = parsePicture(seg.text);
    if (!picture) return [];
    const c = props.uiCatalog;
    const { set, setAlign, setSide, setWrap } = pictureSetters(seg, picture);
    return [
      ...(isCanvasPath(picture.path)
        ? [
            { kind: 'action' as const, label: t(c, 'picture.editCanvas'), run: () => props.onEditCanvas(picture.path) },
            { kind: 'action' as const, label: t(c, 'picture.editCanvasWindow'), run: () => props.onEditCanvasWindow(picture.path) },
            { kind: 'separator' as const },
          ]
        : []),
      {
        kind: 'action',
        label: t(c, 'picture.caption'),
        run: () =>
          void ask(t(c, 'picture.captionPrompt'), picture.caption).then((caption) => {
            if (caption !== undefined) set({ caption: caption.trim() });
          }),
      },
      {
        kind: 'submenu',
        label: t(c, 'picture.width'),
        items: [
          ...[25, 50, 75, 100].map((width): MenuItem => ({
            kind: 'action',
            label: `${width} %`,
            checked: picture.width === width,
            run: () => set({ width }),
          })),
          { kind: 'separator' },
          {
            kind: 'action',
            label: t(c, 'picture.natural'),
            checked: picture.width === undefined,
            run: () => set({ width: undefined }),
          },
        ],
      },
      // Without the flow the picture stays on its side.
      ...(picture.wrap || picture.side ? [{ kind: 'action' as const, label: t(c, 'picture.unwrap'), run: () => setAlign(picture.wrap ?? picture.side) }] : []),
      {
        kind: 'submenu',
        label: t(c, 'picture.place'),
        items: [
          { kind: 'action', label: t(c, 'picture.alignLeft'), checked: picture.align === 'left', run: () => setAlign('left') },
          { kind: 'action', label: t(c, 'picture.center'), checked: !picture.side && !picture.wrap && !picture.align, run: () => setAlign(undefined) },
          { kind: 'action', label: t(c, 'picture.alignRight'), checked: picture.align === 'right', run: () => setAlign('right') },
          { kind: 'separator' },
          { kind: 'action', label: t(c, 'picture.right'), checked: picture.side === 'right', run: () => setSide('right') },
          { kind: 'action', label: t(c, 'picture.left'), checked: picture.side === 'left', run: () => setSide('left') },
          { kind: 'separator' },
          { kind: 'action', label: t(c, 'picture.wrapRight'), checked: picture.wrap === 'right', run: () => setWrap('right') },
          { kind: 'action', label: t(c, 'picture.wrapLeft'), checked: picture.wrap === 'left', run: () => setWrap('left') },
          { kind: 'separator' },
          { kind: 'action', label: t(c, 'picture.noWrap'), checked: !!picture.noWrap, run: () => set({ noWrap: !picture.noWrap, wrap: undefined, side: undefined, align: picture.align ?? picture.wrap ?? picture.side }) },
        ],
      },
      {
        kind: 'action',
        label: t(c, 'picture.replace'),
        run: () => props.onReplacePicture(seg.start, seg.end),
      },
      {
        kind: 'action',
        label: t(c, 'picture.editLine'),
        run: () => props.onEdit({ start: seg.start, end: seg.end }),
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: t(c, 'picture.delete'),
        run: () => props.onDelete(seg.start, seg.end),
      },
    ];
  };

  return (
    <>
      {/* Outside the zoomed pages, so the menu has its normal size and sits at the pointer. */}
      {dropMark && <div className="drop-mark" style={{ left: dropMark.x, top: dropMark.y - 1, width: dropMark.width }} />}
      {dropBox && (
        <div className="drop-box" style={{ left: dropBox.x, top: dropBox.y, width: dropBox.width, height: dropBox.height }}>
          {dropBox.src && <img src={dropBox.src} alt="" />}
        </div>
      )}
      {pictureMenu && <ContextMenu items={pictureMenu.flow ? flowItems(pictureMenu.seg, pictureMenu.at) : pictureItems(pictureMenu.seg)} commands={NO_COMMANDS} at={pictureMenu.at} onClose={() => setPictureMenu(undefined)} />}
      {solveMenu && (
        <ContextMenu
          items={[{ kind: 'action', label: t(props.uiCatalog, 'solve.toDefinition'), run: () => props.onReplace(solveMenu.seg.start, solveMenu.seg.end, solveMenu.line) }]}
          commands={NO_COMMANDS}
          at={solveMenu.at}
          onClose={() => setSolveMenu(undefined)}
        />
      )}
      {formatMenu && (
        <ContextMenu
          items={(formatMenu.text ? textMenuItems : formatMenuItems)(formatMenu.seg, props.uiCatalog, (change) => {
            // On a marked row: every marked row at once, one step to undo.
            const rows = marked.has(formatMenu.seg.start) && marked.size > 1 ? segs.filter((s) => marked.has(s.start)) : [formatMenu.seg];
            if (rows.length === 1) props.onReplace(rows[0]!.start, rows[0]!.end, change(rows[0]!.text));
            else props.onReplaceRows(rows.map((s) => ({ start: s.start, end: s.end, text: change(s.text) })));
          })}
          commands={NO_COMMANDS}
          at={formatMenu.at}
          onClose={() => setFormatMenu(undefined)}
        />
      )}
      {aiMenu && (
        <ContextMenu
          items={[
            { kind: 'action', label: t(props.uiCatalog, 'aiMark.review'), run: () => props.onAiReviewed?.(aiMenu.id) },
            { kind: 'action', label: t(props.uiCatalog, 'aiMark.show'), run: () => props.onAiShow?.(aiMenu.id) },
          ]}
          commands={NO_COMMANDS}
          at={aiMenu.at}
          onClose={() => setAiMenu(undefined)}
        />
      )}
      <div className="pages" ref={container} style={{ zoom: props.zoom, ['--zoom' as string]: props.zoom }}>
        {pages.map((page, p) => (
          <section
            key={p}
            className="page"
            style={{
              width: mm(geometry.width),
              height: mm(geometry.height),
              padding: `${mm(geometry.margin.top)} ${mm(geometry.margin.right)} ${mm(geometry.margin.bottom)} ${mm(geometry.margin.left)}`,
            }}
          >
            <div className="page-head">{props.title}</div>
            <div className="page-body">
              {page.map((item) =>
                item.kind === 'summary' ? (
                  summaryItem()
                ) : item.kind === 'side' ? (
                  sideItem(item.picture, item.rows, item.block)
                ) : item.kind === 'flow' ? (
                  <div key={`flow:${item.rows[0]!.start}`} data-item className="flow-group">
                    {item.rows.map((seg) => rowItem(seg, false))}
                  </div>
                ) : (
                  rowItem(item.seg)
                ),
              )}
            </div>
            {props.footer && <div className="page-foot-left">{props.footer}</div>}
            <div className="page-foot">
              {t(props.uiCatalog, 'print.page')} {p + 1} {t(props.uiCatalog, 'print.of')} {pages.length}
            </div>
          </section>
        ))}
      </div>
    </>
  );

  function summaryItem() {
    return (
      <div
        key="summary"
        data-item
        className="summary-box"
        dangerouslySetInnerHTML={{
          __html: renderSummary(print.summary!.rows, print.summary!.allPassed, props.printCatalog),
        }}
      />
    );
  }

  function sideItem(picture: Segment, rows: readonly Segment[], block: Extract<PrintBlock, { kind: 'picture' }>) {
    return (
      <div key={`side:${picture.start}`} data-item data-picture={picture.start} className={`side-group side-${block.side}`} style={{ ['--side' as string]: `${block.width ?? 40}%` }}>
        <div className="side-rows">{rows.map((seg) => rowItem(seg, false))}</div>
        <div className="side-picture">{rowItem(picture, false)}</div>
      </div>
    );
  }

  /** The cells of a table of the sheet to edit as a grid, unless it was asked for as text. */
  function gridOf(seg: Segment, statement: Statement | undefined) {
    return statement?.kind === 'table' && gridAt === seg.start ? parseSheetTable(seg.text) : undefined;
  }

  function rowItem(seg: Segment, measured = true) {
    const statement = seg.statement !== undefined ? result.statements[seg.statement] : undefined;
    const isEditing = editing?.start === seg.start;
    const block = statement ? blockByLine.get(seg.start) : undefined;
    const selected = seg.statement !== undefined && seg.statement === props.selected;
    // @clear ends the flow around a wrapped picture: this row and all below start under it.
    const clear = /^\s*@clear\b/.test(seg.text);
    // Made by the AI and not reviewed yet: marked until a person says it is right.
    let aiMark: { id: string; title: string } | undefined;
    for (let line = seg.start; line <= seg.end && !aiMark; line++) aiMark = props.aiMade?.get(line);
    const placed = (block?.kind === 'picture' || block?.kind === 'chart') && block.wrap ? block : undefined;
    const stop = placed?.dy ? <div key={`stop:${seg.start}`} className={`wrap-stop wrap-${placed.wrap}`} style={{ height: `${placed.dy}mm` }} /> : null;
    const row = (
      <div
        key={`${seg.start}:${isEditing ? 'e' : seg.text}`}
        data-item={measured ? '' : undefined}
        className={`row${isEditing ? ' editing' : ''}${selected ? ' selected' : ''}${marked.has(seg.start) ? ' marked' : ''}${statement?.status === 'error' ? ' has-error' : ''}${placed ? ` wrap-${placed.wrap}` : ''}${clear ? ' clear-row' : ''}${aiMark ? ' ai-made' : ''}`}
        style={
          placed
            ? { width: `${placed.width ?? 40}%`, ...(placed.dx ? { [placed.wrap === 'right' ? 'marginRight' : 'marginLeft']: `${placed.dx}%` } : {}), ...(placed.dy ? { clear: placed.wrap } : {}) }
            : undefined
        }
        data-line={seg.start}
        onMouseDown={(e) => {
          // A click on a picture or a chart selects it and offers what can be done with it; the text of the line opens from the menu or by a double click.
          const figure = (block?.kind === 'picture' || block?.kind === 'chart') && !(e.target as HTMLElement).closest('textarea') ? (e.target as HTMLElement).closest('figure') : null;
          // Even from its open line the picture or the chart can be taken and moved.
          if (e.button === 0 && (e.ctrlKey || e.shiftKey) && !(e.target as HTMLElement).closest('textarea, .pick-control')) {
            e.preventDefault();
            mark(seg, e.shiftKey);
            return;
          }
          // Pressed on the line number: rows are marked, dragged over the numbers as many as passed.
          if (e.button === 0 && (e.target as HTMLElement).closest('.gutter') && !(e.target as HTMLElement).closest('button')) {
            e.preventDefault();
            dragMark(seg);
            return;
          }
          if ((isEditing && !figure) || (e.target as HTMLElement).closest('.pick-control')) return;
          e.preventDefault();
          // The right button on a marked row keeps the marks: its menu works on all of them.
          if (marked.size > 0 && !(e.button !== 0 && marked.has(seg.start))) setMarked(new Set());
          if (e.button === 0) markAnchor.current = undefined;
          // The right button only selects and opens a menu (onContextMenu), never the line.
          if (e.button !== 0) {
            if (!figure) props.onSelect(seg.statement);
            return;
          }
          if ((block?.kind === 'picture' || block?.kind === 'chart') && figure && e.button === 0) {
            props.onEdit(undefined);
            props.onSelect(seg.statement);
            pressPicture(e, seg, figure);
            return;
          }
          props.onEdit({ start: seg.start, end: seg.end });
          props.onSelect(seg.statement);
        }}
        onDoubleClick={(e) => {
          if (block?.kind === 'chart' && (e.target as HTMLElement).closest('figure')) props.onEdit({ start: seg.start, end: seg.end });
          if (block?.kind === 'picture' && (e.target as HTMLElement).closest('figure')) {
            setPictureMenu(undefined);
            // A canvas opens in its window; a picture opens its line.
            if (isCanvasPath(block.path)) props.onEditCanvas(block.path);
            else props.onEdit({ start: seg.start, end: seg.end });
          }
        }}
        onContextMenu={(e) => {
          // A solve line expressed by a formula: the formula can become a definition of its own.
          const solution = statement?.statement.kind === 'solve' && statement.solutions?.length === 1 ? statement.solutions[0] : undefined;
          // In the text of an open line the menu of the text (copy, paste) stays.
          if (solution?.formula && statement?.statement.kind === 'solve' && !(e.target as HTMLElement).closest('textarea')) {
            e.preventDefault();
            props.onSelect(seg.statement);
            const equation = statement.statement.equations[0]!.span;
            const from = result.source.slice(equation.offset, equation.offset + equation.length).replace(/\s+/g, ' ');
            setSolveMenu({ seg, line: `${solution.name} := ${formatExpr(solution.formula)}  ' ${t(props.uiCatalog, 'solve.expressedFrom')} ${from}`, at: { x: e.clientX, y: e.clientY } });
            return;
          }
          if ((block?.kind === 'equation' || block?.kind === 'check' || block?.kind === 'paragraph' || block?.kind === 'heading') && !(e.target as HTMLElement).closest('textarea')) {
            e.preventDefault();
            props.onSelect(seg.statement);
            setFormatMenu({ seg, at: { x: e.clientX, y: e.clientY }, text: block.kind === 'paragraph' || block.kind === 'heading' });
            return;
          }
          if ((block?.kind !== 'picture' && block?.kind !== 'chart') || !(e.target as HTMLElement).closest('figure')) return;
          e.preventDefault();
          props.onSelect(seg.statement);
          setPictureMenu({ seg, at: { x: e.clientX, y: e.clientY }, flow: true });
        }}
      >
        <span className="gutter">
          {aiMark && (
            <button
              type="button"
              className="ai-mark"
              title={aiMark.title}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAiMenu({ id: aiMark!.id, at: { x: e.clientX, y: e.clientY } });
              }}
            >
              AI
            </button>
          )}
          {seg.start}
        </span>
        <div className="content">
          {isEditing && gridOf(seg, statement?.statement) ? (
            <SheetTableGrid
              table={gridOf(seg, statement?.statement)!}
              decimalComma={props.decimalComma}
              catalog={props.uiCatalog}
              onChange={(text) => props.onReplace(seg.start, seg.end, text)}
              onDone={() => props.onEdit(undefined)}
              onText={() => setGridAt(undefined)}
            />
          ) : isEditing ? (
            <RowEditor
              seg={seg}
              initialCursor={editing?.cursor}
              decimalComma={props.decimalComma}
              result={result}
              onChange={(text) => props.onReplace(seg.start, seg.end, text)}
              onEnter={() => props.onInsertAfter(seg.end)}
              onDeleteEmpty={() => {
                const previous = segs[segs.indexOf(seg) - 1];
                props.onDelete(seg.start, seg.end);
                props.onEdit(previous ? { start: previous.start, end: previous.end } : undefined);
              }}
              onMove={(d) => move(seg, d)}
              onDone={() => props.onEdit(undefined)}
            />
          ) : null}
          {block?.kind === 'picture' ? (
            <PictureBlock
              block={block}
              editing={props.inlineCanvas?.path === block.path ? props.inlineCanvas.render() : undefined}
              catalog={props.printCatalog}
              onLoad={() => relayout((n) => n + 1)}
              onResize={(width) => {
                const picture = parsePicture(seg.text);
                if (picture) props.onReplace(seg.start, seg.end, formatPicture({ ...picture, width }));
              }}
            />
          ) : block?.kind === 'chart' ? (
            <ChartBlock
              block={block}
              catalog={props.printCatalog}
              onResize={(width) => {
                const item = placeable(seg.text);
                if (item) props.onReplace(seg.start, seg.end, item.write({ ...item.place, width }));
              }}
            />
          ) : block && !(isEditing && gridOf(seg, statement?.statement)) ? (
            <Block block={block} catalog={props.printCatalog} {...(props.calcStyle ? { style: props.calcStyle } : {})} />
          ) : (
            !isEditing && <PlainLine text={props.decimalComma ? toDecimalComma(seg.text) : seg.text} />
          )}
          {!isEditing && statement && <PickFor statement={statement.statement} result={result} catalog={props.printCatalog} resolveFile={props.resolveFile} onPick={props.onPick} />}
        </div>
      </div>
    );
    return stop ? [stop, row] : row;
  }
}

function Block({ block, catalog, style }: { block: PrintBlock; catalog: Catalog; style?: CalcStyle }) {
  return (
    <div
      className="block-view"
      dangerouslySetInnerHTML={{
        __html: renderBlockHtml(block, catalog, { defineOperator: '≔', ...(style ? { style } : {}) }),
      }}
    />
  );
}

/**
 * A chart as printed; the pointer over it reads the values: a vertical line
 * at the nearest point and the value of every curve there.
 */
function ChartBlock({ block, catalog, onResize }: { block: Extract<PrintBlock, { kind: 'chart' }>; catalog: Catalog; onResize(width: number): void }) {
  const [hover, setHover] = useState<{ left: number; top: number; height: number; lines: string[] } | undefined>();
  const [dragged, setDragged] = useState<number | undefined>();
  const view = useRef<HTMLDivElement>(null);
  // The box of the chart carries its width and edge (a row flowed around carries them itself); the chart fills it.
  const { wrap: _w, dx: _x, dy: _y, width: _s, align: _a, ...plain } = block;
  const width = block.wrap ? undefined : (dragged ?? block.width);
  const read = (e: ReactMouseEvent<HTMLDivElement>) => {
    const svg = e.currentTarget.querySelector('svg');
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    // The page may be zoomed: client px -> px of the block -> units of the SVG.
    const own = e.currentTarget.getBoundingClientRect();
    const toBlock = e.currentTarget.offsetWidth / own.width;
    const unit = box.width / block.layout.width;
    const px = (e.clientX - box.left) / unit;
    const { plot } = block.layout;
    if (px < plot.left - 4 || px > plot.right + 4) return setHover(undefined);
    const x = xValueAt(block.layout, px);
    const near = block.spec.series[0]!.xs.reduce((best, v, i, xs) => (Math.abs(v - x) < Math.abs(xs[best]! - x) ? i : best), 0);
    const at = block.spec.series[0]!.xs[near]!;
    const number = (v: number) => formatNumber(v, catalog, { digits: 4 }).replace('-', '−');
    const withUnit = (v: number, u: string) => (Number.isFinite(v) ? `${number(v)}${u ? ` ${u}` : ''}` : '–');
    const xText = block.xDates ? formatDate(at, catalog) : withUnit(at, block.xUnit);
    const head = block.spec.xTitle.split(' [')[0] || '#';
    const lines = [`${head} = ${xText}`, ...block.spec.series.map((s) => `${s.label} = ${withUnit(s.ys[s.xs.indexOf(at)] ?? NaN, block.yUnit)}`)];
    setHover({
      left: (box.left - own.left + xPosition(block.layout, at) * unit) * toBlock,
      top: (box.top - own.top + plot.top * unit) * toBlock,
      height: (plot.bottom - plot.top) * unit * toBlock,
      lines,
    });
  };
  return (
    <div
      ref={view}
      className={`chart-view${block.align && !block.wrap ? ` align-${block.align}` : ''}`}
      style={width !== undefined ? { width: `${width}%` } : undefined}
      onMouseMove={read}
      onMouseLeave={() => setHover(undefined)}
    >
      <Block block={plain} catalog={catalog} />
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <span
          key={corner}
          className={`picture-handle ${corner}`}
          title={t(catalog, 'editor.pictureResize')}
          onMouseDown={(e) => view.current && startResize(e, view.current, block, block.width, setDragged, (w) => (setDragged(undefined), w !== block.width && onResize(w)))}
        />
      ))}
      {dragged !== undefined && <span className="picture-size">{dragged} %</span>}
      {hover && (
        <>
          <div className="chart-crosshair" style={{ left: hover.left, top: hover.top, height: hover.height }} />
          <div className={`chart-tooltip${hover.left > 360 ? ' left' : ''}`} style={{ left: hover.left, top: hover.top }}>
            {hover.lines.map((l, i) => (
              <div key={i}>
                {labelParts(l).map((p, j) => (p.sub ? <sub key={j}>{p.text}</sub> : p.text))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A picture as printed, with a handle in its corner: dragging it sets the
 * width as a share of the text width (the picture stays centred).
 */
function PictureBlock({
  block,
  editing,
  catalog,
  onLoad,
  onResize,
}: {
  block: Extract<PrintBlock, { kind: 'picture' }>;
  /** A canvas being edited takes the place of its picture. */
  editing?: ReactNode;
  catalog: Catalog;
  onLoad(): void;
  onResize(width: number): void;
}) {
  const [dragged, setDragged] = useState<number | undefined>();
  const figure = useRef<HTMLElement>(null);
  const width = dragged ?? block.width;

  const resize = (e: ReactMouseEvent) => {
    if (figure.current) startResize(e, figure.current, block, width, setDragged, (w) => (setDragged(undefined), w !== block.width && onResize(w)));
  };

  return (
    <div className="block-view">
      <figure ref={figure} className={`block picture${width === undefined ? ' natural' : ''}${block.align ? ` align-${block.align}` : ''}`} data-line={block.line} style={width !== undefined ? { width: `${width}%` } : undefined}>
        {editing ?? (block.src ? <img src={block.src} alt={block.caption} draggable={false} onLoad={onLoad} /> : <div className="missing-image">{t(catalog, 'print.pictureMissing', { path: block.path })}</div>)}
        {block.label && (
          <figcaption>
            <span className="figure-label">{block.label}:</span> {block.caption}
          </figcaption>
        )}
        {!editing && (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
          <span key={corner} className={`picture-handle ${corner}`} title={t(catalog, 'editor.pictureResize')} onMouseDown={resize} />
        ))}
        {dragged !== undefined && <span className="picture-size">{dragged} %</span>}
      </figure>
    </div>
  );
}

/**
 * A corner handle of a picture or a chart dragged: the width as a share of the
 * text width. A centred one grows on both sides, one at an edge from that edge;
 * a row flowed around or a side column follows while dragging.
 */
function startResize(
  e: ReactMouseEvent,
  element: HTMLElement,
  place: { readonly side?: 'left' | 'right'; readonly wrap?: 'left' | 'right'; readonly align?: 'left' | 'right' },
  width: number | undefined,
  live: (width: number) => void,
  done: (width: number) => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const body = element.closest('.page-body');
  if (!body) return;
  const rect = element.getBoundingClientRect();
  const centre = rect.left + rect.width / 2;
  const bodyBox = body.getBoundingClientRect();
  const bodyWidth = bodyBox.width;
  const at = place.side ?? place.wrap ?? place.align;
  const edge = at === 'right' ? bodyBox.right : at === 'left' ? bodyBox.left : undefined;
  const group = element.closest<HTMLElement>('.side-group');
  const floating = place.wrap ? element.closest<HTMLElement>('.row') : null;
  let current = width ?? Math.round((rect.width / bodyWidth) * 100);
  const move = (event: MouseEvent) => {
    const span = edge === undefined ? 2 * Math.abs(event.clientX - centre) : Math.abs(event.clientX - edge);
    current = Math.max(10, Math.min(edge === undefined || place.align ? 100 : 70, Math.round((span / bodyWidth) * 100)));
    group?.style.setProperty('--side', `${current}%`);
    if (floating) floating.style.width = `${current}%`;
    live(current);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    done(current);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function PlainLine({ text }: { text: string }) {
  if (text.trim() === '') return <div className="blank" />;
  return <code className="raw">{text}</code>;
}

function PickFor(props: { statement: Statement; result: SheetResult; catalog: Catalog; resolveFile: (path: string) => string | undefined; onPick: Props['onPick'] }) {
  const pick = pickOf(props.statement);
  const table = pick ? props.result.tables.get(pick.table) : undefined;
  if (!pick || !table) return null;
  return <PickControl table={table} current={pick.key} resolveFile={props.resolveFile} format={(value) => formatNumber(value, props.catalog, { digits: 6 })} onChoose={(key) => props.onPick(props.statement, key)} />;
}

interface RowEditorProps {
  readonly seg: Segment;
  readonly initialCursor: number | undefined;
  readonly decimalComma: boolean;
  readonly result: SheetResult;
  onChange(text: string): void;
  onEnter(): void;
  onDeleteEmpty(): void;
  onMove(direction: -1 | 1): void;
  onDone(): void;
}

function RowEditor({ seg, initialCursor, decimalComma, result, onChange, onEnter, onDeleteEmpty, onMove, onDone }: RowEditorProps) {
  // The line is edited in the user's notation (50,5) and stored in file notation (50.5).
  // What the user types is kept as typed: converting it back on every keystroke
  // would turn a half-typed "55," into "55;" before the next digit arrives.
  const toShown = (text: string) => (decimalComma ? toDecimalComma(text) : text);
  const [shown, setShown] = useState(() => toShown(seg.text));
  const lastStored = useRef(seg.text);
  const store = (text: string) => {
    setShown(text);
    lastStored.current = decimalComma ? fromDecimalComma(text) : text;
    onChange(lastStored.current);
  };
  // A change from outside (not typed here) replaces the draft.
  if (seg.text !== lastStored.current) {
    lastStored.current = seg.text;
    setShown(toShown(seg.text));
  }
  const ref = useRef<HTMLTextAreaElement>(null);
  const [original] = useState(seg.text);
  const pendingCursor = useRef<number | undefined>(undefined);

  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.focus();
    const at = Math.min(initialCursor ?? area.value.length, area.value.length);
    area.setSelectionRange(at, at);
  }, []);

  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = '0';
    area.style.height = `${area.scrollHeight}px`;
    if (pendingCursor.current !== undefined) {
      area.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = undefined;
    }
  });

  const definedElsewhere = (name: string) => result.statements.some((r) => r.statement.kind === 'definition' && r.statement.name === name && (r.statement.span.line < seg.start || r.statement.span.line > seg.end));

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const area = e.currentTarget;
    const atStart = area.selectionStart === 0 && area.selectionEnd === 0;
    const atEnd = area.selectionStart === area.value.length;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      lastStored.current = original;
      onChange(original);
      onDone();
    } else if (e.key === 'Backspace' && area.value === '') {
      e.preventDefault();
      onDeleteEmpty();
    } else if (e.key === 'ArrowUp' && (atStart || !area.value.slice(0, area.selectionStart).includes('\n'))) {
      e.preventDefault();
      onMove(-1);
    } else if (e.key === 'ArrowDown' && (atEnd || !area.value.slice(area.selectionStart).includes('\n'))) {
      e.preventDefault();
      onMove(1);
    }
  };

  return (
    <textarea
      ref={ref}
      className="row-editor"
      spellCheck={false}
      rows={1}
      value={shown}
      onChange={(e) => {
        // A single "=" just typed (by keyboard, paste or dictation) may become ":=".
        const area = e.target;
        const at = area.selectionStart - 1;
        const typedEquals = area.value.length === shown.length + 1 && area.value[at] === '=' && area.value.slice(0, at) + area.value.slice(at + 1) === shown;
        const edit = typedEquals ? defineShortcut(shown, at, definedElsewhere) : undefined;
        if (edit) pendingCursor.current = edit.cursor;
        store(edit ? edit.text : area.value);
      }}
      onKeyDown={onKeyDown}
    />
  );
}
