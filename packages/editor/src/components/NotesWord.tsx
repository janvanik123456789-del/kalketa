/**
 * Notes of a sources layer edited like in a word processor: the text is
 * written straight into the formatted page, the toolbar sets the style of a
 * paragraph (normal, heading 1–3, citation), bold, italic, code, lists,
 * tables, lines, pictures and links. Underneath, the layer keeps its small
 * Markdown subset (logic/notesDoc.ts), so print, the AI and the file format
 * stay as they were. A heading carries the id of its theory section as an
 * attribute, shown as a badge and never typed.
 */
import { createContext, useContext, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, Extension, Mark, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type JSONContent, type ReactNodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { figureDescription, figurePlace, figureStyle, isAiNote, kalkConfirmed, kalkLines, withFigurePlace, type FigurePlace } from '@kalketa/render';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { commandIcon } from '../icons.js';
import { desktop } from '../document.js';
import { docToNotes, notesToDoc } from '../logic/notesDoc.js';
import { captionOf, isPictureType, type IncomingPicture } from '../logic/pictures.js';
import { ask } from './Ask.js';
import { ContextMenu, type MenuItem } from './MenuBar.js';
import { PdfCleanupDialog } from './PdfCleanup.js';

interface Props {
  readonly text: string;
  readonly title: string;
  readonly catalog: Catalog;
  readonly readOnly: boolean;
  readonly resolveFile: (path: string) => string | undefined;
  onChange(text: string, files?: ReadonlyMap<string, Uint8Array>): void;
  /** The user left the text: a good moment to give new headings their ids. */
  onSettle?(): void;
  /** Asks for a picture file and its caption; undefined when cancelled. */
  pickImage(): Promise<{ readonly picture: IncomingPicture; readonly caption: string } | undefined>;
  /** Where a picture is stored in the sheet (a path no file has yet, also not one of `taken`). */
  picturePath(picture: IncomingPicture, taken: ReadonlySet<string>): string;
  /** Saves the layer as a theory library (.kalkt); absent where it cannot be done. */
  onSaveLibrary?(): void;
  /**
   * A formula block for the picture at `path`, written by a model that reads images
   * (with a note that the AI wrote it); undefined when it found none or the AI is off.
   */
  readFormula?(path: string): Promise<string | undefined>;
  describeFigure?(path: string, context: string): Promise<string | undefined>;
  /** The text of the pages read again from the PDF (AI); while it runs, how far, and how to stop it. */
  rereadText?(): void;
  readonly rereading?: { readonly done: number; readonly of: number };
  onStopReread?(): void;
  /**
   * Opens the cut-outs from a study PDF; each one comes to `place` with its caption and the
   * text that stood next to it on the page. Absent when there is no study PDF.
   */
  pickPdfCrop?(place: (picture: IncomingPicture, caption: string, anchor: { readonly before?: string; readonly after?: string }) => void): void;
}

/** Attributes the stored notes need beyond the editor's own: the section id, the alignment of a table column. */
const NotesAttributes = Extension.create({
  name: 'notesAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          tid: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-tid'),
            renderHTML: (attrs: Record<string, unknown>) => (attrs['tid'] ? { 'data-tid': attrs['tid'] } : {}),
          },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          align: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.textAlign || null,
            renderHTML: (attrs: Record<string, unknown>) => (attrs['align'] ? { style: `text-align: ${attrs['align']}` } : {}),
          },
        },
      },
    ];
  },
});

const NO_COMMANDS = new Map();

/** Widths offered in the menu of a picture, as shares of the text width. */
const WIDTHS = [25, 50, 75, 100];

/**
 * A picture of the layer with its caption under it, as printed. The caption is
 * changed by a double click, the width by dragging a corner, the alignment and
 * the width also from the menu of the right button.
 */
function PictureView({ node, selected, updateAttributes, extension, editor, getPos }: ReactNodeViewProps) {
  const options = extension.options as { captionLabel?: string; captionEmpty?: string };
  const catalog = useContext(WordCatalog);
  const caption = String(node.attrs['alt'] ?? '');
  // What the figure shows, written for search ({alt="…"} after it): the text of the picture and its tooltip.
  const description = figureDescription(String(node.attrs['extra'] ?? '').replace(/^\{|\}$/g, ''));
  // The cut-out of a formula confirmed below folds away: the formula stands for it. Its block
  // changes without this view, so every change of the text is looked at.
  const [, redraw] = useState(0);
  useEffect(() => {
    const update = () => redraw((n) => n + 1);
    editor.on('update', update);
    return () => void editor.off('update', update);
  }, [editor]);
  const [shown, setShown] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>();
  const [dragged, setDragged] = useState<number | undefined>();
  const extra = String(node.attrs['extra'] ?? '');
  const place = figurePlace(extra.replace(/^\{|\}$/g, ''));
  const shownPlace: FigurePlace = dragged !== undefined ? { ...place, width: dragged } : place;
  const placeAs = (next: FigurePlace) => updateAttributes({ extra: withFigurePlace(extra, next) || null });
  const editCaption = () =>
    void ask(options.captionLabel ?? 'Caption', caption).then((next) => {
      if (next !== undefined) updateAttributes({ alt: next.replace(/[[\]]/g, '').trim() });
    });
  // A corner dragged: the width as a share of the text width; a centred picture grows on both sides.
  const resize = (e: ReactMouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    const figure = (e.currentTarget as HTMLElement).closest('figure');
    const text = figure?.parentElement?.closest('.ProseMirror');
    if (!figure || !text) return;
    const style = getComputedStyle(text);
    // On the screen, as the mouse moves: the text width zoomed as the page is.
    const full = (text.getBoundingClientRect().width * (text.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))) / text.clientWidth;
    const start = figure.getBoundingClientRect().width;
    const x0 = e.clientX;
    const sign = corner.endsWith('w') ? -1 : 1;
    const factor = place.align === 'center' ? 2 : 1;
    let width = Math.round((start / full) * 100);
    const move = (m: MouseEvent) => {
      width = Math.max(5, Math.min(100, Math.round(((start + sign * factor * (m.clientX - x0)) / full) * 100)));
      setDragged(width);
    };
    // Where the button is let go counts too: the moves before it may have come together.
    const up = (m: MouseEvent) => {
      move(m);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDragged(undefined);
      placeAs({ ...place, width });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const menuItems = (): MenuItem[] => {
    const say = (key: UiKey, fallback: string, params?: Record<string, string | number>) => (catalog ? t(catalog, key, params) : fallback);
    const align = place.align ?? 'left';
    const { width: _width, ...unsized } = place;
    const { align: _align, ...unaligned } = place;
    return [
      { kind: 'action', label: say('picture.alignLeft', 'Left'), checked: align === 'left', run: () => placeAs(unaligned) },
      { kind: 'action', label: say('picture.center', 'Centre'), checked: align === 'center', run: () => placeAs({ ...place, align: 'center' }) },
      { kind: 'action', label: say('picture.alignRight', 'Right'), checked: align === 'right', run: () => placeAs({ ...place, align: 'right' }) },
      { kind: 'separator' },
      ...WIDTHS.map((w): MenuItem => ({ kind: 'action', label: say('word.width', `${w} %`, { percent: w }), checked: place.width === w, run: () => placeAs({ ...place, width: w }) })),
      { kind: 'action', label: say('picture.natural', 'Natural size'), checked: place.width === undefined, run: () => placeAs(unsized) },
      { kind: 'separator' },
      { kind: 'action', label: say('picture.caption', 'Caption…'), run: editCaption },
      {
        kind: 'action',
        label: say('picture.delete', 'Delete picture'),
        run: () => {
          const at = getPos();
          if (typeof at === 'number') editor.chain().focus().deleteRange({ from: at, to: at + node.nodeSize }).run();
        },
      },
    ];
  };
  const pos = getPos();
  const next = typeof pos === 'number' ? editor.state.doc.nodeAt(pos + node.nodeSize) : null;
  const folded =
    /\/vzorec-[^/]*$/.test(String(node.attrs['path'] ?? '')) &&
    next?.type.name === 'codeBlock' &&
    next.attrs['language'] === 'kalk' &&
    kalkConfirmed(next.textContent.split('\n'));
  if (folded && !shown) {
    return (
      <NodeViewWrapper as="div" className="word-cutout-folded" contentEditable={false}>
        <button type="button" onClick={() => setShown(true)}>
          ▸ {catalog ? t(catalog, 'kalk.cutout') : ''}
          {caption ? ` · ${caption}` : ''}
        </button>
        <button
          type="button"
          className="cutout-delete"
          title={catalog ? t(catalog, 'kalk.cutoutDeleteTip') : ''}
          onClick={() => {
            const at = getPos();
            if (typeof at === 'number') editor.chain().deleteRange({ from: at, to: at + node.nodeSize }).run();
          }}
        >
          {catalog ? t(catalog, 'kalk.cutoutDelete') : '✕'}
        </button>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper
      as="figure"
      className={`word-figure${selected ? ' selected' : ''}${shownPlace.width !== undefined ? ' sized' : ''}`}
      style={styleOf(figureStyle(shownPlace))}
      onDoubleClick={editCaption}
      onContextMenu={(e: ReactMouseEvent) => {
        e.preventDefault();
        const at = getPos();
        if (typeof at === 'number') editor.commands.setNodeSelection(at);
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <img src={String(node.attrs['src'] ?? '')} alt={description ?? caption} {...(description ? { title: description } : {})} data-path={String(node.attrs['path'] ?? '')} draggable={false} />
      <figcaption className={caption ? '' : 'empty'}>{caption || options.captionEmpty}</figcaption>
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <span key={corner} className={`picture-handle ${corner}`} contentEditable={false} title={catalog ? t(catalog, 'editor.pictureResize') : ''} onMouseDown={(e) => resize(e, corner)} />
      ))}
      {dragged !== undefined && <span className="picture-size">{dragged} %</span>}
      {menu && createPortal(<ContextMenu items={menuItems()} commands={NO_COMMANDS} at={menu} onClose={() => setMenu(undefined)} />, document.body)}
    </NodeViewWrapper>
  );
}

/** A style of the render package (width:60%;margin-left:auto) as React wants it. */
function styleOf(css: string): Record<string, string> | undefined {
  if (!css) return undefined;
  return Object.fromEntries(css.split(';').map((d) => d.split(':')).map(([k, v]) => [k!.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v!]));
}

/** A picture of the layer: where it is stored in the sheet, and what to show while editing. */
const NotesImage = Image.extend<ImageOptions & { captionLabel: string; captionEmpty: string }>({
  addOptions() {
    return { ...this.parent!(), captionLabel: 'Caption', captionEmpty: '' };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      path: { default: null, renderHTML: () => ({}) },
      extra: { default: null, renderHTML: () => ({}) },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(PictureView);
  },
});

/**
 * A block of the calculation language (```kalk): its lines are written as in the
 * sheet and shown under them typeset as formulas; a line the language does not
 * read is marked. Other code blocks stay as written.
 */
/** The words of the user's language for the node views (the check of derivations in ```kalk). */
const WordCatalog = createContext<Catalog | undefined>(undefined);

function CodeView({ node, editor, getPos }: ReactNodeViewProps) {
  const kalk = node.attrs['language'] === 'kalk';
  const catalog = useContext(WordCatalog);
  const lines = node.textContent.split('\n').filter((l) => l.trim() !== '');
  // Confirmed (no note of the AI left): the formula as the book prints it, its text a click away.
  const confirmed = kalk && kalkConfirmed(lines);
  const [editing, setEditing] = useState(false);
  // The cursor in the block: its text shows, whatever it is (a formula being typed is confirmed too).
  const [, redraw] = useState(0);
  useEffect(() => {
    const update = () => redraw((n) => n + 1);
    editor.on('selectionUpdate', update);
    return () => void editor.off('selectionUpdate', update);
  }, [editor]);
  const at = getPos();
  const { from } = editor.state.selection;
  const inside = typeof at === 'number' && from > at && from < at + node.nodeSize;
  const say = (key: UiKey) => (catalog ? t(catalog, key) : '');
  const above = typeof at === 'number' ? editor.state.doc.resolve(at).nodeBefore : null;
  const hasCutout = !!above && isCutout(above);
  /**
   * The note of the AI taken away: the user has checked the formula. The cut-out it was
   * read from goes too (the formula stands for it, the file gets smaller), unless kept.
   */
  const confirm = (keepCutout: boolean) => {
    let pos = getPos();
    if (typeof pos !== 'number') return;
    const text = node.textContent
      .split('\n')
      .filter((l) => !isAiNote(l))
      .join('\n');
    let tr = editor.state.tr.replaceWith(pos + 1, pos + node.nodeSize - 1, editor.schema.text(text));
    const before = tr.doc.resolve(pos).nodeBefore;
    if (!keepCutout && before && isCutout(before)) {
      tr = tr.delete(pos - before.nodeSize, pos);
      pos = pos - before.nodeSize;
    }
    // The cursor goes past the formula: confirmed, it shows as printed at once.
    const after = pos + (tr.doc.nodeAt(pos)?.nodeSize ?? 0);
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(after, tr.doc.content.size))));
    editor.view.dispatch(tr);
    setEditing(false);
  };
  return (
    <NodeViewWrapper className={`word-code${kalk ? ' kalk-block' : ''}${confirmed ? ' confirmed' : ''}${confirmed && !editing && !inside ? ' code-hidden' : ''}`}>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
      {kalk && lines.length > 0 && (
        <div
          className={`kalk-preview${confirmed ? ' confirmed' : ''}`}
          contentEditable={false}
          // A click on the formula as printed puts the cursor into its text.
          onMouseDown={(e) => {
            if (!confirmed || (e.target as HTMLElement).closest('button') || typeof at !== 'number') return;
            e.preventDefault();
            editor.chain().focus().setTextSelection(at + node.nodeSize - 1).run();
          }}
        >
          {kalkLines(lines, catalog).map((l, i) =>
            l.note !== undefined ? (
              <div key={i} className="kalk-note">
                {l.note}
              </div>
            ) : (
              <div key={i} className="kalk-formula" title={l.source}>
                <div dangerouslySetInnerHTML={{ __html: l.html }} />
                {l.number && <span className="kalk-number">({l.number})</span>}
                {l.check && !(confirmed && l.check.ok) && <span className={`kalk-check ${l.check.ok ? 'ok' : 'bad'}`}>{l.check.text}</span>}
              </div>
            ),
          )}
          <div className="kalk-actions">
            {!confirmed && lines.some(isAiNote) && (
              <>
                <button type="button" className="kalk-confirm" title={say('kalk.confirmTip')} onClick={() => confirm(false)}>
                  {say('kalk.confirm')}
                </button>
                {hasCutout && (
                  <button type="button" className="kalk-confirm-keep" title={say('kalk.confirmKeepTip')} onClick={() => confirm(true)}>
                    {say('kalk.confirmKeep')}
                  </button>
                )}
              </>
            )}
            {confirmed && (
              <button type="button" className="kalk-edit" onClick={() => setEditing((v) => !v)}>
                {say(editing ? 'kalk.editDone' : 'kalk.edit')}
              </button>
            )}
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

/** A cut-out of a formula from a study PDF (…/vzorec-s37.png), the picture its formula is read from. */
function isCutout(node: { type: { name: string }; attrs: Record<string, unknown> }): boolean {
  return node.type.name === 'image' && /\/vzorec-[^/]*$/.test(String(node.attrs['path'] ?? ''));
}

/** The index of a letter (σ_Kt in the text of the sources): set below, as in a formula. */
const NotesSubscript = Mark.create({
  name: 'subscript',
  excludes: 'code',
  parseHTML: () => [{ tag: 'sub' }],
  renderHTML: () => ['sub', 0],
});

const NotesCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeView);
  },
});

/** Pictures among pasted or dropped files. */
async function picturesOf(files: FileList | undefined | null): Promise<IncomingPicture[]> {
  const found = [...(files ?? [])].filter((f) => isPictureType(f.type));
  // A copied picture (a screenshot) comes as "image.png": it has no name of its own.
  return Promise.all(found.map(async (f) => ({ name: /^image\.\w+$/.test(f.name) ? '' : f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

/** Pictures get something to show: the file of the sheet behind their path. */
function withPictures(doc: JSONContent, resolveFile: (path: string) => string | undefined): JSONContent {
  if (doc.type === 'image' && typeof doc.attrs?.['path'] === 'string') return { ...doc, attrs: { ...doc.attrs, src: resolveFile(doc.attrs['path']) ?? '' } };
  return doc.content ? { ...doc, content: doc.content.map((c) => withPictures(c, resolveFile)) } : doc;
}

export function NotesWord({ text, title, catalog, readOnly, resolveFile, onChange, onSettle, pickImage, picturePath, onSaveLibrary, pickPdfCrop, readFormula, describeFigure, rereadText, rereading, onStopReread }: Props) {
  // What the editor last gave out: a text coming back unchanged is not loaded again.
  const emitted = useRef(text);
  // Texts given out and not seen back yet. A late echo of an older one (the page was busy while the
  // user typed on) is no change from outside: loading it would drop what was typed since.
  const unechoed = useRef<string[]>([]);
  const pendingFiles = useRef<Map<string, Uint8Array> | undefined>(undefined);
  const [styleMenu, setStyleMenu] = useState(false);
  const [cleanup, setCleanup] = useState(false);
  // The latest onSettle: after a change it must see the new text, not the one of an older render.
  const settle = useRef(onSettle);
  settle.current = onSettle;
  const [, setTick] = useState(0);
  // Set once the editor exists: pictures from paste and drop go in through it.
  const place = useRef<(pictures: readonly IncomingPicture[], at?: number) => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: { HTMLAttributes: { class: 'citation' } },
        strike: false,
        underline: false,
        orderedList: false,
        link: { openOnClick: false, autolink: true, isAllowedUri: (url) => /^https?:\/\//.test(url) },
        codeBlock: false,
      }),
      NotesCodeBlock,
      NotesSubscript,
      NotesImage.configure({ inline: false, allowBase64: true, captionLabel: t(catalog, 'word.caption'), captionEmpty: t(catalog, 'word.captionEmpty') }),
      TableKit.configure({ table: { resizable: false } }),
      NotesAttributes,
    ],
    content: withPictures(notesToDoc(text), resolveFile),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const next = docToNotes(editor.getJSON());
      if (next === emitted.current && !pendingFiles.current) return;
      emitted.current = next;
      unechoed.current.push(next);
      const files = pendingFiles.current;
      pendingFiles.current = undefined;
      onChange(next, files);
    },
    onSelectionUpdate: () => setTick((n) => n + 1),
    editorProps: {
      // A picture pasted (a cut-out of a PDF, a screenshot) lands where the cursor is.
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        if (data && [...data.files].some((f) => isPictureType(f.type))) {
          void picturesOf(data.files).then((pictures) => place.current(pictures));
          return true;
        }
        // Some programs put a picture on the clipboard without a file: the desktop reads it.
        if (desktop && !data?.getData('text/plain') && !data?.getData('text/html')) {
          void desktop.clipboardPictures().then((pictures) => place.current(pictures));
          return true;
        }
        return false;
      },
      // A picture dropped from a file manager lands where it is dropped.
      handleDrop: (view, event, _slice, moved) => {
        if (moved || ![...(event.dataTransfer?.files ?? [])].some((f) => isPictureType(f.type))) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void picturesOf(event.dataTransfer?.files).then((pictures) => place.current(pictures, at));
        return true;
      },
    },
    onBlur: () => onSettle?.(),
  });

  // A change from outside (undo, ids given to headings): the editor shows it.
  useEffect(() => {
    if (!editor) return;
    const echo = unechoed.current.indexOf(text);
    if (echo >= 0) {
      // Our own text back (perhaps several in one): those before it are past too.
      unechoed.current.splice(0, echo + 1);
      return;
    }
    if (text === emitted.current) return;
    unechoed.current = [];
    emitted.current = text;
    editor.commands.setContent(withPictures(notesToDoc(text), resolveFile), { emitUpdate: false });
  }, [editor, text, resolveFile]);
  useEffect(() => editor?.setEditable(!readOnly), [editor, readOnly]);

  /** Stores pictures in the layer and puts them in at the cursor (or at `at`). */
  place.current = (pictures, at) => {
    if (!editor || pictures.length === 0 || readOnly) return;
    const files = new Map(pendingFiles.current ?? []);
    const nodes = pictures.map((p, i) => {
      const path = picturePath(p, new Set(files.keys()));
      files.set(path, p.bytes);
      const caption = 'caption' in p ? String((p as { caption?: string }).caption ?? '') : captionOf(p.name);
      return { type: 'image', attrs: { src: URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.type })), path, alt: i === 0 ? caption : captionOf(p.name) } };
    });
    pendingFiles.current = files;
    // In a paragraph the picture goes where the cursor is. Inside a citation, a list or a table it
    // goes before that block (cursor at its start) or after it: a picture cannot live inside one.
    const $at = editor.state.doc.resolve(at ?? editor.state.selection.from);
    let where = at;
    if ($at.depth > 1) where = editor.state.doc.textBetween($at.start(1), $at.pos) === '' ? $at.before(1) : $at.after(1);
    const chain = editor.chain().focus();
    (where !== undefined ? chain.insertContentAt(where, nodes) : chain.insertContent(nodes)).run();
  };

  if (!editor) return null;

  /**
   * Where a cut-out goes: after the paragraph holding the line above it on its page, else
   * before the one holding the line below it; undefined when neither is found. Compared
   * without spaces and hyphens, so letters spaced out or words split in the PDF still meet.
   */
  const placeOf = (anchor: { readonly before?: string; readonly after?: string }): number | undefined => {
    const plain = (s: string) => s.replace(/[\s\-‐-–]+/g, '').toLowerCase();
    const find = (line: string | undefined, side: 'after' | 'before') => {
      const want = line ? plain(line).slice(0, 60) : '';
      if (want.length < 8) return undefined;
      let found: number | undefined;
      editor.state.doc.forEach((node, offset) => {
        if (found === undefined && plain(node.textContent).includes(want)) found = side === 'after' ? offset + node.nodeSize : offset;
      });
      return found;
    };
    return find(anchor.before, 'after') ?? find(anchor.after, 'before');
  };

  // Formulas being read from cut-outs: how many done of how many.
  const [reading, setReading] = useState<{ done: number; of: number }>();
  // Asked to stop: the formula being read is finished, no further one is begun. Read again, it goes on
  // with the cut-outs that have no formula yet.
  const stopReading = useRef(false);
  /**
   * The selected picture, else every formula cut-out (vzorec-…) without a formula under it,
   * else (cut-outs made by hand) every picture without one; read by the model, each
   * formula block goes right under its picture. A picture with no formula gets none.
   */
  const readFormulas = async () => {
    if (!readFormula) return;
    const selected = editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'image' ? String(editor.state.selection.node.attrs['path'] ?? '') : '';
    const unwritten: string[] = [];
    editor.state.doc.forEach((node, _offset, index) => {
      const path = String(node.attrs['path'] ?? '');
      const next = editor.state.doc.maybeChild(index + 1);
      if (node.type.name === 'image' && path && !(next?.type.name === 'codeBlock' && next.attrs['language'] === 'kalk')) unwritten.push(path);
    });
    const formulas = unwritten.filter((p) => /\/vzorec-[^/]*$/.test(p));
    const paths = selected ? [selected] : formulas.length > 0 ? formulas : unwritten;
    setReading({ done: 0, of: paths.length });
    stopReading.current = false;
    for (const [n, path] of paths.entries()) {
      if (stopReading.current) break;
      const block = await readFormula(path);
      setReading({ done: n + 1, of: paths.length });
      if (block === undefined) continue;
      // Found again: the text may have changed meanwhile.
      let after: number | undefined;
      editor.state.doc.forEach((node, offset) => {
        if (after === undefined && node.type.name === 'image' && node.attrs['path'] === path) after = offset + node.nodeSize;
      });
      if (after !== undefined) editor.chain().insertContentAt(after, { type: 'codeBlock', attrs: { language: 'kalk' }, content: [{ type: 'text', text: block }] }).run();
    }
    setReading(undefined);
  };

  // Figures being described: how many done of how many; asked to stop as the formulas are.
  const [describing, setDescribing] = useState<{ done: number; of: number }>();
  const stopDescribing = useRef(false);
  /**
   * The text of the sources around a figure, its place marked: what the book says before it
   * (up to 2000 characters) and after it (its title "Obr. 25 …" and the explanation, up to 1000).
   */
  const textAround = (path: string): string => {
    const blocks: string[] = [];
    let at = -1;
    editor.state.doc.forEach((node) => {
      if (node.type.name === 'image') {
        if (node.attrs['path'] === path) at = blocks.length;
        blocks.push(node.attrs['alt'] ? `[${String(node.attrs['alt'])}]` : '');
      } else blocks.push(node.textContent);
    });
    if (at < 0) return '';
    const before = blocks.slice(0, at).filter(Boolean).join('\n').slice(-2000);
    const after = blocks.slice(at + 1).filter(Boolean).join('\n').slice(0, 1000);
    return `${before}\n[THE FIGURE${blocks[at] ? ` ${blocks[at]}` : ''}]\n${after}`;
  };
  /**
   * Every figure without a description, cut-outs of formulas left out: the AI reads it with the
   * text around it and writes what it shows ({alt="…"} after the picture), so the theory finds it
   * by its words. Done ones are skipped, so a stopped run goes on where it was; a selected figure
   * is described anew.
   */
  const describeFigures = async () => {
    if (!describeFigure) return;
    const selected = editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'image' ? String(editor.state.selection.node.attrs['path'] ?? '') : '';
    const paths: string[] = selected ? [selected] : [];
    if (!selected) {
      editor.state.doc.forEach((node) => {
        const path = String(node.attrs['path'] ?? '');
        if (node.type.name === 'image' && path && !/\/vzorec-[^/]*$/.test(path) && !/(?:^|\s)alt="/.test(String(node.attrs['extra'] ?? ''))) paths.push(path);
      });
    }
    setDescribing({ done: 0, of: paths.length });
    stopDescribing.current = false;
    for (const [n, path] of paths.entries()) {
      if (stopDescribing.current) break;
      const description = await describeFigure(path, textAround(path));
      setDescribing({ done: n + 1, of: paths.length });
      if (!description) continue;
      // Found again: the text may have changed meanwhile.
      editor.state.doc.forEach((node, offset) => {
        if (node.type.name !== 'image' || node.attrs['path'] !== path) return;
        const rest = String(node.attrs['extra'] ?? '').replace(/^\{|\}$/g, '').replace(/(?:^|\s)alt="[^"]*"/, '').trim();
        const extra = `{${[rest, `alt="${description}"`].filter(Boolean).join(' ')}}`;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(offset, undefined, { ...node.attrs, extra }));
      });
    }
    setDescribing(undefined);
  };

  const insertPicture = async (pick: Props['pickImage'] = pickImage) => {
    // The dialog takes the focus; the picture goes where the cursor was.
    const at = editor.state.selection.from;
    const chosen = await pick();
    if (chosen) place.current([{ ...chosen.picture, caption: chosen.caption } as IncomingPicture], at);
  };

  const setLink = async () => {
    // The question takes the focus; the selection is put back before the link is set.
    const { from, to } = editor.state.selection;
    const current = String(editor.getAttributes('link')['href'] ?? '');
    const href = (await ask(t(catalog, 'word.linkAddress'), current || 'https://'))?.trim();
    if (href === undefined) return;
    const chain = editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link');
    if (!href || href === 'https://') chain.unsetLink().run();
    else if (/^https?:\/\/\S+$/.test(href)) chain.setLink({ href }).run();
  };

  const style = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : editor.isActive('blockquote') ? 'quote' : 'normal';
  const setStyle = (next: string) => {
    const chain = editor.chain().focus();
    if (editor.isActive('blockquote') && next !== 'quote') chain.lift('blockquote');
    if (next === 'normal') chain.setParagraph();
    else if (next === 'quote') chain.setParagraph().setBlockquote();
    else chain.setHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 });
    chain.run();
    setStyleMenu(false);
  };
  const inTable = editor.isActive('table');

  return (
    <div className="notes-word">
      <div className="word-toolbar" role="toolbar" aria-label={title}>
        <span className="word-style">
          <Tool label={t(catalog, `word.style.${style}` as UiKey)} title={t(catalog, 'word.style')} className="word-style-button" disabled={readOnly} onClick={() => setStyleMenu((v) => !v)}>
            {t(catalog, `word.style.${style}` as UiKey)} ▾
          </Tool>
          {styleMenu && (
            <span className="word-style-menu">
              {['normal', 'h1', 'h2', 'h3', 'quote'].map((s) => (
                <Tool key={s} label={t(catalog, `word.style.${s}` as UiKey)} className={`word-style-${s}${s === style ? ' checked' : ''}`} onClick={() => setStyle(s)}>
                  {t(catalog, `word.style.${s}` as UiKey)}
                </Tool>
              ))}
            </span>
          )}
        </span>
        <span className="word-sep" />
        <Tool label={t(catalog, 'word.bold')} keys="Ctrl+B" active={editor.isActive('bold')} disabled={readOnly} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>B</b>
        </Tool>
        <Tool label={t(catalog, 'word.italic')} keys="Ctrl+I" active={editor.isActive('italic')} disabled={readOnly} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </Tool>
        <Tool label={t(catalog, 'word.code')} keys="Ctrl+E" active={editor.isActive('code')} disabled={readOnly} onClick={() => editor.chain().focus().toggleCode().run()}>
          <code>{'{}'}</code>
        </Tool>
        <Tool label={t(catalog, 'word.link')} active={editor.isActive('link')} disabled={readOnly} onClick={() => void setLink()}>
          🔗
        </Tool>
        <span className="word-sep" />
        <Tool label={t(catalog, 'word.bullets')} active={editor.isActive('bulletList')} disabled={readOnly} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          •≡
        </Tool>
        <Tool label={t(catalog, 'word.indent')} keys="Tab" disabled={readOnly || !editor.can().sinkListItem('listItem')} onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>
          →≡
        </Tool>
        <Tool label={t(catalog, 'word.outdent')} keys="Shift+Tab" disabled={readOnly || !editor.can().liftListItem('listItem')} onClick={() => editor.chain().focus().liftListItem('listItem').run()}>
          ←≡
        </Tool>
        <Tool label={t(catalog, 'word.formula')} title={t(catalog, 'word.formulaTip')} className="word-formula" active={editor.isActive('codeBlock', { language: 'kalk' })} disabled={readOnly} onClick={() => editor.chain().focus().toggleCodeBlock({ language: 'kalk' }).run()}>
          ƒx
        </Tool>
        {readFormula && (
          <Tool
            label={reading ? t(catalog, 'word.formulaAiStop') : t(catalog, 'word.formulaAi')}
            title={reading ? t(catalog, 'word.formulaAiStop') : t(catalog, 'word.formulaAiTip')}
            className="word-formula-ai"
            disabled={readOnly}
            onClick={() => (reading ? (stopReading.current = true) : void readFormulas())}
          >
            {reading ? `ƒx ${reading.done}/${reading.of} ■` : 'ƒx ✦'}
          </Tool>
        )}
        {rereadText && (
          <Tool
            label={rereading ? t(catalog, 'word.rereadStop') : t(catalog, 'word.reread')}
            title={rereading ? t(catalog, 'word.rereadStop') : t(catalog, 'word.rereadTip')}
            className="word-reread-ai"
            disabled={readOnly}
            onClick={() => (rereading ? onStopReread?.() : rereadText())}
          >
            {rereading ? `¶ ${rereading.done}/${rereading.of} ■` : '¶ ✦'}
          </Tool>
        )}
        {describeFigure && (
          <Tool
            label={describing ? t(catalog, 'word.describeStop') : t(catalog, 'word.describe')}
            title={describing ? t(catalog, 'word.describeStop') : t(catalog, 'word.describeTip')}
            className="word-describe-ai"
            disabled={readOnly}
            onClick={() => (describing ? (stopDescribing.current = true) : void describeFigures())}
          >
            {describing ? `🖼 ${describing.done}/${describing.of} ■` : '🖼 ✦'}
          </Tool>
        )}
        <Tool label={t(catalog, 'word.codeBlock')} active={editor.isActive('codeBlock')} disabled={readOnly} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          ⌸
        </Tool>
        <span className="word-sep" />
        <Tool label={t(catalog, 'word.table')} disabled={readOnly || inTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          {commandIcon('insert.newTable') ?? '▦'}
        </Tool>
        {inTable && (
          <>
            <Tool label={t(catalog, 'word.rowAfter')} disabled={readOnly} onClick={() => editor.chain().focus().addRowAfter().run()}>
              +≡
            </Tool>
            <Tool label={t(catalog, 'word.columnAfter')} disabled={readOnly} onClick={() => editor.chain().focus().addColumnAfter().run()}>
              +⫴
            </Tool>
            <Tool label={t(catalog, 'word.deleteRow')} disabled={readOnly} onClick={() => editor.chain().focus().deleteRow().run()}>
              −≡
            </Tool>
            <Tool label={t(catalog, 'word.deleteColumn')} disabled={readOnly} onClick={() => editor.chain().focus().deleteColumn().run()}>
              −⫴
            </Tool>
            <Tool label={t(catalog, 'word.deleteTable')} disabled={readOnly} onClick={() => editor.chain().focus().deleteTable().run()}>
              ✕▦
            </Tool>
          </>
        )}
        <Tool label={t(catalog, 'word.rule')} disabled={readOnly} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          ―
        </Tool>
        <Tool label={t(catalog, 'notes.insertImage')} disabled={readOnly} onClick={() => void insertPicture()}>
          {commandIcon('insert.picture') ?? '🖼'}
        </Tool>
        {pickPdfCrop && (
          <Tool label={t(catalog, 'crop.button')} title={t(catalog, 'crop.buttonTip')} className="word-pdf-crop" disabled={readOnly} onClick={() => pickPdfCrop((picture, caption, anchor) => place.current([{ ...picture, caption } as IncomingPicture], placeOf(anchor) ?? editor.state.selection.from))}>
            {t(catalog, 'crop.button')}
          </Tool>
        )}
        <span className="word-sep" />
        <Tool label={t(catalog, 'pdf.button')} title={t(catalog, 'pdf.buttonTip')} className="word-pdf" disabled={readOnly || !text.trim()} onClick={() => setCleanup(true)}>
          {t(catalog, 'pdf.button')}
        </Tool>
        {onSaveLibrary && (
          <Tool label={t(catalog, 'library.button')} title={t(catalog, 'library.buttonTip')} className="word-library" disabled={!text.trim()} onClick={onSaveLibrary}>
            {t(catalog, 'library.button')}
          </Tool>
        )}
        <span className="word-sep" />
        <Tool label={t(catalog, 'word.undo')} keys="Ctrl+Z" disabled={readOnly || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          {commandIcon('edit.undo') ?? '↶'}
        </Tool>
        <Tool label={t(catalog, 'word.redo')} keys="Ctrl+Y" disabled={readOnly || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          {commandIcon('edit.redo') ?? '↷'}
        </Tool>
      </div>
      {text.trim() !== '' && !/^#{1,3}\s/m.test(text) && <p className="word-warning">{t(catalog, 'word.noHeadings')}</p>}
      {cleanup && (
        <PdfCleanupDialog
          catalog={catalog}
          text={text}
          resolveFile={resolveFile}
          onApply={(next) => {
            // One change; once the program has it, the new headings get their section ids.
            onChange(next);
            window.setTimeout(() => settle.current?.(), 0);
          }}
          onClose={() => setCleanup(false)}
        />
      )}
      <div className="word-scroll">
        <div className="word-page page-like">
          <h2 className="notes-title">{title}</h2>
          <WordCatalog.Provider value={catalog}>
            <EditorContent editor={editor as Editor} className="notes word-text" />
          </WordCatalog.Provider>
        </div>
      </div>
    </div>
  );
}

/** A toolbar button that leaves the cursor where it is. */
function Tool({ label, keys, active, disabled, className, onClick, children, title }: { label: string; keys?: string; active?: boolean; disabled?: boolean; className?: string; onClick(): void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      className={`word-tool${active ? ' checked' : ''}${className ? ` ${className}` : ''}`}
      title={title ?? (keys ? `${label} (${keys})` : label)}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // The editor keeps the focus (and the selection) while a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
