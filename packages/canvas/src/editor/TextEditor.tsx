/**
 * A text of the canvas written right in the drawing, as in a word processor:
 * bold, italic, underlined and coloured parts (Ctrl+B, Ctrl+I, Ctrl+U), the
 * font, size and alignment of the whole text, Enter for a new line. It is a
 * field over the text, as large as the text is on screen; Esc or a click
 * outside ends it.
 */

import { useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { FONT_FAMILIES, textLines, type CanvasItem, type TextAlign, type TextFont, type TextRun } from '../scene.js';
import type { CanvasTextKey } from './texts.js';

type TextItem = Extract<CanvasItem, { type: 'text' }>;

interface Props {
  readonly item: TextItem;
  /** The drawing on screen and its width in millimetres: where the field goes and how large. */
  stage(): { box: DOMRect; width: number } | undefined;
  readonly colours: readonly string[];
  readonly sizes: readonly number[];
  text(key: CanvasTextKey): string;
  /** The text as written (its runs), or undefined when nothing is left of it. */
  onDone(item: TextItem | undefined): void;
}

export function TextEditor({ item: initial, stage, colours, sizes, text, onDone }: Props) {
  const field = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  // Font, size and alignment belong to the whole text; the field shows them as they change.
  const item = useRef(initial);
  const at = stage();
  const scale = at ? at.box.width / at.width : 4;

  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.innerHTML = htmlOf(textLines(initial));
    element.focus();
    // The cursor at the end, as after a click past the last word.
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Parts in <b>, <i>, <u> and <font color>: what the runs are read back from.
    document.execCommand('styleWithCSS', false, 'false');
  }, []);

  const finish = () => {
    const element = field.current;
    if (!element) return;
    const lines = runsOf(element);
    const plain = lines.map((l) => l.map((r) => r.text).join('')).join('\n');
    if (plain.trim() === '') return onDone(undefined);
    const formatted = lines.some((l) => l.some((r) => r.bold || r.italic || r.underline || r.color));
    const { runs: _runs, ...rest } = item.current;
    onDone({ ...rest, text: plain, ...(formatted ? { runs: lines } : {}) });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // A click outside the field and its bar ends the writing.
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (field.current?.contains(target) || bar.current?.contains(target)) return;
      finishRef.current();
    };
    const timer = window.setTimeout(() => window.addEventListener('mousedown', outside, true));
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', outside, true);
    };
  }, []);

  const apply = (command: 'bold' | 'italic' | 'underline' | 'foreColor', value?: string) => {
    field.current?.focus();
    document.execCommand(command, false, value);
  };
  const setWhole = (change: { font?: TextFont; size?: number; align?: TextAlign }) => {
    item.current = { ...item.current, ...change };
    const element = field.current;
    if (!element) return;
    if (change.font) element.style.fontFamily = FONT_FAMILIES[change.font];
    if (change.size) element.style.fontSize = `${change.size * scale}px`;
    if (change.align) element.style.textAlign = change.align;
    element.focus();
  };
  // Buttons keep the selection in the field: pressed, they do not take the focus.
  const keep = (e: ReactMouseEvent) => e.preventDefault();

  if (!at) return null;
  const left = at.box.left + initial.x * scale;
  const top = at.box.top + initial.y * scale;
  return createPortal(
    <>
      <div ref={bar} className="canvas-text-bar" style={{ left, top: Math.max(4, top - 40) }} onMouseDown={keep}>
        <button type="button" data-text="bold" title={text('bold')} onClick={() => apply('bold')}>
          <b>B</b>
        </button>
        <button type="button" data-text="italic" title={text('italic')} onClick={() => apply('italic')}>
          <i>I</i>
        </button>
        <button type="button" data-text="underline" title={text('underline')} onClick={() => apply('underline')}>
          <u>U</u>
        </button>
        <span className="canvas-sep" />
        {colours.map((c) => (
          <button key={c} type="button" className="swatch" style={{ background: c }} title={c} onClick={() => apply('foreColor', c)} />
        ))}
        <span className="canvas-sep" />
        <select title={text('font')} defaultValue={initial.font ?? 'sans'} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setWhole({ font: e.target.value as TextFont })}>
          {(['sans', 'serif', 'mono'] as const).map((f) => (
            <option key={f} value={f}>
              {text(`font.${f}`)}
            </option>
          ))}
        </select>
        <select title={text('fontSize')} defaultValue={initial.size} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setWhole({ size: Number(e.target.value) })}>
          {[...new Set([...sizes, initial.size])].sort((a, b) => a - b).map((s) => (
            <option key={s} value={s}>
              {String(s).replace('.', ',')} mm
            </option>
          ))}
        </select>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} type="button" data-text={`align-${a}`} title={text(`align.${a}`)} onClick={() => setWhole({ align: a })}>
            {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
          </button>
        ))}
        <span className="canvas-text-hint">{text('textDone')}</span>
      </div>
      <div
        ref={field}
        className="canvas-text-editing"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        style={{
          left,
          top,
          fontSize: `${initial.size * scale}px`,
          fontFamily: FONT_FAMILIES[initial.font ?? 'sans'],
          fontWeight: initial.bold ? 'bold' : undefined,
          color: initial.color,
          textAlign: initial.align ?? 'left',
        }}
        onKeyDown={(e) => {
          // The keys are the text's own: the canvas does not take them as tools.
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            finish();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </>,
    document.body,
  );
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lines of runs as the field shows them: a <div> per line, the formats as <b>, <i>, <u>, <font>. */
export function htmlOf(lines: readonly (readonly TextRun[])[]): string {
  return lines
    .map((line) => {
      const inner = line
        .map((r) => {
          let html = esc(r.text);
          if (r.underline) html = `<u>${html}</u>`;
          if (r.italic) html = `<i>${html}</i>`;
          if (r.bold) html = `<b>${html}</b>`;
          if (r.color) html = `<font color="${esc(r.color)}">${html}</font>`;
          return html;
        })
        .join('');
      return `<div>${inner || '<br>'}</div>`;
    })
    .join('');
}

/** The minimal shape of a node read back: a DOM node in the editor, a plain object in tests. */
export interface RichNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<RichNode>;
  getAttribute?(name: string): string | null;
  readonly style?: { readonly fontWeight?: string; readonly fontStyle?: string; readonly textDecoration?: string; readonly textDecorationLine?: string; readonly color?: string };
}

/**
 * The lines of runs of a field written in: a <div> or <p> starts a line, <br> breaks one;
 * <b>/<strong>, <i>/<em>, <u> and <font color> (or the same in a style) give the formats.
 */
export function runsOf(root: RichNode): TextRun[][] {
  const lines: TextRun[][] = [[]];
  const push = (text: string, format: Omit<TextRun, 'text'>) => {
    if (!text) return;
    const line = lines[lines.length - 1]!;
    const last = line[line.length - 1];
    const same = last && !!last.bold === !!format.bold && !!last.italic === !!format.italic && !!last.underline === !!format.underline && last.color === format.color;
    if (same) line[line.length - 1] = { ...last, text: last.text + text };
    else line.push({ text, ...(format.bold ? { bold: true } : {}), ...(format.italic ? { italic: true } : {}), ...(format.underline ? { underline: true } : {}), ...(format.color ? { color: format.color } : {}) });
  };
  const walk = (node: RichNode, format: Omit<TextRun, 'text'>, top: boolean) => {
    if (node.nodeType === 3) return push((node.textContent ?? '').replace(/ /g, ' '), format);
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (name === 'BR') {
      lines.push([]);
      return;
    }
    const block = name === 'DIV' || name === 'P';
    // A block starts a line of its own, unless it is the first thing written.
    if (block && !top && lines[lines.length - 1]!.length > 0) lines.push([]);
    const style = node.style ?? {};
    const decoration = `${style.textDecoration ?? ''} ${style.textDecorationLine ?? ''}`;
    const colour = (name === 'FONT' ? node.getAttribute?.('color') : undefined) || style.color || undefined;
    const next = {
      ...format,
      ...(name === 'B' || name === 'STRONG' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600 ? { bold: true } : {}),
      ...(name === 'I' || name === 'EM' || style.fontStyle === 'italic' ? { italic: true } : {}),
      ...(name === 'U' || decoration.includes('underline') ? { underline: true } : {}),
      ...(colour ? { color: colour } : {}),
    };
    const children = Array.from(node.childNodes);
    children.forEach((child, i) => {
      // A <br> that only keeps an empty block open is no line of its own.
      if (block && child.nodeName.toUpperCase() === 'BR' && i === children.length - 1) return;
      walk(child, next, false);
    });
    // A block that ended a line: what follows starts the next one.
    if (block && !top) lines.push([]);
  };
  Array.from(root.childNodes).forEach((child) => walk(child, {}, false));
  // Lines left empty at the end by the last block are no lines.
  while (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
  return lines;
}
