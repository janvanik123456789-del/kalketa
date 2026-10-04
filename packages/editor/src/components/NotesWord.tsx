/**
 * Notes of a sources layer edited like in a word processor: the text is
 * written straight into the formatted page, the toolbar sets the style of a
 * paragraph (normal, heading 1–3, citation), bold, italic, code, lists,
 * tables, lines, pictures and links. Underneath, the layer keeps its small
 * Markdown subset (logic/notesDoc.ts), so print, the AI and the file format
 * stay as they were. A heading carries the id of its theory section as an
 * attribute, shown as a badge and never typed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, Extension, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type JSONContent, type ReactNodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { commandIcon } from '../icons.js';
import { desktop } from '../document.js';
import { docToNotes, notesToDoc } from '../logic/notesDoc.js';
import { captionOf, isPictureType, type IncomingPicture } from '../logic/pictures.js';
import { ask } from './Ask.js';
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

/**
 * A picture of the layer with its caption under it, as printed. The caption is
 * changed by a double click.
 */
function PictureView({ node, selected, updateAttributes, extension }: ReactNodeViewProps) {
  const options = extension.options as { captionLabel?: string; captionEmpty?: string };
  const caption = String(node.attrs['alt'] ?? '');
  return (
    <NodeViewWrapper
      as="figure"
      className={`word-figure${selected ? ' selected' : ''}`}
      onDoubleClick={() =>
        void ask(options.captionLabel ?? 'Caption', caption).then((next) => {
          if (next !== undefined) updateAttributes({ alt: next.replace(/[[\]]/g, '').trim() });
        })
      }
    >
      <img src={String(node.attrs['src'] ?? '')} alt={caption} draggable={false} />
      <figcaption className={caption ? '' : 'empty'}>{caption || options.captionEmpty}</figcaption>
    </NodeViewWrapper>
  );
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

export function NotesWord({ text, title, catalog, readOnly, resolveFile, onChange, onSettle, pickImage, picturePath, onSaveLibrary, pickPdfCrop }: Props) {
  // What the editor last gave out: a text coming back unchanged is not loaded again.
  const emitted = useRef(text);
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
      }),
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
    if (!editor || text === emitted.current) return;
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
          <EditorContent editor={editor as Editor} className="notes word-text" />
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
