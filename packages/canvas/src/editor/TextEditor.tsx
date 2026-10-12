/**
 * A text of the canvas written right in the drawing, as in a word processor:
 * bold, italic, underlined and coloured parts (Ctrl+B, Ctrl+I, Ctrl+U), the
 * font, size and alignment of the whole text, Enter for a new line. It is a
 * field over the text, as large as the text is on screen; Esc or a click
 * outside ends it.
 */

import { useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { FontOptions } from './FontOptions.js';
import { fontFamilyOf, textLines, type CanvasItem, type TextAlign, type TextFont } from '../scene.js';
import { htmlOf, runsOf } from './richText.js';
import type { CanvasTextKey } from './texts.js';

type TextItem = Extract<CanvasItem, { type: 'text' }>;

interface Props {
  readonly item: TextItem;
  /** The drawing on screen and its width in millimetres: where the field goes and how large. */
  stage(): { box: DOMRect; width: number } | undefined;
  readonly colours: readonly string[];
  readonly sizes: readonly number[];
  readonly fonts: readonly string[];
  text(key: CanvasTextKey): string;
  /** The text as written (its runs), or undefined when nothing is left of it. */
  onDone(item: TextItem | undefined): void;
}

export function TextEditor({ item: initial, stage, colours, sizes, fonts, text, onDone }: Props) {
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
    if (change.font) element.style.fontFamily = fontFamilyOf(change.font);
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
          <FontOptions fonts={fonts} current={initial.font ?? 'sans'} text={text} />
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
          fontFamily: fontFamilyOf(initial.font),
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
