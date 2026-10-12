/**
 * A line of text or a heading edited as in a word processor: the words as they
 * print, bold and italic parts by Ctrl+B / Ctrl+I, the look of the paragraph
 * from the Format menu or the Properties pane. The quotes and the marks of the
 * language stay out of sight; the line is written back on every change.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { textColorCss, textFontCss } from '@kalketa/render';
import { formatTextLine, marksOf, parseTextLine, type TextLine, type TextRun } from '../logic/textLine.js';
import type { LineAttributes } from '../logic/lineFormat.js';

/** What the Format menu and the Properties pane read and change of the line being edited. */
export interface TextFormat {
  /** 0 a paragraph, 1–3 a heading. */
  readonly level: number;
  readonly attributes: LineAttributes;
  /** The words at the caret or the marked ones are bold / italic. */
  readonly bold: boolean;
  readonly italic: boolean;
  /** The colour of the words at the caret: their own, else the line's. */
  readonly color: string | undefined;
  toggleBold(): void;
  toggleItalic(): void;
  /** Sets (or with undefined removes) a mark of the whole line: size, font, color, align. */
  set(key: string, value: string | undefined): void;
  setLevel(level: number): void;
  /** A colour (undefined: the default) for the marked words, or for the whole line when none are marked. */
  setColor(color: string | undefined): void;
  /** The line as written in the language, to edit its marks by hand. */
  raw(): void;
  /** Words put at the caret (a symbol of a toolbar, the clipboard). */
  insert(text: string): void;
}

interface Props {
  readonly text: string;
  onChange(text: string): void;
  onEnter(): void;
  onTab(): void;
  onDeleteEmpty(): void;
  onMove(direction: -1 | 1): void;
  onDone(): void;
  onRaw(): void;
  onFormat?(format: TextFormat | undefined): void;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function htmlOf(runs: readonly TextRun[]): string {
  return runs
    .map((run) => {
      let html = escapeHtml(run.text);
      if (run.italic) html = `<i>${html}</i>`;
      if (run.bold) html = `<b>${html}</b>`;
      if (run.color) html = `<span data-color="${run.color}" style="color: ${textColorCss(run.color)}">${html}</span>`;
      return html;
    })
    .join('');
}

/** The words of the edited element with their bold and italic parts. */
function runsIn(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  const formatOf = (node: Node) => {
    let bold: boolean | undefined;
    let italic: boolean | undefined;
    let color: string | undefined;
    for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
      const tag = el.tagName;
      color ??= el.dataset['color'];
      if (bold === undefined) {
        if (tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(el.style.fontWeight)) bold = true;
        else if (/^(normal|[1-5]00)$/.test(el.style.fontWeight)) bold = false;
      }
      if (italic === undefined) {
        if (tag === 'I' || tag === 'EM' || el.style.fontStyle === 'italic') italic = true;
        else if (el.style.fontStyle === 'normal') italic = false;
      }
    }
    return { bold: !!bold, italic: !!italic, color };
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
    if (!text) continue;
    const { bold, italic, color } = formatOf(node);
    const last = runs[runs.length - 1];
    if (last && !!last.bold === bold && !!last.italic === italic && last.color === color) runs[runs.length - 1] = { ...last, text: last.text + text };
    else runs.push({ text, ...(bold ? { bold } : {}), ...(italic ? { italic } : {}), ...(color ? { color } : {}) });
  }
  return runs;
}

/** The look of the line ({size=12 font=serif …}) as the printout shows it. */
function styleOf(attributes: LineAttributes): CSSProperties {
  const style: CSSProperties = {};
  const size = Number(attributes.get('size'));
  if (size > 0) style.fontSize = `${size}pt`;
  const font = attributes.get('font');
  if (font) style.fontFamily = textFontCss(font);
  if (attributes.has('italic')) style.fontStyle = 'italic';
  if (attributes.has('bold')) style.fontWeight = 'bold';
  const align = attributes.get('align');
  if (align) style.textAlign = align as CSSProperties['textAlign'];
  const color = attributes.get('color');
  if (color) style.color = textColorCss(color);
  return style;
}

const ALIGN_KEYS: Readonly<Record<string, string | undefined>> = { l: undefined, e: 'center', r: 'right', j: 'justify' };

export function TextRowEditor({ text, onChange, onEnter, onTab, onDeleteEmpty, onMove, onDone, onRaw, onFormat }: Props) {
  const line = parseTextLine(text)!;
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(line);
  latest.current = line;
  const [original] = useState(text);
  const range = useRef<Range | undefined>(undefined);
  const [state, setState] = useState<{ bold: boolean; italic: boolean; color: string | undefined }>({ bold: false, italic: false, color: undefined });
  // The marked words to mark again after the words are drawn anew (a colour given to them).
  const reselect = useRef<{ start: number; end: number } | undefined>(undefined);

  const write = (next: TextLine) => onChange(formatTextLine(next));
  const emit = () => {
    if (ref.current) write({ ...latest.current, runs: runsIn(ref.current) });
  };

  // The words shown follow the line; while they say the same, what is typed stays as it is (and the caret with it).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || marksOf(runsIn(el)) === marksOf(line.runs)) return;
    el.innerHTML = htmlOf(line.runs);
    if (document.activeElement !== el) return;
    if (reselect.current) selectOffsets(el, reselect.current.start, reselect.current.end);
    else caretToEnd(el);
    reselect.current = undefined;
  });

  // Open: the caret at the end of the words. A new paragraph style is a new element, which gets the focus back.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    caretToEnd(el);
  }, [line.level > 0 ? 'h' : 'p', line.level]);

  // The format at the caret, for the menu and the pane; the selection is kept to come back to.
  useEffect(() => {
    const onSelection = () => {
      const el = ref.current;
      const selection = document.getSelection();
      if (!el || !selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) return;
      range.current = selection.getRangeAt(0).cloneRange();
      const { start } = offsetsIn(el);
      const next = { bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), color: runAt(runsIn(el), start)?.color };
      setState((s) => (s.bold === next.bold && s.italic === next.italic && s.color === next.color ? s : next));
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const focusBack = () => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    const selection = document.getSelection();
    if (range.current && selection && !el.contains(selection.anchorNode)) {
      selection.removeAllRanges();
      selection.addRange(range.current);
    }
  };
  const setMark = (key: string, value: string | undefined) => {
    const attributes = new Map(latest.current.attributes);
    if (value === undefined) attributes.delete(key);
    else attributes.set(key, value);
    write({ ...latest.current, attributes });
  };
  // Bold of the whole line (its mark) goes as a whole; otherwise the marked words, as a word processor does.
  const toggle = (kind: 'bold' | 'italic') => {
    focusBack();
    if (latest.current.attributes.has(kind)) setMark(kind, undefined);
    else document.execCommand(kind);
  };

  const api = useRef<TextFormat | undefined>(undefined);
  useEffect(() => {
    api.current = {
      level: line.level,
      attributes: line.attributes,
      bold: state.bold,
      italic: state.italic,
      toggleBold: () => toggle('bold'),
      toggleItalic: () => toggle('italic'),
      set: (key, value) => {
        focusBack();
        setMark(key, value);
      },
      setLevel: (level) => write({ ...latest.current, level }),
      color: state.color ?? line.attributes.get('color'),
      setColor: (color) => {
        focusBack();
        const el = ref.current;
        const { start, end } = el ? offsetsIn(el) : { start: 0, end: 0 };
        if (!el || start === end) return setMark('color', color);
        // The marked words only: they get the colour as a part of the text ({red}…{/}), the rest stays.
        reselect.current = { start, end };
        write({ ...latest.current, runs: recolor(runsIn(el), start, end, color === latest.current.attributes.get('color') ? undefined : color) });
      },
      raw: onRaw,
      insert: (words) => {
        focusBack();
        document.execCommand('insertText', false, words.replace(/\s*[\r\n]+\s*/g, ' ').replace(/"/g, '“'));
      },
    };
    onFormat?.(api.current);
  }, [text, state]);
  useEffect(() => () => onFormat?.(undefined), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const key = e.key.toLowerCase();
    // Keys of the editor stay in it (Ctrl+E is no command of the window here).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ['b', 'i', 'u', 'l', 'e', 'r', 'j'].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      if (key === 'b') toggle('bold');
      else if (key === 'i') toggle('italic');
      else if (key !== 'u') setMark('align', ALIGN_KEYS[key]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && ['0', '1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      write({ ...latest.current, level: Number(e.key) });
      return;
    }
    const caret = caretAt(el);
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onChange(original);
      onDone();
    } else if (e.key === 'Tab' && !e.shiftKey && caret.atEnd) {
      e.preventDefault();
      onTab();
    } else if (e.key === 'Backspace' && (el.textContent ?? '') === '') {
      e.preventDefault();
      onDeleteEmpty();
    } else if (e.key === 'ArrowUp' && caret.firstLine) {
      e.preventDefault();
      onMove(-1);
    } else if (e.key === 'ArrowDown' && caret.lastLine) {
      e.preventDefault();
      onMove(1);
    }
  };

  const Tag = line.level > 0 ? (`h${Math.min(line.level + 1, 6)}` as 'h2') : 'p';
  return (
    <div className="block-view text-editing">
      <Tag
        key={Tag}
        ref={ref as never}
        className={`${line.level > 0 ? '' : 'text '}text-edit`}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-text-editor=""
        style={styleOf(line.attributes)}
        onInput={emit}
        onKeyDown={onKeyDown}
        onBeforeInput={(e) => {
          // A quote would end the text in the language: typographic quotes, „ to open and “ to close.
          const data = (e.nativeEvent as InputEvent).data;
          if (data !== '"') return;
          e.preventDefault();
          const before = textBeforeCaret(e.currentTarget);
          const open = before === '' || /[\s(\[]$/.test(before);
          // The quote that ends the text, typed by habit at its end, is there already (only out of sight).
          const quoteOpen = (before.match(/„/g)?.length ?? 0) > (before.match(/“/g)?.length ?? 0);
          if (!open && !quoteOpen && caretAt(e.currentTarget).atEnd) return;
          document.execCommand('insertText', false, open ? '„' : '“');
        }}
        onPaste={(e) => {
          // Pasted as words only: the look is that of the line.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ').replace(/"/g, '“'));
        }}
      />
    </div>
  );
}

function caretToEnd(el: HTMLElement) {
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function textBeforeCaret(el: HTMLElement): string {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return '';
  const range = document.createRange();
  range.selectNodeContents(el);
  range.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
  return range.toString();
}

/** Where the caret is: at the end of the words, on the first or the last line of the paragraph. */
function caretAt(el: HTMLElement): { atEnd: boolean; firstLine: boolean; lastLine: boolean } {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return { atEnd: true, firstLine: true, lastLine: true };
  const caret = selection.getRangeAt(0);
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(caret.endContainer, caret.endOffset);
  const atEnd = after.toString() === '';
  const rect = caret.getClientRects()[0];
  const box = el.getBoundingClientRect();
  if (!rect) return { atEnd, firstLine: true, lastLine: true };
  return { atEnd, firstLine: rect.top - box.top < rect.height, lastLine: box.bottom - rect.bottom < rect.height };
}

/** Where the marked words start and end, counted in characters of the words. */
function offsetsIn(el: HTMLElement): { start: number; end: number } {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) return { start: 0, end: 0 };
  const range = selection.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

/** Marks the words from start to end (characters of the words). */
function selectOffsets(el: HTMLElement, start: number, end: number) {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let at = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start <= at + length) {
      range.setStart(node, start - at);
      started = true;
    }
    if (started && end <= at + length) {
      range.setEnd(node, end - at);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    at += length;
  }
}

/** The run with the character at a place in the words (at their end, the last one). */
function runAt(runs: readonly TextRun[], offset: number): TextRun | undefined {
  let at = 0;
  for (const run of runs) {
    if (offset < at + run.text.length) return run;
    at += run.text.length;
  }
  return runs[runs.length - 1];
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
