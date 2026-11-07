/**
 * The AI part of the desktop bridge. API keys live only here, in the main
 * process: the editor can set or forget a key and ask whether one is there,
 * but never reads it back. A remembered key is encrypted by the operating
 * system (Electron safeStorage); without that, it is kept until the program
 * closes and never written to disk. Local servers (LM Studio, Ollama, another
 * server) need no key unless they are set to ask for one; theirs is kept the same way.
 *
 * Company rules come from ai-policy.json next to the program; they are read, never
 * written. KALKETA_AI_POLICY may point elsewhere only from the source: in a packaged
 * program it would let a user switch the rules of the company off.
 */

import { app, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { pyodideHasNumpy } from './python.js';
import { appendLog, saveAnswerText } from './diagnostics.js';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AI_EFFORTS, DEFAULT_THINKING_LIMIT, THINKING_LIMITS, allowedProviders, CITED_ID, FIGURE_CONTEXT_CHARS, figurePrompt, rereadPrompt, formulaPrompt, memoryInstruction, modelAllowed, prepareBriefing, withSheetState, DEFAULT_CONTEXT, estimateTokens, planJump, sentTokens, summaryInstruction, windowTurns, type ConversationWindow, NO_POLICY, parseAiPolicy, providerById, type AiPolicy, type AiSheetContext, type ChatTurn } from '@kalketa/ai';
import { askAboutImage, chat, discoverLocal, testConnection, tryModel, type AnswerResult, type ChatResult, type ConnectionResult } from '@kalketa/ai/connect';

export interface AiKeyState {
  /** A key is set for this provider. */
  readonly hasKey: boolean;
  /** It survives a restart (encrypted on disk). */
  readonly remembered: boolean;
  /** The system can encrypt keys, so "remember" can be offered. */
  readonly canRemember: boolean;
}

/** A conversation turn the editor asks for; the briefing is built here, with the company rules. */
interface ChatAsk {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly url?: string;
  readonly effort?: string;
  readonly thinkingLimit?: number;
  readonly language: string;
  readonly sheet: AiSheetContext;
  readonly languageGuide?: string;
  /** The editor runs checks in Python of the answers: the model is told how to write them. */
  readonly python?: boolean;
  readonly turns: readonly ChatTurn[];
  /** The sheet's memory from earlier conversations (ch. 9.7). */
  readonly memory?: string;
  /** A new calculation from its intent: questions, outline, then the sheet (ch. 9.3). */
  readonly intent?: boolean;
  /** The older turns of the conversation summed up so far (kept with the conversation in the sheet). */
  readonly window?: ConversationWindow;
  /** The context of the model in tokens, as the settings say; the default of the provider without it. */
  readonly context?: number;
}

/** How full the conversation window is: what went to the model, of how much it takes in, and how much is summed up. */
export interface WindowUsage {
  readonly sent: number;
  readonly context: number;
  readonly summedUp: number;
}

/** The context of a model as its server said it, by provider, address and model; asked once a run of the program. */
const serverContexts = new Map<string, number | undefined>();

/** Answers being written, so the editor can stop one. */
const running = new Map<string, AbortController>();

/** Keys for this run of the program, by provider. */
const keys = new Map<string, string>();
let loaded = false;

function keyFile(): string {
  return join(app.getPath('userData'), 'ai-keys.json');
}

/** Encrypted keys on disk, as base64, by provider. */
/**
 * Keys are kept on disk only when the system encrypts them. On Linux without a
 * keyring Electron "encrypts" with a fixed password (basic_text): that is no
 * protection, so the key then lives only until the program ends.
 */
export function canSealKeys(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
}

async function storedKeys(): Promise<Record<string, string>> {
  try {
    const value = JSON.parse(await readFile(keyFile(), 'utf8')) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function loadKeys(): Promise<void> {
  if (loaded) return;
  loaded = true;
  if (!canSealKeys()) return;
  for (const [provider, sealed] of Object.entries(await storedKeys())) {
    try {
      keys.set(provider, safeStorage.decryptString(Buffer.from(sealed, 'base64')));
    } catch {
      // Encrypted by another user or system: the user enters the key again.
    }
  }
}

async function storeKey(provider: string, key: string | undefined): Promise<void> {
  const stored = await storedKeys();
  if (key === undefined) delete stored[provider];
  else stored[provider] = safeStorage.encryptString(key).toString('base64');
  await mkdir(dirname(keyFile()), { recursive: true });
  await writeFile(keyFile(), JSON.stringify(stored, null, 2));
}

async function keyState(provider: string): Promise<AiKeyState> {
  await loadKeys();
  const canRemember = canSealKeys();
  return { hasKey: keys.has(provider), remembered: canRemember && provider in (await storedKeys()), canRemember };
}

export function readPolicy(): AiPolicy {
  const own = app.isPackaged ? undefined : process.env['KALKETA_AI_POLICY'];
  const path = own ?? join(dirname(app.getPath('exe')), 'ai-policy.json');
  if (!existsSync(path)) return NO_POLICY;
  try {
    return parseAiPolicy(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    // A broken file must not leave the AI open: everything is switched off.
    return { disabled: true };
  }
}

/** A provider the policy allows, or an error for the editor. */
function allowed(provider: unknown): string {
  if (typeof provider !== 'string' || !providerById(provider) || !allowedProviders(readPolicy()).some((p) => p.id === provider)) throw new Error('Provider not allowed');
  return provider;
}

export function registerAiBridge(fromEditor: (event: IpcMainInvokeEvent) => unknown): void {
  ipcMain.handle('kalketa:ai-policy', (event) => {
    fromEditor(event);
    return readPolicy();
  });

  ipcMain.handle('kalketa:ai-key-state', (event, provider: unknown) => {
    fromEditor(event);
    return keyState(allowed(provider));
  });

  ipcMain.handle('kalketa:ai-set-key', async (event, request: { provider: unknown; key: unknown; remember: unknown }) => {
    fromEditor(event);
    const provider = allowed(request.provider);
    const key = typeof request.key === 'string' ? request.key.trim() : '';
    if (!key) throw new Error('Empty key');
    await loadKeys();
    keys.set(provider, key);
    const remember = request.remember === true && canSealKeys();
    await storeKey(provider, remember ? key : undefined);
    return keyState(provider);
  });

  ipcMain.handle('kalketa:ai-forget-key', async (event, provider: unknown) => {
    fromEditor(event);
    const id = allowed(provider);
    keys.delete(id);
    await storeKey(id, undefined);
    return keyState(id);
  });

  // Local servers running now (LM Studio, Ollama), among those the policy allows.
  ipcMain.handle('kalketa:ai-discover', async (event) => {
    fromEditor(event);
    const permitted = new Set(allowedProviders(readPolicy()).map((p) => p.id));
    await loadKeys();
    return Object.fromEntries(Object.entries(await discoverLocal({}, Object.fromEntries(keys))).filter(([id]) => permitted.has(id)));
  });

  // One short question to a model of a local server, so the user sees it answer.
  ipcMain.handle('kalketa:ai-try', async (event, provider: unknown, model: unknown, url: unknown): Promise<AnswerResult> => {
    fromEditor(event);
    const id = allowed(provider);
    await loadKeys();
    return tryModel(id, typeof model === 'string' ? model : '', {}, typeof url === 'string' ? url : undefined, keys.get(id));
  });

  // A conversation turn: pieces of the answer go to the window as they come.
  /**
   * A turn of a conversation, or (`memory`) the memory update when one ends: the
   * same briefing, the conversation, and the request to rewrite the memory,
   * thought through briefly. Pieces of a chat answer go to the window as they come.
   */
  const run = async (event: IpcMainInvokeEvent, ask: ChatAsk, memory: boolean): Promise<ChatResult & { theory?: { sent: readonly string[]; total: number }; window?: ConversationWindow; usage?: WindowUsage; asked?: string; reasoning?: string }> => {
    fromEditor(event);
    const id = allowed(ask.provider);
    const policy = readPolicy();
    if (!modelAllowed(policy, ask.model)) throw new Error('Model not allowed');
    await loadKeys();
    const controller = new AbortController();
    running.set(ask.id, controller);
    // Pieces of the answer, and what the program does before it comes (so a long wait shows what it waits for).
    const send = (piece: { text?: string; thinking?: string; cut?: boolean; phase?: 'context' | 'summing' | 'reading'; tokens?: number }) => {
      if (!memory && !event.sender.isDestroyed()) event.sender.send('kalketa:ai-chat-event', { id: ask.id, ...piece });
    };
    // The theory for the question: the last two questions of the user, and what was cited so far.
    const asked = ask.turns.filter((t) => t.role === 'user').slice(-2).map((t) => t.text).join('\n');
    const cited = [...new Set(ask.turns.filter((t) => t.role === 'assistant').flatMap((t) => [...t.text.matchAll(CITED_ID)].map((m) => m[1]!)))];
    const prepared = prepareBriefing({
      language: ask.language,
      sheet: ask.sheet,
      ...(ask.languageGuide ? { languageGuide: ask.languageGuide } : {}),
      ...(policy.instructions ? { companyInstructions: policy.instructions } : {}),
      ...(typeof ask.memory === 'string' && ask.memory.trim() ? { memory: ask.memory } : {}),
      ...(ask.python === true ? { python: { numpy: pyodideHasNumpy(app.isPackaged ? process.resourcesPath : undefined) } } : {}),
      query: asked,
      cited,
      ...(ask.intent === true ? { intent: true } : {}),
    });
    const turns: ChatTurn[] = ask.turns.map((t) => ({ role: t.role, text: t.text, ...(typeof t.sent === 'string' && t.role === 'user' ? { sent: t.sent } : {}), ...(typeof t.reasoning === 'string' && t.role === 'assistant' ? { reasoning: t.reasoning } : {}) }));
    const effort = memory ? 'low' : AI_EFFORTS.find((e) => e === ask.effort);
    // The conversation window: under a share of the context of the model; past it, the older turns summed up once.
    const provider = providerById(id)!;
    // The context of the model: as the settings say, else as its server says (Strata 256 K), else the default.
    let told: number | undefined;
    if (!(typeof ask.context === 'number' && ask.context >= 2048) && provider.api === 'openai-compatible') {
      const at = `${id}|${ask.url ?? ''}|${ask.model}`;
      if (!serverContexts.has(at)) {
        send({ phase: 'context' });
        const listed = await testConnection(id, keys.get(id), {}, typeof ask.url === 'string' ? ask.url : undefined).catch(() => undefined);
        serverContexts.set(at, listed?.ok ? listed.models.find((m) => m.id === ask.model)?.context : undefined);
      }
      told = serverContexts.get(at);
    }
    const context = typeof ask.context === 'number' && Number.isInteger(ask.context) && ask.context >= 2048 ? ask.context : (told ?? (provider.local ? DEFAULT_CONTEXT.local : DEFAULT_CONTEXT.remote));
    const given = ask.window && Number.isInteger(ask.window.upTo) && ask.window.upTo > 0 && ask.window.upTo < turns.length && typeof ask.window.summary === 'string' ? ask.window : undefined;
    const fixed = estimateTokens(prepared.text) + estimateTokens(prepared.state);
    let window = given;
    let jumped: ConversationWindow | undefined;
    const upTo = planJump(turns, window, fixed, context);
    if (upTo !== undefined) {
      send({ phase: 'summing' });
      // One answer more, only at a jump: the older part summed up by the model itself, from what it was given then.
      const summed = await chat({
        provider: id,
        model: ask.model,
        ...(typeof ask.url === 'string' ? { url: ask.url } : {}),
        ...(provider.local ? { effort: 'none' as const } : { effort: 'low' as const }),
        ...(keys.has(id) ? { apiKey: keys.get(id)! } : {}),
        system: prepared.text,
        turns: [...windowTurns(turns.slice(0, upTo), window), { role: 'user' as const, text: summaryInstruction() }],
        onText: () => undefined,
        thinkingLimit: 0,
      });
      appendLog('ai.log', { event: 'summed-up', id: ask.id, upTo, ok: summed.ok, ...(summed.ok ? { chars: summed.text.length } : { problem: summed.problem }) });
      if (summed.ok && summed.text.trim()) {
        jumped = { upTo, summary: summed.text.trim(), time: new Date().toISOString() };
        window = jumped;
      }
    }
    const usage: WindowUsage = { sent: sentTokens(turns, window, fixed), context, summedUp: window?.upTo ?? 0 };
    const sending = withSheetState(windowTurns(memory ? [...turns, { role: 'user' as const, text: memoryInstruction(ask.memory ?? '') }] : turns, window), prepared.state);
    // The question exactly as it went, kept with it in the conversation; and what the model thought, kept with the answer.
    const sentQuestion = sending.filter((t) => t.role === 'user').at(-1)?.text;
    let thought = '';
    // What went to the model and how it ended, for finding faults (logs/ai.log); sizes only, no text, no key.
    const started = Date.now();
    let pieces = 0;
    const logged = { request: memory ? 'memory' : 'chat', id: ask.id, provider: id, model: ask.model, ...(typeof ask.url === 'string' ? { url: ask.url } : {}), keyGiven: keys.has(id), effort: effort ?? null, briefingChars: prepared.text.length, stateChars: prepared.state.length, turns: turns.length, turnsChars: turns.reduce((n, t) => n + t.text.length, 0), context, sentTokens: usage.sent, summedUp: usage.summedUp };
    appendLog('ai.log', { event: 'asked', ...logged });
    // Until the first piece comes, the model reads what was sent: on a local model that takes long when much is new.
    send({ phase: 'reading', tokens: usage.sent });
    try {
      const result = await chat({
        provider: id,
        model: ask.model,
        ...(typeof ask.url === 'string' ? { url: ask.url } : {}),
        ...(effort ? { effort } : {}),
        ...(keys.has(id) ? { apiKey: keys.get(id)! } : {}),
        // The steady briefing first, the sheet as it is now with the latest question: the server reads only what is new.
        system: prepared.text,
        turns: sending,
        onText: (text) => (pieces++, send({ text })),
        onThinking: (delta) => ((thought += delta), pieces++, send({ thinking: delta })),
        // Thinking past the limit of the settings: asked again without it, the user told so.
        ...(typeof ask.thinkingLimit === 'number' && THINKING_LIMITS.includes(ask.thinkingLimit) ? { thinkingLimit: ask.thinkingLimit } : { thinkingLimit: DEFAULT_THINKING_LIMIT }),
        // Asked again without thinking: what it thought the first time is not part of the answer.
        onThinkingCut: () => ((thought = ''), send({ cut: true })),
        signal: controller.signal,
      });
      // The answer itself is kept apart (logs/ai-answers), written before the editor reads it.
      const file = result.ok ? saveAnswerText(ask.id, result.text, { request: logged.request, model: result.model, ms: Date.now() - started }) : undefined;
      appendLog('ai.log', { event: 'answered', id: ask.id, ms: Date.now() - started, pieces, ok: result.ok, ...(result.ok ? { chars: result.text.length, truncated: !!result.truncated, thinkingCut: !!result.thinkingCut, file } : { problem: result.problem, detail: result.detail ?? null }) });
      const extra = { usage, ...(jumped ? { window: jumped } : {}), ...(sentQuestion !== undefined && !memory ? { asked: sentQuestion } : {}), ...(thought.trim() && !memory ? { reasoning: thought } : {}) };
      return prepared.theory && result.ok && !memory ? { ...result, ...extra, theory: { sent: prepared.theory.sent, total: prepared.theory.total } } : { ...result, ...extra };
    } catch (error) {
      appendLog('ai.log', { event: 'failed', id: ask.id, ms: Date.now() - started, pieces, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      running.delete(ask.id);
    }
  };

  ipcMain.handle('kalketa:ai-chat', (event, ask: ChatAsk) => run(event, ask, false));
  // The sheet's memory rewritten when a conversation ends (ch. 9.7).
  ipcMain.handle('kalketa:ai-memory', (event, ask: ChatAsk) => run(event, ask, true));

  // A formula read from a picture: the picture and the instruction, one answer.
  // A figure described instead (purpose 'figure'), in the language of the user.
  ipcMain.handle('kalketa:ai-formula', async (event, ask: { provider: unknown; model: unknown; url?: unknown; effort?: unknown; purpose?: unknown; language?: unknown; context?: unknown; image: { type: unknown; data: unknown } }): Promise<ChatResult> => {
    fromEditor(event);
    const id = allowed(ask.provider);
    const model = typeof ask.model === 'string' ? ask.model : '';
    if (!modelAllowed(readPolicy(), model)) throw new Error('Model not allowed');
    if (typeof ask.image?.type !== 'string' || !ask.image.type.startsWith('image/') || typeof ask.image.data !== 'string') throw new Error('Bad picture');
    await loadKeys();
    return askAboutImage({
      provider: id,
      model,
      ...(typeof ask.url === 'string' ? { url: ask.url } : {}),
      ...(keys.has(id) ? { apiKey: keys.get(id)! } : {}),
      prompt: ask.purpose === 'text' ? rereadPrompt(typeof ask.context === 'string' ? ask.context : '') : ask.purpose === 'figure' ? figurePrompt(typeof ask.language === 'string' && /^[A-Za-z ]{2,30}$/.test(ask.language) ? ask.language : 'English', typeof ask.context === 'string' ? ask.context.slice(0, FIGURE_CONTEXT_CHARS) : '') : formulaPrompt(),
      image: { type: ask.image.type, data: ask.image.data },
      ...(AI_EFFORTS.find((e) => e === ask.effort) ? { effort: AI_EFFORTS.find((e) => e === ask.effort)! } : {}),
    });
  });

  ipcMain.handle('kalketa:ai-chat-cancel', (event, id: unknown) => {
    fromEditor(event);
    if (typeof id === 'string') running.get(id)?.abort();
  });

  ipcMain.handle('kalketa:ai-test', async (event, provider: unknown, url: unknown): Promise<ConnectionResult> => {
    fromEditor(event);
    const id = allowed(provider);
    await loadKeys();
    return testConnection(id, keys.get(id), {}, typeof url === 'string' ? url : undefined);
  });
}
