/**
 * Notes of a sources or AI layer. Sources are written like in a word
 * processor (NotesWord); the layer stores a small Markdown subset. Pictures
 * are stored as cropped images in the layer (layers/<id>/images/), never as
 * whole PDFs.
 *
 * AI notes are written by the AI only: people see them, light grey, and
 * cannot change them.
 */

import { t, type Catalog } from '@kalketa/i18n';
import { NOTES_CSS, notesHtml } from '@kalketa/render';
import type { Layer } from '@kalketa/sheet';
import { chooseFile } from '../document.js';
import { ask } from './Ask.js';
import { NotesWord } from './NotesWord.js';

interface Props {
  readonly layer: Layer;
  readonly title: string;
  readonly catalog: Catalog;
  readonly readOnly: boolean;
  readonly resolveFile: (path: string) => string | undefined;
  onChange(text: string, files?: ReadonlyMap<string, Uint8Array>): void;
  /** The user left the text: a good moment to give new headings their ids. */
  onSettle?(): void;
}

export function NotesView({ layer, title, catalog, readOnly, resolveFile, onChange, onSettle }: Props) {
  const text = layer.text ?? '';

  /** A picture file and its caption, stored in the layer (layers/<id>/images/). */
  const pickImage = async () => {
    const file = await chooseFile('image/*');
    if (!file) return undefined;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{Nd}._-]+/gu, '_') || 'obrazek';
    const path = `layers/${layer.id}/images/${base}.${ext}`;
    const caption = (await ask(t(catalog, 'notes.imageName'), file.name.replace(/\.[^.]+$/, '')))?.trim();
    if (caption === undefined) return undefined;
    return { path, caption: caption.replace(/[[\]]/g, ''), bytes: new Uint8Array(await file.arrayBuffer()), url: URL.createObjectURL(file) };
  };

  if (layer.kind === 'ai') {
    return (
      <div className="notes-view ai">
        <p className="help ai-readonly">✦ {t(catalog, 'notes.aiReadOnly')}</p>
        <div className="notes-preview page-like ai-notes">
          <style>{NOTES_CSS}</style>
          <h2 className="notes-title">{title}</h2>
          {text.trim() ? <div className="notes" dangerouslySetInnerHTML={{ __html: notesHtml(text, { resolveFile }) }} /> : <p className="muted">{t(catalog, 'notes.aiPlaceholder')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="notes-view word">
      <style>{NOTES_CSS}</style>
      <NotesWord text={text} title={title} catalog={catalog} readOnly={readOnly} resolveFile={resolveFile} onChange={onChange} {...(onSettle ? { onSettle } : {})} pickImage={pickImage} />
    </div>
  );
}
