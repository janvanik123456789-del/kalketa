/**
 * The sheet as a column of rows. A row shows its statement typeset exactly as
 * in print; clicking it turns it into a text line that is re-evaluated on
 * every keystroke.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { fromDecimalComma, toDecimalComma, type SheetResult, type Statement } from '@calccanvas/core';
import { formatNumber, t, type Catalog } from '@calccanvas/i18n';
import { renderBlockHtml, renderSummary, type PrintBlock, type PrintDocument } from '@calccanvas/render';
import { paginate, type PageGeometry } from '../logic/pages.js';
import { segments, type Segment } from '../logic/segments.js';
import { defineShortcut } from '../logic/shortcuts.js';
import { pickOf } from '../logic/pick.js';
import { PickControl } from './PickControl.js';

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
  onInsertAfter(line: number): void;
  onDelete(start: number, end: number): void;
  onPick(statement: Statement, key: string): void;
  /** Page size and margins of the printout. */
  readonly geometry: PageGeometry;
  /** Scale of the pages (1 = 100 %). */
  readonly zoom: number;
  /** Title in the page header. */
  readonly title: string;
  readonly uiCatalog: Catalog;
  /** Show and accept numbers with a decimal comma (50,5; arguments separated by ";"). */
  readonly decimalComma: boolean;
}

export function SheetView(props: Props) {
  const { source, result, print, editing } = props;
  const segs = segments(source, result.sheet.statements, editing);
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

  // Items laid out on pages: the summary of checks first, then the rows.
  const items: ({ kind: 'summary' } | { kind: 'row'; seg: Segment })[] = [
    ...(print.summary ? [{ kind: 'summary' as const }] : []),
    ...segs.map((seg) => ({ kind: 'row' as const, seg })),
  ];
  const breakAfter = items.map((item) => item.kind === 'row' && /^\s*@page\b/.test(item.seg.text));

  // Pagination measures the rendered items, then places them on pages. Heights
  // do not depend on the page an item is on, so this settles in one pass.
  const [starts, setStarts] = useState<number[]>([0]);
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = container.current;
    const body = root?.querySelector<HTMLElement>('.page-body');
    if (!root || !body) return;
    const heights = [...root.querySelectorAll<HTMLElement>('[data-item]')].map((el) => el.offsetHeight);
    const next = paginate(heights, body.clientHeight, breakAfter);
    if (next.join() !== starts.join()) setStarts(next);
  });

  const pages = starts.map((start, i) => items.slice(start, starts[i + 1] ?? items.length)).filter((page) => page.length > 0);
  const { geometry } = props;
  const mm = (value: number) => `${value}mm`;

  return (
    <div className="pages" ref={container} style={{ zoom: props.zoom }}>
      {pages.map((page, p) => (
        <section
          key={p}
          className="page"
          style={{ width: mm(geometry.width), height: mm(geometry.height), padding: `${mm(geometry.margin.top)} ${mm(geometry.margin.right)} ${mm(geometry.margin.bottom)} ${mm(geometry.margin.left)}` }}
        >
          <div className="page-head">{props.title}</div>
          <div className="page-body">
            {page.map((item) => (item.kind === 'summary' ? summaryItem() : rowItem(item.seg)))}
          </div>
          <div className="page-foot">
            {t(props.uiCatalog, 'print.page')} {p + 1} {t(props.uiCatalog, 'print.of')} {pages.length}
          </div>
        </section>
      ))}
    </div>
  );

  function summaryItem() {
    return (
      <div key="summary" data-item className="summary-box" dangerouslySetInnerHTML={{ __html: renderSummary(print.summary!.rows, print.summary!.allPassed, props.printCatalog) }} />
    );
  }

  function rowItem(seg: Segment) {
    const statement = seg.statement !== undefined ? result.statements[seg.statement] : undefined;
    const isEditing = editing?.start === seg.start;
    const block = statement ? blockByLine.get(seg.start) : undefined;
    const selected = seg.statement !== undefined && seg.statement === props.selected;
    return (
      <div
        key={`${seg.start}:${isEditing ? 'e' : seg.text}`}
        data-item
        className={`row${isEditing ? ' editing' : ''}${selected ? ' selected' : ''}${statement?.status === 'error' ? ' has-error' : ''}`}
        data-line={seg.start}
        onMouseDown={(e) => {
          if (isEditing || (e.target as HTMLElement).closest('.pick-control')) return;
          e.preventDefault();
          props.onEdit({ start: seg.start, end: seg.end });
          props.onSelect(seg.statement);
        }}
      >
        <span className="gutter">{seg.start}</span>
        <div className="content">
          {isEditing ? (
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
          {block ? <Block block={block} catalog={props.printCatalog} /> : !isEditing && <PlainLine text={props.decimalComma ? toDecimalComma(seg.text) : seg.text} />}
          {!isEditing && statement && <PickFor statement={statement.statement} result={result} catalog={props.printCatalog} resolveFile={props.resolveFile} onPick={props.onPick} />}
        </div>
      </div>
    );
  }
}

function Block({ block, catalog }: { block: PrintBlock; catalog: Catalog }) {
  return <div className="block-view" dangerouslySetInnerHTML={{ __html: renderBlockHtml(block, catalog, { defineOperator: '≔' }) }} />;
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

  const definedElsewhere = (name: string) =>
    result.statements.some((r) => r.statement.kind === 'definition' && r.statement.name === name && (r.statement.span.line < seg.start || r.statement.span.line > seg.end));

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
