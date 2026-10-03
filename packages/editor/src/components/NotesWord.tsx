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
import { EditorContent, Extension, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { commandIcon } from '../icons.js';
import { docToNotes, notesToDoc } from '../logic/notesDoc.js';
import { ask } from './Ask.js';

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
  pickImage(): Promise<{ readonly path: string; readonly caption: string; readonly bytes: Uint8Array; readonly url: string } | undefined>;
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

/** A picture of the layer: where it is stored in the sheet, and what to show while editing. */
const NotesImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: { default: null, renderHTML: () => ({}) },
      extra: { default: null, renderHTML: () => ({}) },
    };
  },
});

/** Pictures get something to show: the file of the sheet behind their path. */
function withPictures(doc: JSONContent, resolveFile: (path: string) => string | undefined): JSONContent {
  if (doc.type === 'image' && typeof doc.attrs?.['path'] === 'string') return { ...doc, attrs: { ...doc.attrs, src: resolveFile(doc.attrs['path']) ?? '' } };
  return doc.content ? { ...doc, content: doc.content.map((c) => withPictures(c, resolveFile)) } : doc;
}

export function NotesWord({ text, title, catalog, readOnly, resolveFile, onChange, onSettle, pickImage }: Props) {
  // What the editor last gave out: a text coming back unchanged is not loaded again.
  const emitted = useRef(text);
  const pendingFiles = useRef<Map<string, Uint8Array> | undefined>(undefined);
  const [styleMenu, setStyleMenu] = useState(false);
  const [, setTick] = useState(0);

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
      NotesImage.configure({ inline: false, allowBase64: true }),
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
    onBlur: () => onSettle?.(),
  });

  // A change from outside (undo, ids given to headings): the editor shows it.
  useEffect(() => {
    if (!editor || text === emitted.current) return;
    emitted.current = text;
    editor.commands.setContent(withPictures(notesToDoc(text), resolveFile), { emitUpdate: false });
  }, [editor, text, resolveFile]);
  useEffect(() => editor?.setEditable(!readOnly), [editor, readOnly]);

  if (!editor) return null;

  const insertPicture = async () => {
    const picture = await pickImage();
    if (!picture) return;
    pendingFiles.current = new Map([[picture.path, picture.bytes]]);
    editor.chain().focus().insertContent({ type: 'image', attrs: { src: picture.url, path: picture.path, alt: picture.caption } }).run();
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
        <span className="word-sep" />
        <Tool label={t(catalog, 'word.undo')} keys="Ctrl+Z" disabled={readOnly || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          {commandIcon('edit.undo') ?? '↶'}
        </Tool>
        <Tool label={t(catalog, 'word.redo')} keys="Ctrl+Y" disabled={readOnly || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          {commandIcon('edit.redo') ?? '↷'}
        </Tool>
      </div>
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
