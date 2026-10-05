/**
 * The AI part of the desktop bridge. API keys live only here, in the main
 * process: the editor can set or forget a key and ask whether one is there,
 * but never reads it back. A remembered key is encrypted by the operating
 * system (Electron safeStorage); without that, it is kept until the program
 * closes and never written to disk. Local servers (LM Studio, Ollama) need no key.
 *
 * Company rules come from ai-policy.json next to the program (KALKETA_AI_POLICY
 * may point elsewhere); they are read, never written.
 */

import { app, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AI_EFFORTS, allowedProviders, CITED_ID, formulaPrompt, memoryInstruction, modelAllowed, prepareBriefing, NO_POLICY, parseAiPolicy, providerById, type AiPolicy, type AiSheetContext, type ChatTurn } from '@kalketa/ai';
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
  readonly language: string;
  readonly sheet: AiSheetContext;
  readonly languageGuide?: string;
  readonly turns: readonly ChatTurn[];
  /** The sheet's memory from earlier conversations (ch. 9.7). */
  readonly memory?: string;
}

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
  const path = process.env['KALKETA_AI_POLICY'] ?? join(dirname(app.getPath('exe')), 'ai-policy.json');
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
    return Object.fromEntries(Object.entries(await discoverLocal()).filter(([id]) => permitted.has(id)));
  });

  // One short question to a model of a local server, so the user sees it answer.
  ipcMain.handle('kalketa:ai-try', (event, provider: unknown, model: unknown, url: unknown): Promise<AnswerResult> => {
    fromEditor(event);
    return tryModel(allowed(provider), typeof model === 'string' ? model : '', {}, typeof url === 'string' ? url : undefined);
  });

  // A conversation turn: pieces of the answer go to the window as they come.
  /**
   * A turn of a conversation, or (`memory`) the memory update when one ends: the
   * same briefing, the conversation, and the request to rewrite the memory,
   * thought through briefly. Pieces of a chat answer go to the window as they come.
   */
  const run = async (event: IpcMainInvokeEvent, ask: ChatAsk, memory: boolean): Promise<ChatResult & { theory?: { sent: readonly string[]; total: number } }> => {
    fromEditor(event);
    const id = allowed(ask.provider);
    const policy = readPolicy();
    if (!modelAllowed(policy, ask.model)) throw new Error('Model not allowed');
    await loadKeys();
    const controller = new AbortController();
    running.set(ask.id, controller);
    const send = (piece: { text?: string; thinking?: string }) => {
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
      query: asked,
      cited,
    });
    const turns = ask.turns.map((t) => ({ role: t.role, text: t.text }));
    const effort = memory ? 'low' : AI_EFFORTS.find((e) => e === ask.effort);
    try {
      const result = await chat({
        provider: id,
        model: ask.model,
        ...(typeof ask.url === 'string' ? { url: ask.url } : {}),
        ...(effort ? { effort } : {}),
        ...(keys.has(id) ? { apiKey: keys.get(id)! } : {}),
        system: prepared.text,
        turns: memory ? [...turns, { role: 'user' as const, text: memoryInstruction(ask.memory ?? '') }] : turns,
        onText: (text) => send({ text }),
        onThinking: (delta) => send({ thinking: delta }),
        signal: controller.signal,
      });
      return prepared.theory && result.ok && !memory ? { ...result, theory: { sent: prepared.theory.sent, total: prepared.theory.total } } : result;
    } finally {
      running.delete(ask.id);
    }
  };

  ipcMain.handle('kalketa:ai-chat', (event, ask: ChatAsk) => run(event, ask, false));
  // The sheet's memory rewritten when a conversation ends (ch. 9.7).
  ipcMain.handle('kalketa:ai-memory', (event, ask: ChatAsk) => run(event, ask, true));

  // A formula read from a picture: the picture and the instruction, one answer.
  ipcMain.handle('kalketa:ai-formula', async (event, ask: { provider: unknown; model: unknown; url?: unknown; image: { type: unknown; data: unknown } }): Promise<ChatResult> => {
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
      prompt: formulaPrompt(),
      image: { type: ask.image.type, data: ask.image.data },
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
