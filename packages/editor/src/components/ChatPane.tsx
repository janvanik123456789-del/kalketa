/**
 * The conversation with the AI (docs/01-filozofie.md, ch. 9.3), in the side
 * pane. The model sees the active calculation read-only and answers in the
 * user's language; nothing it writes changes the calculation. The answer
 * appears as it is written; Stop ends it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AI_OFF, checkCitations, checksNeedAnswer, CITED_ID, parseChoices, parseNotes, parsePythonChecks, providerById, pythonReport, sheetNeedsAnswer, sheetReport, withoutAnswerBlocks, withoutProposals, type AiSettings, type ChatTurn, type CheckReport, type SheetCheck, type ChoiceBlock, type CitableSection, type NoteBlock, MAX_LOOKUPS, parseLookups, withoutLookups, type LookupRequest } from '@kalketa/ai';
import { formatNumber, t, type Catalog, type UiKey } from '@kalketa/i18n';
import { sheetCheckWords } from '../logic/sheetCheckWords.js';
import { pythonCheckWords } from '../logic/pythonCheckWords.js';
import { notesHtml } from '@kalketa/render';
import { desktop } from '../document.js';
import type { AiSheetContext } from '../logic/aiContext.js';
import type { LibraryEntry } from '../theoryLibraries.js';
import { EffectLines, NewSheetCard, ProposalCard, type NewSheetView, type ProposalView } from './ProposalCard.js';
import type { ProposalEffect } from '../logic/proposalEffect.js';
import { commandIcon } from '../icons.js';

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Of the model's thinking, the end this long is kept on screen; it is never saved. */
const MAX_THOUGHT = 6000;

/** Pieces of answers by request, from the one listener the bridge allows. */
/** How often an answer being written is drawn again: often enough to read along, rarely enough to stay light. */
const SHOW_EVERY_MS = 120;

const listeners = new Map<string, (piece: { readonly text?: string; readonly thinking?: string; readonly cut?: boolean; readonly phase?: 'context' | 'summing' | 'reading'; readonly tokens?: number }) => void>();
let listening = false;

function listen(id: string, listener: (piece: { readonly text?: string; readonly thinking?: string; readonly cut?: boolean; readonly phase?: 'context' | 'summing' | 'reading'; readonly tokens?: number }) => void): () => void {
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
  context(): { readonly sheet: AiSheetContext; readonly languageGuide: string; readonly memory?: string; readonly catalog?: string };
  /** The answer to what the model asked to look up (formulas, samples); without it, the model is offered no catalog. */
  lookup?(asked: readonly LookupRequest[]): { text: string; found: number };
  onOpenSettings(): void;
  /** "New chat": the next question starts another conversation (the others stay in the AI notes). */
  onNew?(): void;
  /** Theory libraries found or used by the calculation. */
  readonly libraries?: readonly LibraryEntry[];
  /** The menu of libraries opens: look into the folders again. */
  onLibraries?(): void;
  onToggleLibrary?(id: string, on: boolean): void;
  /** The changes proposed in the answer at this turn of the conversation. */
  proposals?(turn: number): readonly ProposalView[];
  /** The user accepts or rejects a proposed change. */
  onDecide?(id: string, accept: boolean): void;
  /** The conversation window kept with the conversation (older turns summed up). */
  readonly contextWindow?: { readonly upTo: number; readonly summary: string; readonly time?: string };
  /** A new summary made at a jump of the window: kept with the conversation. */
  onWindow?(window: { readonly upTo: number; readonly summary: string; readonly time?: string }): void;
  /** Puts the lines of an open proposal after another line of the sheet. */
  onMoveProposal?(id: string, after: number): void;
  /** The user reviewed the lines of an accepted change. */
  onReview?(id: string): void;
  /** The open proposals of the answer at this turn, whether they go together, and what they do together. */
  answerProposals?(turn: number): AnswerProposals | undefined;
  /** Accepts these proposals together, as one step. */
  onAcceptAll?(ids: readonly string[]): void;
  /** Applies these proposals to a copy of the sheet in a new tab. */
  onNewSheet?(ids: readonly string[]): void;
  /** The whole new calculations the answer at this turn wrote. */
  newSheets?(turn: number): readonly NewSheetView[];
  /** Opens a new calculation the model wrote as a new sheet. */
  onOpenSheet?(id: string): void;
  /**
   * Runs a check in Python of an answer (a ```python block) and sets its results beside the sheet,
   * with the changes the answer proposes applied; without it, answers are not checked.
   */
  runCheck?(code: string, answer: string): Promise<CheckReport>;
  /** The sheet an answer proposes, evaluated: what its changes break, or undefined when it proposes none. */
  checkSheet?(answer: string): SheetCheck | undefined;
  /** Keeps a check of an answer in the sources, to be run again later. */
  onCheckToSources?(code: string): void;
  /** The user picked an answer of a choice block: a known question (detail) is kept in the calculation. */
  onChoice?(choice: ChoiceBlock, value: string): void;
  /** Puts a note the model proposed into its layer; whether it is there already. */
  onKeepNote?(note: NoteBlock): void;
  noteKept?(note: NoteBlock): boolean;
  /** The conversation is held by an AI from outside (MCP), named so: shown with its proposals, written to there, not here. */
  readonly external?: string;
  /** The conversation makes a new calculation from its intent (questions, outline, then the sheet). */
  readonly intent?: boolean;
}

/** How many times in a row the model gets the results of its checks back when they disagree. */
const MAX_CHECK_ROUNDS = 2;

/** The open proposals of one answer, for accepting them together or in a new sheet. */
export interface AnswerProposals {
  readonly ids: readonly string[];
  /** They do not overlap and can be applied together. */
  readonly together: boolean;
  /** What they do together (with two or more). */
  readonly effect?: ProposalEffect;
}

export function ChatPane({ catalog, settings, aiOn, onAiOn, intent, turns, theory, onTurns, context, onOpenSettings, onNew, libraries = [], onLibraries, onToggleLibrary, proposals, onDecide, onMoveProposal, lookup, contextWindow, onWindow, onReview, answerProposals, onAcceptAll, onNewSheet, newSheets, onOpenSheet, runCheck, checkSheet, onCheckToSources, onChoice, onKeepNote, noteKept, external }: ChatPaneProps) {
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
  // `thought`: the model's thinking so far (its end), shown folded while the answer has not begun.
  // `cut`: the model thought past the limit of the settings; asked again without thinking.
  const [answer, setAnswer] = useState<{ id: string; text: string; thinking: boolean; thought: string; started: number; cut?: boolean; phase?: 'context' | 'summing' | 'reading'; tokens?: number; last?: number }>();
  const thoughtBox = useRef<HTMLDivElement>(null);
  // The latest thinking stays in view while it grows.
  useEffect(() => {
    const box = thoughtBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [answer?.thought]);
  const [error, setError] = useState<string>();
  // How full the conversation window was at the last question: shown as a bar in the head of the pane.
  const [usage, setUsage] = useState<{ readonly sent: number; readonly context: number; readonly summedUp: number }>();
  // The checks in Python of the last answer are running.
  const [checking, setChecking] = useState(false);
  // Seconds since the question and since the last piece, so a model working for minutes does not look stuck.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!answer && !checking) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [answer?.id, checking]);
  const list = useRef<HTMLDivElement>(null);
  const provider = providerById(settings.provider);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, answer?.text, error]);

  /**
   * An answer as HTML, each [T3] replaced by a mark: checked against the theory
   * (the title on hover), or unsupported when the section or the quote is not there.
   */
  const answerHtml = (full: string, sent?: ChatTurn['theory']) => {
    // A proposed change is shown as a card under the answer, not as its block of lines.
    const text = withoutAnswerBlocks(
      withoutProposals(
        // What the model asks to look up shows as the folded message of the program under the answer.
        withoutLookups(full),
        (n) => `*(${t(catalog, 'proposal.below', { n: String(n) })})*`,
        () => `*(${t(catalog, 'newSheet.below')})*`,
      ),
      () => `*(${t(catalog, 'choice.below')})*`,
      () => `*(${t(catalog, 'note.below')})*`,
    );
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

  // The finished turns drawn once and kept while an answer is being written (see `history` below).
  const historyCache = useRef<{ deps: readonly unknown[]; node: ReactNode }>(undefined);

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

  if (!aiOn && !external) {
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
    if (!question || answer || checking) return;
    const asked = [...turns, { role: 'user' as const, text: question, time: new Date().toISOString() }];
    onTurns(asked);
    setDraft('');
    setError(undefined);
    await askModel(asked, 0);
  };

  /**
   * The checks in Python of an answer (```python blocks), run at once by the program: their results
   * beside the sheet go into the conversation as a turn of the program. When one disagrees or fails,
   * the model gets them and answers again, at most MAX_CHECK_ROUNDS times in a row.
   */
  const checkAnswer = async (answered: readonly ChatTurn[], round: number) => {
    const last = answered[answered.length - 1];
    if (last?.role !== 'assistant') return;
    // The sheet with the changes first: what they break goes back to the model with the checks in Python.
    // What the model asked to look up goes back first; it then goes on with what it read.
    const asked = lookup ? parseLookups(last.text).slice(0, MAX_LOOKUPS) : [];
    if (asked.length > 0) {
      const looked = lookup!(asked);
      const answer: ChatTurn = { role: 'user', text: looked.text, time: new Date().toISOString(), lookup: true };
      const next = [...answered, answer];
      onTurns(next);
      if (round < MAX_CHECK_ROUNDS + 1) await askModel(next, round + 1);
      return;
    }
    const sheet = checkSheet?.(last.text);
    const sheetWrong = sheetNeedsAnswer(sheet);
    const codes = runCheck ? parsePythonChecks(last.text) : [];
    if (codes.length === 0 && !sheetWrong) return;
    setChecking(true);
    const reports: CheckReport[] = [];
    try {
      for (const code of codes) reports.push(await runCheck!(code, last.text));
    } finally {
      setChecking(false);
    }
    const words = pythonCheckWords(catalog);
    const sheetWords = sheetCheckWords(catalog);
    const text = [sheetWrong ? sheetReport(sheet!, sheetWords) : '', codes.length > 0 ? pythonReport(reports, words, (n) => formatNumber(n, catalog, { digits: 2 })) : ''].filter(Boolean).join('\n\n');
    // Which checks agreed with the sheet: only those are offered to be kept (a wrong check kept is worse than none).
    const agreed = reports.map((r) => r.ok && !r.declined && !r.postponed && r.rows.length > 0 && r.rows.every((row) => row.state === 'agree'));
    const report: ChatTurn = { role: 'user', text, time: new Date().toISOString(), check: true, ...(codes.length > 0 ? { agreed } : {}) };
    const next = [...answered, report];
    onTurns(next);
    if ((sheetWrong || (codes.length > 0 && checksNeedAnswer(reports))) && round < MAX_CHECK_ROUNDS) await askModel(next, round + 1);
  };

  /** One answer of the model to the conversation as it is; its checks in Python after it. */
  const askModel = async (asked: readonly ChatTurn[], round: number) => {
    let answered: ChatTurn[] | undefined;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setAnswer({ id, text: '', thinking: false, thought: '', started: Date.now() });
    // A model sends its answer in thousands of pieces; drawn on each one, a long conversation kept the window busy
    // for minutes after the answer had come. The pieces are gathered and the answer drawn at most every SHOW_EVERY_MS.
    const pending = { text: '', thought: '', thinking: false };
    let lastPiece = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const p = { ...pending };
      pending.text = '';
      pending.thought = '';
      pending.thinking = false;
      if (!p.text && !p.thought && !p.thinking) return;
      setAnswer((a) => (a && a.id === id ? { ...a, text: a.text + p.text, thinking: a.thinking || p.thinking, thought: (a.thought + p.thought).slice(-MAX_THOUGHT), last: lastPiece } : a));
    };
    const unlisten = listen(id, (piece) => {
      const phase = piece.phase;
      if (phase) {
        const tokens = piece.tokens;
        setAnswer((a) => (a && a.id === id ? { ...a, phase, ...(tokens !== undefined ? { tokens } : {}), last: Date.now() } : a));
        return;
      }
      lastPiece = Date.now();
      if (piece.cut) {
        flush();
        setAnswer((a) => (a && a.id === id ? { ...a, cut: true, thinking: false, thought: '', started: Date.now() } : a));
        return;
      }
      pending.text += piece.text ?? '';
      pending.thought = (pending.thought + (piece.thinking ?? '')).slice(-MAX_THOUGHT);
      pending.thinking ||= !!piece.thinking;
      timer ??= setTimeout(flush, SHOW_EVERY_MS);
    });
    const stop = () => {
      unlisten();
      if (timer !== undefined) clearTimeout(timer);
    };
    try {
      const { sheet, languageGuide, memory, catalog: lookupCatalog } = context();
      desktop?.diagStep?.(`chat: asking, ${asked.length} turns, round ${round}`);
      const result = await desktop!.aiChat({
        id,
        provider: provider.id,
        model: settings.model,
        ...(settings.url ? { url: settings.url } : {}),
        ...(settings.effort ? { effort: settings.effort } : {}),
        ...(settings.thinkingLimit !== undefined ? { thinkingLimit: settings.thinkingLimit } : {}),
        ...(settings.context ? { context: settings.context } : {}),
        ...(contextWindow ? { window: contextWindow } : {}),
        language: catalog.locale,
        sheet,
        languageGuide,
        ...(lookupCatalog && lookup ? { catalog: lookupCatalog } : {}),
        turns: asked,
        ...(memory ? { memory } : {}),
        ...(runCheck ? { python: true } : {}),
        ...(intent ? { intent: true } : {}),
      });
      desktop?.diagStep?.(result.ok ? `chat: answer of ${result.text.length} chars` : `chat: no answer (${result.problem})`);
      if (result.usage) setUsage(result.usage);
      // A jump of the window: the new summary is kept with the conversation before the answer is.
      if (result.window) onWindow?.(result.window);
      // An answer the length limit cut keeps a note saying so; no answer at all is not kept, the user is told why.
      // The question as it went (with the state of the sheet then) goes again so: the server reads only what is new.
      const lastQuestion = asked.map((t) => t.role).lastIndexOf('user');
      const keptAsked = result.asked !== undefined && lastQuestion >= 0 ? asked.map((t, n) => (n === lastQuestion ? { ...t, sent: result.asked! } : t)) : asked;
      if (result.ok)
        onTurns(
          (answered = [
          ...keptAsked,
          {
            role: 'assistant',
            ...(result.reasoning ? { reasoning: result.reasoning } : {}),
            // Notes kept with the answer: cut by the length limit, or written without thinking past the limit.
            text: `${result.text}${result.truncated ? `\n\n*${t(catalog, 'chat.truncated')}*` : ''}${result.thinkingCut ? `\n\n*${t(catalog, 'chat.thinkingCut')}*` : ''}`,
            time: new Date().toISOString(),
            model: result.model,
            ...(result.theory ? { theory: result.theory } : {}),
            // The sources it cited, with their state as they are now: the AI notes list them.
            citations: checkCitations(result.text, theory),
          },
          ]),
        );
      else if (result.problem !== 'cancelled') setError(t(catalog, `ai.problem.${result.problem}` as UiKey, { detail: result.detail ?? '', name: provider.urlEditable ? t(catalog, 'ai.otherServer') : provider.name }));
    } catch (e) {
      setError(t(catalog, 'ai.problem.provider', { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      stop();
      setAnswer(undefined);
    }
    if (answered) {
      desktop?.diagStep?.('chat: checking the answer');
      await checkAnswer(answered, round);
      desktop?.diagStep?.('chat: answer checked');
    }
  };

  /** The question of the level of detail in the language of the program, whatever language the model wrote it in. */
  const shownChoice = (choice: ChoiceBlock): ChoiceBlock => {
    if (choice.key !== 'detail') return choice;
    const label: Readonly<Record<string, UiKey>> = { brief: 'props.detailBrief', paper: 'props.detailPaper', teaching: 'props.detailTeaching' };
    return {
      ...choice,
      question: t(catalog, 'choice.detailQuestion'),
      options: choice.options.map((o) => (label[o.value] ? { ...o, label: t(catalog, label[o.value]!) } : o)),
    };
  };
  /** An answer picked from a choice of the model: the user's turn, then the model goes on. */
  const choose = async (choice: ChoiceBlock, option: ChoiceBlock['options'][number]) => {
    if (answer || checking) return;
    onChoice?.(choice, option.value);
    // A conversation held from outside (MCP): its model is in the other application, the answer is written there.
    if (external) {
      setError(t(catalog, 'chat.externalChoice', { client: external, option: option.label }));
      return;
    }
    const asked = [...turns, { role: 'user' as const, text: `${choice.question ? `${choice.question} ` : ''}→ ${option.label}`, time: new Date().toISOString() }];
    onTurns(asked);
    setError(undefined);
    await askModel(asked, 0);
  };

  const cancel = () => {
    if (!answer) return;
    // What was written so far stays in the conversation.
    if (answer.text.trim()) onTurns([...turns, { role: 'assistant', text: `${answer.text} …`, time: new Date().toISOString() }]);
    void desktop!.aiChatCancel(answer.id);
  };

  // The finished turns: drawn again when they or the sheet change, not on each piece of an answer being written.
  const busy = !!answer;
  const deps = [turns, busy, checking, catalog, theory, proposals, onMoveProposal, answerProposals, newSheets, noteKept, onKeepNote, onCheckToSources];
  const kept = historyCache.current;
  const history: ReactNode =
    kept && kept.deps.length === deps.length && kept.deps.every((d, i) => d === deps[i])
      ? kept.node
      : (historyCache.current = {
          deps,
          node: (
            turns.map((turn, i) =>
            // Answers come in Markdown (bold, lists, headings); the same safe subset as notes, no HTML passes.
            turn.role === 'assistant' ? (
              <div key={i} className="chat-turn assistant">
                <div dangerouslySetInnerHTML={{ __html: answerHtml(turn.text, turn.theory) }} />
                {(proposals?.(i) ?? []).map((view, n) => (
                  <ProposalCard key={view.entry.id} view={view} n={n + 1} catalog={catalog} onDecide={(id, accept) => onDecide?.(id, accept)} {...(onReview ? { onReview } : {})} {...(onMoveProposal ? { onMove: onMoveProposal } : {})} />
                ))}
                {(newSheets?.(i) ?? []).map((view) => (
                  <NewSheetCard key={view.entry.id} view={view} catalog={catalog} onOpen={(id) => onOpenSheet?.(id)} />
                ))}
                {parseChoices(turn.text).map(shownChoice).map((choice, n) => (
                  <div key={`choice${n}`} className="chat-choice">
                    {choice.question && <div className="chat-choice-question">{choice.question}</div>}
                    {choice.options.map((option) => (
                      // Only the last answer still waits for a pick; an older question was answered by what followed.
                      <button key={option.value} type="button" className="chat-choice-option" data-value={option.value} disabled={i !== turns.length - 1 || busy || checking} onClick={() => void choose(choice, option)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                ))}
                {onKeepNote &&
                  parseNotes(turn.text).map((note, n) => {
                    const kept = noteKept?.(note) ?? false;
                    return (
                      <div key={`note${n}`} className="chat-note-card">
                        <div className="chat-note-head">{t(catalog, 'note.head', { title: note.title || '…' })}</div>
                        <div className="chat-note-text" dangerouslySetInnerHTML={{ __html: notesHtml(note.text) }} />
                        <button type="button" className="chat-note-keep" disabled={kept} onClick={() => onKeepNote(note)}>
                          {kept ? t(catalog, 'note.kept') : t(catalog, note.target === 'ai' ? 'note.toAi' : 'note.toSources')}
                        </button>
                      </div>
                    );
                  })}
                {onCheckToSources &&
                  parsePythonChecks(turn.text).map((code, n) => {
                    // Of the run that followed the answer: a check that disagreed or did not run is not offered.
                    const next = turns[i + 1];
                    const ok = next?.check && next.agreed ? next.agreed[n] === true : true;
                    return ok ? (
                      <button key={`py${n}`} type="button" className="chat-check-keep" title={t(catalog, 'check.keepTip')} onClick={() => onCheckToSources(code)}>
                        {t(catalog, 'check.keep')}
                      </button>
                    ) : (
                      <span key={`py${n}`} className="chat-check-not-kept muted">
                        {t(catalog, 'check.keepNot')}
                      </span>
                    );
                  })}
                {(() => {
                  const all = answerProposals?.(i);
                  if (!all) return null;
                  return (
                    <div className="proposal-all">
                      {all.ids.length > 1 && !all.together && <div className="muted">{t(catalog, 'proposal.notTogether')}</div>}
                      {all.effect && <EffectLines effect={all.effect} catalog={catalog} title={t(catalog, 'proposal.together')} />}
                      <div className="proposal-actions">
                        {all.ids.length > 1 && (
                          <button type="button" className="proposal-accept-all default" disabled={!all.together} onClick={() => onAcceptAll?.(all.ids)}>
                            {t(catalog, 'proposal.acceptAll', { count: String(all.ids.length) })}
                          </button>
                        )}
                        <button type="button" className="proposal-new-sheet" title={t(catalog, 'proposal.newSheetTip')} disabled={!all.together} onClick={() => onNewSheet?.(all.ids)}>
                          {t(catalog, 'proposal.newSheet')}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : turn.lookup ? (
              // What the program sent the model to read: one line, the contents on a click.
              <details key={i} className="chat-turn check lookup">
                <summary dangerouslySetInnerHTML={{ __html: notesHtml(turn.text.split('\n\n')[0] ?? '') }} />
                <div dangerouslySetInnerHTML={{ __html: notesHtml(turn.text.split('\n\n').slice(1).join('\n\n')) }} />
              </details>
            ) : turn.check ? (
              // The program's report of the checks in Python: a table, as the model got it.
              <div key={i} className="chat-turn check" dangerouslySetInnerHTML={{ __html: notesHtml(turn.text) }} />
            ) : (
              <div key={i} className="chat-turn user">
                {turn.text}
              </div>
            ),
          )
          ),
        }).node;

  return (
    <div className="chat-pane">
      <div className="chat-head">
        {/* The run indicator in the head: seen also when the conversation is scrolled away from the answer. */}
        {(answer || checking) && <span className={`chat-run${answer && (answer.text || answer.thinking) && Date.now() - (answer.last ?? answer.started) >= SILENT_SECONDS * 1000 ? ' quiet' : ''}`} title={t(catalog, 'chat.running')} />}
        <span className="chat-model" title={external ?? settings.model}>
          {external ? `${external} · MCP` : `${provider.urlEditable ? t(catalog, 'ai.otherServer') : provider.name} · ${settings.model || t(catalog, 'ai.firstModel')}`}
        </span>
        {usage && (
          <span
            className={`chat-context${usage.sent > usage.context * 0.6 ? ' full' : ''}`}
            title={t(catalog, 'chat.contextTip', { sent: formatNumber(usage.sent, catalog), context: formatNumber(usage.context, catalog), summed: String(usage.summedUp) })}
          >
            <span className="chat-context-bar" style={{ width: `${Math.min(100, Math.round((100 * usage.sent) / usage.context))}%` }} />
          </span>
        )}
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
                    <span className="hint">
                      {l.found ? t(catalog, `library.folder.${l.folder ?? 'user'}` as UiKey) : t(catalog, 'chat.libraryMissing', { count: String(l.sections) })}
                      {l.study && ` · ${l.study.kind.toUpperCase()} ${t(catalog, 'study.reads', { selected: String(l.study.selected), pages: String(l.study.pages) })}`}
                    </span>
                    {l.study?.large && (
                      <span className="study-warn" title={t(catalog, 'study.large')}>
                        {' '}
                        ⚠
                      </span>
                    )}
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
        {history}
        {checking && <div className="chat-turn check writing">{t(catalog, 'check.running')}</div>}
        {answer &&
          (answer.text ? (
            <div className="chat-turn assistant writing" dangerouslySetInnerHTML={{ __html: answerHtml(answer.text) }} />
          ) : (
            <div className="chat-turn assistant writing">
              {answer.cut && <div className="chat-thinking-cut">{t(catalog, 'chat.thinkingCutNow')}</div>}
              {answer.thought.trim() ? (
                // Folded: a click shows what the model is thinking about, so a long wait is not a blank one.
                <details className="chat-thought">
                  <summary>{t(catalog, 'chat.thoughtShow')}</summary>
                  <div ref={thoughtBox} className="chat-thought-text">
                    {answer.thought}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        {answer && <AnswerStatus answer={answer} catalog={catalog} />}
        {error && <div className="chat-error">{error}</div>}
      </div>
      {external ? (
        <p className="hint chat-external">{t(catalog, 'chat.external', { client: external })}</p>
      ) : (
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={3}
          value={draft}
          placeholder={t(catalog, intent && turns.length === 0 ? 'chat.intentPlaceholder' : 'chat.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {answer || checking ? (
          <button type="button" className="chat-stop" onClick={cancel} disabled={!answer}>
            {t(catalog, 'chat.stop')}
          </button>
        ) : (
          <button type="button" className="chat-send default" onClick={() => void send()} disabled={!draft.trim()}>
            {t(catalog, 'chat.send')}
          </button>
        )}
      </div>
      )}
      <p className="hint chat-note">{t(catalog, 'chat.note')}</p>
    </div>
  );
}

/** Seconds after which a silent model is said to be silent: a local model may compute that long, the user decides. */
const SILENT_SECONDS = 30;

/**
 * What the program waits for while an answer is coming: the phase (the context of the model asked, the older part
 * of the conversation summed up, the question read by the model, thinking, writing), the time since the question
 * and, when the model has sent nothing for a while, how long, so the user can tell a long computation from a hang.
 */
function AnswerStatus({ answer, catalog }: { readonly answer: { readonly text: string; readonly thinking: boolean; readonly started: number; readonly phase?: 'context' | 'summing' | 'reading'; readonly tokens?: number; readonly last?: number }; readonly catalog: Catalog }) {
  const now = Date.now();
  const seconds = String(Math.floor((now - answer.started) / 1000));
  const silent = Math.floor((now - (answer.last ?? answer.started)) / 1000);
  const doing = answer.text
    ? t(catalog, 'chat.phase.writing', { seconds })
    : answer.thinking
      ? t(catalog, 'chat.thinking', { seconds })
      : answer.phase === 'context'
        ? t(catalog, 'chat.phase.context', { seconds })
        : answer.phase === 'summing'
          ? t(catalog, 'chat.phase.summing', { seconds })
          : answer.phase === 'reading'
            ? t(catalog, 'chat.phase.reading', { seconds, tokens: formatNumber(answer.tokens ?? 0, catalog) })
            : t(catalog, 'chat.waiting', { seconds });
  // Reading a long question sends nothing by its nature; silence counts once the model has begun to answer.
  const quiet = (answer.text || answer.thinking) && silent >= SILENT_SECONDS;
  return (
    <div className={`chat-status${quiet ? ' quiet' : ''}`} data-phase={answer.text ? 'writing' : answer.thinking ? 'thinking' : (answer.phase ?? 'waiting')}>
      <span className="chat-status-dot" />
      {doing}
      {quiet && <span className="chat-status-quiet">{t(catalog, 'chat.phase.silent', { seconds: String(silent) })}</span>}
    </div>
  );
}
