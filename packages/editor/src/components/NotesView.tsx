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
import { useState } from 'react';
import type { Conversation, Layer } from '@kalketa/sheet';
import type { SourceGroup } from '../logic/aiSources.js';
import { chooseFile } from '../document.js';
import { ask } from './Ask.js';
import { NotesWord } from './NotesWord.js';
import { ProposalCard, type ProposalView } from './ProposalCard.js';
import { captionOf, picturePath, type IncomingPicture } from '../logic/pictures.js';

interface Props {
  readonly layer: Layer;
  readonly title: string;
  readonly catalog: Catalog;
  readonly readOnly: boolean;
  readonly resolveFile: (path: string) => string | undefined;
  /** A file of the sheet already has this path. */
  readonly fileExists?: (path: string) => boolean;
  onChange(text: string, files?: ReadonlyMap<string, Uint8Array>): void;
  /** The user left the text: a good moment to give new headings their ids. */
  onSettle?(): void;
  /** Saves the layer as a theory library (.kalkt). */
  onSaveLibrary?(): void;
  /** A cut-out from a study PDF, for the sources. */
  pickPdfCrop?(place: (picture: IncomingPicture, caption: string, anchor: { readonly before?: string; readonly after?: string }) => void): void;
  /** A formula block for a picture of the layer, read by a model. */
  readFormula?(path: string): Promise<string | undefined>;
  /** AI notes: where the AI drew from, by source (the main part of the layer). */
  readonly sources?: readonly SourceGroup[];
  /** AI notes: the sheet's memory for the model. */
  readonly memory?: string;
  onForgetMemory?(): void;
  /** AI notes: the journal of changes the model proposed, oldest first. */
  readonly changes?: readonly ProposalView[];
  onDecide?(id: string, accept: boolean): void;
  onReview?(id: string): void;
  /** AI notes: the conversations kept with them, oldest first; shown on request. */
  readonly conversations?: readonly Conversation[];
  /** Takes a conversation up again in the chat. */
  onContinueConversation?(id: string): void;
  onDeleteConversation?(id: string): void;
}

export function NotesView({ layer, title, catalog, readOnly, resolveFile, fileExists, onChange, onSettle, onSaveLibrary, pickPdfCrop, readFormula, sources = [], memory = '', onForgetMemory, changes = [], onDecide, onReview, conversations = [], onContinueConversation, onDeleteConversation }: Props) {
  const [showConversations, setShowConversations] = useState(false);
  const text = layer.text ?? '';

  /** A picture file and its caption. */
  const pickImage = async () => {
    const file = await chooseFile('image/*');
    if (!file) return undefined;
    const caption = (await ask(t(catalog, 'notes.imageName'), captionOf(file.name)))?.trim();
    if (caption === undefined) return undefined;
    return { picture: { name: file.name, type: file.type || 'image/png', bytes: new Uint8Array(await file.arrayBuffer()) }, caption: caption.replace(/[[\]]/g, '') };
  };
  /** Pictures of the layer live in layers/<id>/images/, under a name no file of the sheet has. */
  const pathFor = (picture: IncomingPicture, taken: ReadonlySet<string>) =>
    picturePath(`layers/${layer.id}/images`, picture.name || 'obrazek', picture.type, (p) => taken.has(p) || text.includes(`(${p})`) || !!fileExists?.(p));

  if (layer.kind === 'ai') {
    return (
      <div className="notes-view ai">
        <p className="help ai-readonly">✦ {t(catalog, 'notes.aiReadOnly')}</p>
        <div className="notes-preview page-like ai-notes">
          <style>{NOTES_CSS}</style>
          <h2 className="notes-title">{title}</h2>
          {text.trim() && <div className="notes" dangerouslySetInnerHTML={{ __html: notesHtml(text, { resolveFile, catalog }) }} />}
          <SourcesView sources={sources} catalog={catalog} />
          {changes.length > 0 && (
            <section className="ai-changes">
              <h3>{t(catalog, 'ai.changes')}</h3>
              {[...changes].reverse().map((view, i) => (
                <ProposalCard key={view.entry.id} view={view} n={changes.length - i} catalog={catalog} onDecide={(id, accept) => onDecide?.(id, accept)} {...(onReview ? { onReview } : {})} />
              ))}
            </section>
          )}
          <section className="ai-memory">
            <h3>{t(catalog, 'ai.memory')}</h3>
            {memory.trim() ? <pre className="ai-memory-text">{memory.trim()}</pre> : <p className="muted">{t(catalog, 'ai.memoryEmpty')}</p>}
            <p className="hint">{t(catalog, 'ai.memoryHint')}</p>
            {memory.trim() && onForgetMemory && (
              <button type="button" className="ai-memory-forget secondary" onClick={onForgetMemory}>
                {t(catalog, 'ai.memoryForget')}
              </button>
            )}
          </section>
          {conversations.length > 0 && (
            <section className="ai-conversations">
              <button type="button" className="conv-toggle secondary" onClick={() => setShowConversations((v) => !v)}>
                {showConversations ? t(catalog, 'conv.hide') : t(catalog, 'conv.show', { count: String(conversations.length) })}
              </button>
              {showConversations &&
                [...conversations].reverse().map((c, i) => (
                  <ConversationView key={c.id} conversation={c} catalog={catalog} open={i === 0} onContinue={onContinueConversation} onDelete={onDeleteConversation} />
                ))}
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="notes-view word">
      <style>{NOTES_CSS}</style>
      <NotesWord text={text} title={title} catalog={catalog} readOnly={readOnly} resolveFile={resolveFile} onChange={onChange} {...(onSettle ? { onSettle } : {})} pickImage={pickImage} picturePath={pathFor} {...(onSaveLibrary ? { onSaveLibrary } : {})} {...(pickPdfCrop ? { pickPdfCrop } : {})} {...(readFormula ? { readFormula } : {})} />
    </div>
  );
}

/** One conversation with the AI, read only: the questions, the answers, who answered and when. */
function ConversationView({ conversation, catalog, open, onContinue, onDelete }: { conversation: Conversation; catalog: Catalog; open: boolean; onContinue?: ((id: string) => void) | undefined; onDelete?: ((id: string) => void) | undefined }) {
  const when = (iso: string | undefined) => {
    const date = iso ? new Date(iso) : undefined;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: 'short', timeStyle: 'short' }).format(date) : '';
  };
  const first = conversation.turns.find((t) => t.role === 'user')?.text ?? '';
  return (
    <details className="ai-conversation" open={open}>
      <summary>
        <span className="conv-when">{when(conversation.started)}</span>
        {conversation.model && <span className="conv-model"> · {conversation.model}</span>}
        <span className="conv-first"> · {first.length > 80 ? `${first.slice(0, 80)}…` : first}</span>
      </summary>
      {conversation.turns.map((turn, i) =>
        turn.role === 'user' ? (
          <div key={i} className="conv-turn user">
            <strong>{t(catalog, 'conv.you')}:</strong> {turn.text}
          </div>
        ) : (
          <div key={i} className="conv-turn assistant">
            <div className="conv-who">
              {t(catalog, 'conv.ai')}
              {turn.model ? ` (${turn.model})` : ''}
              {turn.time ? ` · ${when(turn.time)}` : ''}
            </div>
            <div className="notes" dangerouslySetInnerHTML={{ __html: notesHtml(turn.text) }} />
          </div>
        ),
      )}
      <div className="conv-actions">
        {onContinue && (
          <button type="button" className="conv-continue" onClick={() => onContinue(conversation.id)}>
            {t(catalog, 'conv.continue')}
          </button>
        )}
        {onDelete && (
          <button type="button" className="conv-delete secondary" onClick={() => onDelete(conversation.id)}>
            {t(catalog, 'conv.delete')}
          </button>
        )}
      </div>
    </details>
  );
}

/** Where the AI drew from: the sheet's sources, each library, and what it cited but no source has. */
function SourcesView({ sources, catalog }: { sources: readonly SourceGroup[]; catalog: Catalog }) {
  const when = (iso: string | undefined) => {
    const date = iso ? new Date(iso) : undefined;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: 'short', timeStyle: 'short' }).format(date) : '';
  };
  return (
    <section className="ai-sources">
      <h3>{t(catalog, 'ai.sources')}</h3>
      {sources.length === 0 && <p className="muted">{t(catalog, 'ai.sourcesEmpty')}</p>}
      {sources.map((group, g) => (
        <div key={g} className={`ai-source ${group.kind}`}>
          <h4>
            {group.kind === 'sheet'
              ? t(catalog, 'ai.sourceSheet')
              : group.kind === 'library'
                ? t(catalog, 'ai.sourceLibrary', { key: group.key ?? '', title: group.title })
                : t(catalog, 'ai.sourceUnknown')}
          </h4>
          {group.source && <p className="ai-source-from">{t(catalog, 'ai.sourceFrom', { source: group.source })}</p>}
          <ul>
            {group.sections.map((s) => (
              <li key={s.id}>
                <span className={`cite ${s.unsupported > 0 && s.checked === 0 ? 'bad' : 'ok'}`}>{s.id}</span> {s.title}{' '}
                <span className="ai-source-counts">
                  {[s.checked ? t(catalog, 'ai.citedChecked', { count: String(s.checked) }) : '', s.unsupported ? t(catalog, 'ai.citedUnsupported', { count: String(s.unsupported) }) : '', when(s.last)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
