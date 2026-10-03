/**
 * The conversation with the AI (docs/01-filozofie.md, ch. 9.3), in the side
 * pane. The model sees the active calculation read-only and answers in the
 * user's language; nothing it writes changes the calculation. The answer
 * appears as it is written; Stop ends it.
 */
import { useEffect, useRef, useState } from 'react';
import { AI_OFF, providerById, type AiSettings, type ChatTurn } from '@kalketa/ai';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { notesHtml } from '@kalketa/render';
import { desktop } from '../document.js';
import type { AiSheetContext } from '../logic/aiContext.js';

/** Pieces of answers by request, from the one listener the bridge allows. */
const listeners = new Map<string, (piece: { readonly text?: string; readonly thinking?: boolean }) => void>();
let listening = false;

function listen(id: string, listener: (piece: { readonly text?: string; readonly thinking?: boolean }) => void): () => void {
  if (!listening && desktop) {
    desktop.onAiChatEvent((piece) => listeners.get(piece.id)?.(piece));
    listening = true;
  }
  listeners.set(id, listener);
  return () => listeners.delete(id);
}

export interface ChatPaneProps {
  readonly catalog: Catalog;
  readonly settings: AiSettings;
  /** The conversation of the active document. */
  readonly turns: readonly ChatTurn[];
  onTurns(turns: readonly ChatTurn[]): void;
  /** What the model sees, taken when a question is sent. */
  context(): { readonly sheet: AiSheetContext; readonly languageGuide: string };
  onOpenSettings(): void;
}

export function ChatPane({ catalog, settings, turns, onTurns, context, onOpenSettings }: ChatPaneProps) {
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState<{ id: string; text: string; thinking: boolean; started: number }>();
  // Seconds since the question, so a model thinking for a minute does not look stuck.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!answer || answer.text) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [answer?.id, answer?.text === '']);
  const [error, setError] = useState<string>();
  const list = useRef<HTMLDivElement>(null);
  const provider = providerById(settings.provider);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, answer?.text, error]);

  if (!desktop) return <div className="chat-pane"><p className="hint">{t(catalog, 'ai.desktopOnly')}</p></div>;
  if (settings.provider === AI_OFF || !provider) {
    return (
      <div className="chat-pane">
        <p className="hint">{t(catalog, 'chat.off')}</p>
        <button type="button" className="chat-settings" onClick={onOpenSettings}>
          {t(catalog, 'chat.openSettings')}
        </button>
      </div>
    );
  }

  const send = async () => {
    const question = draft.trim();
    if (!question || answer) return;
    const asked = [...turns, { role: 'user' as const, text: question }];
    onTurns(asked);
    setDraft('');
    setError(undefined);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setAnswer({ id, text: '', thinking: false, started: Date.now() });
    const stop = listen(id, (piece) => setAnswer((a) => (a && a.id === id ? { ...a, text: a.text + (piece.text ?? ''), thinking: a.thinking || !!piece.thinking } : a)));
    try {
      const { sheet, languageGuide } = context();
      const result = await desktop!.aiChat({
        id,
        provider: provider.id,
        model: settings.model,
        ...(settings.url ? { url: settings.url } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        language: catalog.locale,
        sheet,
        languageGuide,
        turns: asked,
      });
      if (result.ok) onTurns([...asked, { role: 'assistant', text: result.text }]);
      else if (result.problem !== 'cancelled') setError(t(catalog, `ai.problem.${result.problem}` as UiKey, { detail: result.detail ?? '', name: provider.urlEditable ? t(catalog, 'ai.otherServer') : provider.name }));
    } catch (e) {
      setError(t(catalog, 'ai.problem.provider', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      stop();
      setAnswer(undefined);
    }
  };

  const cancel = () => {
    if (!answer) return;
    // What was written so far stays in the conversation.
    if (answer.text.trim()) onTurns([...turns, { role: 'assistant', text: `${answer.text} …` }]);
    void desktop!.aiChatCancel(answer.id);
  };

  return (
    <div className="chat-pane">
      <div className="chat-head">
        <span className="chat-model" title={settings.model}>
          {provider.urlEditable ? t(catalog, 'ai.otherServer') : provider.name} · {settings.model || t(catalog, 'ai.firstModel')}
        </span>
        <button type="button" className="chat-new" onClick={() => (onTurns([]), setError(undefined))} disabled={!!answer || turns.length === 0}>
          {t(catalog, 'chat.new')}
        </button>
      </div>
      <div className="chat-messages" ref={list}>
        {turns.length === 0 && !answer && <p className="hint">{t(catalog, 'chat.empty')}</p>}
        {turns.map((turn, i) =>
          // Answers come in Markdown (bold, lists, headings); the same safe subset as notes, no HTML passes.
          turn.role === 'assistant' ? (
            <div key={i} className="chat-turn assistant" dangerouslySetInnerHTML={{ __html: notesHtml(turn.text) }} />
          ) : (
            <div key={i} className="chat-turn user">
              {turn.text}
            </div>
          ),
        )}
        {answer &&
          (answer.text ? (
            <div className="chat-turn assistant writing" dangerouslySetInnerHTML={{ __html: notesHtml(answer.text) }} />
          ) : (
            <div className="chat-turn assistant writing">
              {t(catalog, answer.thinking ? 'chat.thinking' : 'chat.waiting', { seconds: String(Math.floor((Date.now() - answer.started) / 1000)) })}
            </div>
          ))}
        {error && <div className="chat-error">{error}</div>}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={3}
          value={draft}
          placeholder={t(catalog, 'chat.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {answer ? (
          <button type="button" className="chat-stop" onClick={cancel}>
            {t(catalog, 'chat.stop')}
          </button>
        ) : (
          <button type="button" className="chat-send default" onClick={() => void send()} disabled={!draft.trim()}>
            {t(catalog, 'chat.send')}
          </button>
        )}
      </div>
      <p className="hint chat-note">{t(catalog, 'chat.note')}</p>
    </div>
  );
}
