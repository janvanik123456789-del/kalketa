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
import { allowedProviders, NO_POLICY, parseAiPolicy, providerById, type AiPolicy } from '@kalketa/ai';
import { discoverLocal, testConnection, tryModel, type AnswerResult, type ConnectionResult } from '@kalketa/ai/connect';

export interface AiKeyState {
  /** A key is set for this provider. */
  readonly hasKey: boolean;
  /** It survives a restart (encrypted on disk). */
  readonly remembered: boolean;
  /** The system can encrypt keys, so "remember" can be offered. */
  readonly canRemember: boolean;
}

/** Keys for this run of the program, by provider. */
const keys = new Map<string, string>();
let loaded = false;

function keyFile(): string {
  return join(app.getPath('userData'), 'ai-keys.json');
}

/** Encrypted keys on disk, as base64, by provider. */
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
  if (!safeStorage.isEncryptionAvailable()) return;
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
  const canRemember = safeStorage.isEncryptionAvailable();
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
    const remember = request.remember === true && safeStorage.isEncryptionAvailable();
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

  ipcMain.handle('kalketa:ai-test', async (event, provider: unknown, url: unknown): Promise<ConnectionResult> => {
    fromEditor(event);
    const id = allowed(provider);
    await loadKeys();
    return testConnection(id, keys.get(id), {}, typeof url === 'string' ? url : undefined);
  });
}
