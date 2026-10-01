/**
 * Notes of a sources or AI layer: text in a small Markdown subset on the
 * left, the printed look on the right. Pictures are stored as cropped images
 * in the layer (layers/<id>/images/), never as whole PDFs.
 *
 * AI notes are written by the AI only: people see them, light grey, and
 * cannot change them.
 */

import { useRef } from 'react';
import { t, type Catalog } from '@kalketa/i18n';
import { NOTES_CSS, notesHtml } from '@kalketa/render';
import type { Layer } from '@kalketa/sheet';
import { chooseFile } from '../document.js';
import { ask } from './Ask.js';

interface Props {
  readonly layer: Layer;
  readonly title: string;
  readonly catalog: Catalog;
  readonly readOnly: boolean;
  readonly resolveFile: (path: string) => string | undefined;
  onChange(text: string, files?: ReadonlyMap<string, Uint8Array>): void;
}

export function NotesView({ layer, title, catalog, readOnly, resolveFile, onChange }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const text = layer.text ?? '';

  /** Inserts a block of its own at the cursor (blank lines around it). */
  const insertBlock = (block: string, files?: ReadonlyMap<string, Uint8Array>) => {
    const element = area.current;
    const at = element ? element.selectionEnd : text.length;
    const before = text.slice(0, at).replace(/\n*$/, '');
    const after = text.slice(at).replace(/^\n*/, '');
    const head = before ? `${before}\n\n` : '';
    const next = `${head}${block}\n\n${after}`.replace(/\n+$/, '\n');
    onChange(next, files);
    const cursor = head.length + block.length;
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(cursor, cursor);
    });
  };

  const insertImage = async () => {
    const file = await chooseFile('image/*');
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{Nd}._-]+/gu, '_') || 'obrazek';
    const path = `layers/${layer.id}/images/${base}.${ext}`;
    const caption = (await ask(t(catalog, 'notes.imageName'), file.name.replace(/\.[^.]+$/, '')))?.trim();
    if (caption === undefined) return;
    insertBlock(`![${caption.replace(/[[\]]/g, '')}](${path})`, new Map([[path, new Uint8Array(await file.arrayBuffer())]]));
  };

  const preview = (
    <div className={`notes-preview page-like${layer.kind === 'ai' ? ' ai-notes' : ''}`}>
      <style>{NOTES_CSS}</style>
      <h2 className="notes-title">{title}</h2>
      {text.trim() ? (
        <div className="notes" dangerouslySetInnerHTML={{ __html: notesHtml(text, { resolveFile }) }} />
      ) : (
        <p className="muted">{t(catalog, layer.kind === 'ai' ? 'notes.aiPlaceholder' : 'notes.empty')}</p>
      )}
    </div>
  );

  if (layer.kind === 'ai') {
    return (
      <div className="notes-view ai">
        <p className="help ai-readonly">✦ {t(catalog, 'notes.aiReadOnly')}</p>
        {preview}
      </div>
    );
  }

  return (
    <div className="notes-view">
      <div className="notes-editor">
        <div className="notes-toolbar">
          <strong>{title}</strong>
          <span className="grow" />
          <button type="button" className="secondary" disabled={readOnly} onClick={() => void insertImage()}>
            {t(catalog, 'notes.insertImage')}
          </button>
          <button type="button" className="secondary" disabled={readOnly} onClick={() => insertBlock(t(catalog, 'notes.citationTemplate'))}>
            {t(catalog, 'notes.insertCitation')}
          </button>
        </div>
        <textarea
          ref={area}
          className="notes-text"
          value={text}
          readOnly={readOnly}
          spellCheck
          placeholder={t(catalog, 'notes.help')}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="help">{t(catalog, 'notes.help')}</p>
      </div>
      {preview}
    </div>
  );
}
