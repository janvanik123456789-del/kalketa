/**
 * The conversation with the AI (docs/01-filozofie.md, ch. 9.3), in the side
 * pane. The model sees the active calculation read-only and answers in the
 * user's language; nothing it writes changes the calculation. The answer
 * appears as it is written; Stop ends it.
 */
import { useEffect, useRef, useState } from 'react';
import { AI_OFF, checkCitations, CITED_ID, providerById, type AiSettings, type ChatTurn, type CitableSection } from '@kalketa/ai';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { notesHtml } from '@kalketa/render';
import { desktop } from '../document.js';
import type { AiSheetContext } from '../logic/aiContext.js';
import type { LibraryEntry } from '../theoryLibraries.js';
import { commandIcon } from '../icons.js';

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  /** The AI is switched on for this run; until then the pane offers to switch it on and sends nothing. */
  readonly aiOn: boolean;
  onAiOn(on: boolean): void;
  /** The conversation of the active document. */
  readonly turns: readonly ChatTurn[];
  /** Sections of the sources layers the model may cite. */
  readonly theory: readonly CitableSection[];
  onTurns(turns: readonly ChatTurn[]): void;
  /** What the model sees, taken when a question is sent. */
  context(): { readonly sheet: AiSheetContext; readonly languageGuide: string };
  onOpenSettings(): void;
  /** "New chat": the next question starts another conversation (the others stay in the AI notes). */
  onNew?(): void;
  /** Theory libraries found or used by the calculation. */
  readonly libraries?: readonly LibraryEntry[];
  /** The menu of libraries opens: look into the folders again. */
  onLibraries?(): void;
  onToggleLibrary?(id: string, on: boolean): void;
}

export function ChatPane({ catalog, settings, aiOn, onAiOn, turns, theory, onTurns, context, onOpenSettings, onNew, libraries = [], onLibraries, onToggleLibrary }: ChatPaneProps) {
  const [libraryMenu, setLibraryMenu] = useState(false);
  // The menu of libraries closes like any menu: a click anywhere else, or Esc.
  useEffect(() => {
    if (!libraryMenu) return;
    const outside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.chat-libraries')) setLibraryMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setLibraryMenu(false);
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [libraryMenu]);
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

  /**
   * An answer as HTML, each [T3] replaced by a mark: checked against the theory
   * (the title on hover), or unsupported when the section or the quote is not there.
   */
  const answerHtml = (text: string, sent?: ChatTurn['theory']) => {
    const citations = checkCitations(text, theory);
    let i = 0;
    const html = notesHtml(text).replace(CITED_ID, (whole) => {
      const c = citations[i++];
      if (!c) return whole;
      const section = theory.find((s) => s.id === c.id);
      const tip = c.status === 'ok' ? `${c.id}: ${section?.title ?? ''}` : t(catalog, c.status === 'unknown' ? 'chat.citeUnknown' : 'chat.citeMisquoted', { id: c.id });
      return `<span class="cite ${c.status === 'ok' ? 'ok' : 'bad'}" title="${escapeAttr(tip)}">${c.id}${c.status === 'ok' ? '' : ' ?'}</span>`;
    });
    const bad = citations.filter((c) => c.status !== 'ok').length;
    const summary = citations.length > 0 ? `<p class="cite-summary">${escapeAttr(t(catalog, 'chat.citations', { ok: String(citations.length - bad), bad: String(bad) }))}</p>` : '';
    // Which sections the model had: all, or those the search chose for the question.
    const given = sent
      ? `<p class="cite-summary">${escapeAttr(
          sent.sent.length === sent.total ? t(catalog, 'chat.theoryAll', { total: String(sent.total) }) : t(catalog, 'chat.theorySent', { ids: sent.sent.join(', ') || '–', total: String(sent.total) }),
        )}</p>`
      : '';
    return html + summary + given;
  };

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

  if (!aiOn) {
    return (
      <div className="chat-pane">
        <p className="hint chat-off">{t(catalog, 'chat.offForRun', { name: provider.urlEditable ? t(catalog, 'ai.otherServer') : provider.name, model: settings.model || t(catalog, 'ai.firstModel') })}</p>
        <button type="button" className="chat-ai-on default" onClick={() => onAiOn(true)}>
          {t(catalog, 'chat.turnOn')}
        </button>
      </div>
    );
  }

  const send = async () => {
    const question = draft.trim();
    if (!question || answer) return;
    const asked = [...turns, { role: 'user' as const, text: question, time: new Date().toISOString() }];
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
      // An answer the length limit cut keeps a note saying so; no answer at all is not kept, the user is told why.
      if (result.ok)
        onTurns([
          ...asked,
          { role: 'assistant', text: result.truncated ? `${result.text}\n\n*${t(catalog, 'chat.truncated')}*` : result.text, time: new Date().toISOString(), model: result.model, ...(result.theory ? { theory: result.theory } : {}) },
        ]);
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
    if (answer.text.trim()) onTurns([...turns, { role: 'assistant', text: `${answer.text} …`, time: new Date().toISOString() }]);
    void desktop!.aiChatCancel(answer.id);
  };

  return (
    <div className="chat-pane">
      <div className="chat-head">
        <span className="chat-model" title={settings.model}>
          {provider.urlEditable ? t(catalog, 'ai.otherServer') : provider.name} · {settings.model || t(catalog, 'ai.firstModel')}
        </span>
        {onToggleLibrary && (
          <span className="chat-libraries">
            <button type="button" className="chat-library-button" title={t(catalog, 'chat.librariesTip')} onClick={() => (setLibraryMenu((v) => !v), onLibraries?.())}>
              {t(catalog, 'chat.libraries', { count: String(libraries.filter((l) => l.linked).length) })} ▾
            </button>
            {libraryMenu && (
              <span className="chat-library-menu">
                {libraries.length === 0 && <span className="hint">{t(catalog, 'chat.noLibraries')}</span>}
                {libraries.map((l) => (
                  <label key={l.id} className="chat-library" title={l.found ? '' : t(catalog, 'chat.libraryMissing', { count: String(l.sections) })}>
                    <input type="checkbox" checked={l.linked} disabled={!l.found && !l.linked} onChange={(e) => onToggleLibrary(l.id, e.target.checked)} /> [{l.key}] {l.title}{' '}
                    <span className="hint">{l.found ? t(catalog, `library.folder.${l.folder ?? 'user'}` as UiKey) : t(catalog, 'chat.libraryMissing', { count: String(l.sections) })}</span>
                  </label>
                ))}
              </span>
            )}
          </span>
        )}
        <button type="button" className="chat-ai-off" title={`${t(catalog, 'chat.turnOff')}: ${t(catalog, 'chat.turnOffTip')}`} aria-label={t(catalog, 'chat.turnOff')} onClick={() => onAiOn(false)} disabled={!!answer}>
          {commandIcon('tools.ai') ?? '⏻'}
        </button>
        <button type="button" className="chat-new" onClick={() => ((onNew ?? (() => onTurns([])))(), setError(undefined))} disabled={!!answer || turns.length === 0}>
          {t(catalog, 'chat.new')}
        </button>
      </div>
      <div className="chat-messages" ref={list}>
        {turns.length === 0 && !answer && <p className="hint">{t(catalog, 'chat.empty')}</p>}
        {turns.map((turn, i) =>
          // Answers come in Markdown (bold, lists, headings); the same safe subset as notes, no HTML passes.
          turn.role === 'assistant' ? (
            <div key={i} className="chat-turn assistant" dangerouslySetInnerHTML={{ __html: answerHtml(turn.text, turn.theory) }} />
          ) : (
            <div key={i} className="chat-turn user">
              {turn.text}
            </div>
          ),
        )}
        {answer &&
          (answer.text ? (
            <div className="chat-turn assistant writing" dangerouslySetInnerHTML={{ __html: answerHtml(answer.text) }} />
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
