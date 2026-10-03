/**
 * Talking to a provider: runs outside the editor (in the desktop main process),
 * where the key is kept. Results carry codes, the user interface words them.
 */

import Anthropic from '@anthropic-ai/sdk';
import { PROVIDERS, providerById, serverUrl, type ModelChoice, type ProviderInfo } from './providers.js';

/** Why a connection failed; the editor turns the code into a message. */
export type ConnectionProblem = 'noProvider' | 'noKey' | 'badKey' | 'denied' | 'rateLimit' | 'network' | 'notRunning' | 'badUrl' | 'provider';

export type ConnectionResult = { readonly ok: true; readonly models: readonly ModelChoice[] } | { readonly ok: false; readonly problem: ConnectionProblem; readonly detail?: string };

/** The part of the Anthropic client used here, so tests can pass their own. */
export interface ModelLister {
  readonly models: { list(): AsyncIterable<{ readonly id: string; readonly display_name: string }> };
}

export type ClientFactory = (apiKey: string) => ModelLister;

/** What a connection uses to reach the outside; tests pass their own. */
export interface Transport {
  readonly anthropic?: ClientFactory;
  readonly fetch?: typeof fetch;
}

// Only the key from the settings: no token or profile from the environment rides along.
// ANTHROPIC_BASE_URL is honoured, e.g. for a company proxy (and the smoke test's fake server).
const anthropicClient: ClientFactory = (apiKey) => new Anthropic({ apiKey, authToken: null, maxRetries: 1, timeout: 20_000 });

/** A local server answers at once or not at all. */
const LOCAL_TIMEOUT_MS = 3000;

/**
 * Where a local server listens: the address the user gave (where the provider
 * allows one), else KALKETA_AI_URL_<ID> (e.g. KALKETA_AI_URL_OLLAMA), else the default.
 */
export function localUrl(provider: ProviderInfo, url?: string): string {
  const given = provider.urlEditable && url ? serverUrl(url) : undefined;
  // "http://host:8080/v1" (as Cline and others write it) and "http://host:8080" mean the same server.
  return (given ?? process.env[`KALKETA_AI_URL_${provider.id.toUpperCase()}`] ?? provider.baseUrl ?? '').replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * Asks the provider for its models: for Claude this checks the key, for a
 * local server whether it runs. No tokens are spent. The list is what the
 * user can then pick from.
 */
export async function testConnection(providerId: string, apiKey: string | undefined, transport: Transport = {}, url?: string): Promise<ConnectionResult> {
  const provider = providerById(providerId);
  if (!provider) return { ok: false, problem: 'noProvider' };
  if (provider.needsKey && !apiKey?.trim()) return { ok: false, problem: 'noKey' };
  if (provider.api === 'openai-compatible') return localModels(provider, transport.fetch ?? fetch, url);
  try {
    const models: ModelChoice[] = [];
    for await (const model of (transport.anthropic ?? anthropicClient)(apiKey!.trim()).models.list()) models.push({ id: model.id, name: model.display_name });
    return { ok: true, models };
  } catch (error) {
    return { ok: false, ...problemOf(error) };
  }
}

/** Local servers that run now, with their models. */
export async function discoverLocal(transport: Transport = {}): Promise<Record<string, readonly ModelChoice[]>> {
  const found: Record<string, readonly ModelChoice[]> = {};
  await Promise.all(
    PROVIDERS.filter((p) => p.local).map(async (p) => {
      const result = await localModels(p, transport.fetch ?? fetch);
      if (result.ok) found[p.id] = result.models;
    }),
  );
  return found;
}

/** GET /v1/models, which LM Studio and Ollama both offer. */
async function localModels(provider: ProviderInfo, fetchFn: typeof fetch, url?: string): Promise<ConnectionResult> {
  if (provider.urlEditable && url !== undefined && !serverUrl(url)) return { ok: false, problem: 'badUrl' };
  let response: Response;
  try {
    response = await fetchFn(`${localUrl(provider, url)}/v1/models`, { signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS) });
  } catch {
    return { ok: false, problem: 'notRunning' };
  }
  if (!response.ok) return { ok: false, problem: 'provider', detail: `${response.status} ${response.statusText}`.trim() };
  try {
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
    // Embedding models only turn text into numbers; they cannot answer.
    return { ok: true, models: ids.filter((id) => !/embed/i.test(id)).map((id) => ({ id, name: id })) };
  } catch {
    return { ok: false, problem: 'provider', detail: 'not a model list' };
  }
}

/** The model answered (or why not), and how long it took. */
export type AnswerResult = { readonly ok: true; readonly reply: string; readonly ms: number } | { readonly ok: false; readonly problem: ConnectionProblem; readonly detail?: string };

/** A model may first have to be loaded into memory, and it thinks before it answers. */
const ANSWER_TIMEOUT_MS = 180_000;

/**
 * Asks a model of a local server one short question, so the user sees that it
 * really answers. Only for servers with the OpenAI-style API: they cost nothing.
 */
export async function tryModel(providerId: string, model: string, transport: Transport = {}, url?: string): Promise<AnswerResult> {
  const provider = providerById(providerId);
  if (!provider || provider.api !== 'openai-compatible') return { ok: false, problem: 'noProvider' };
  if (provider.urlEditable && url !== undefined && !serverUrl(url)) return { ok: false, problem: 'badUrl' };
  const started = Date.now();
  let response: Response;
  try {
    response = await (transport.fetch ?? fetch)(`${localUrl(provider, url)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 400 }),
      signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof Error && error.name === 'TimeoutError' ? { ok: false, problem: 'provider', detail: 'timeout' } : { ok: false, problem: 'notRunning' };
  }
  if (!response.ok) return { ok: false, problem: 'provider', detail: `${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`.trim() };
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!body.choices?.length) return { ok: false, problem: 'provider', detail: 'no answer' };
    return { ok: true, reply: typeof content === 'string' ? content.trim().slice(0, 200) : '', ms: Date.now() - started };
  } catch {
    return { ok: false, problem: 'provider', detail: 'not an answer' };
  }
}

function problemOf(error: unknown): { problem: ConnectionProblem; detail?: string } {
  if (error instanceof Anthropic.AuthenticationError) return { problem: 'badKey' };
  if (error instanceof Anthropic.PermissionDeniedError) return { problem: 'denied' };
  if (error instanceof Anthropic.RateLimitError) return { problem: 'rateLimit' };
  if (error instanceof Anthropic.APIConnectionError) return { problem: 'network' };
  if (error instanceof Anthropic.APIError) return { problem: 'provider', detail: `${error.status ?? ''} ${error.message}`.trim() };
  return { problem: 'provider', detail: error instanceof Error ? error.message : String(error) };
}
