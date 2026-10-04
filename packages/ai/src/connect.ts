/**
 * Talking to a provider: runs outside the editor (in the desktop main process),
 * where the key is kept. Results carry codes, the user interface words them.
 */

import Anthropic from '@anthropic-ai/sdk';
import { PROVIDERS, providerById, serverUrl, type ModelChoice, type ProviderInfo } from './providers.js';
import type { ChatTurn } from './briefing.js';
import type { AiEffort } from './settings.js';

/** Why a connection failed; the editor turns the code into a message. */
export type ConnectionProblem = 'noProvider' | 'noKey' | 'badKey' | 'denied' | 'rateLimit' | 'network' | 'notRunning' | 'badUrl' | 'refused' | 'cancelled' | 'cutOff' | 'empty' | 'provider';

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

export interface ChatRequest {
  readonly provider: string;
  readonly model: string;
  /** Address of a server whose provider lets the user give one. */
  readonly url?: string;
  readonly apiKey?: string;
  /** The briefing (system prompt), in English. */
  readonly system: string;
  /** How long the model may think; absent = as the model or server decides. */
  readonly effort?: AiEffort;
  readonly turns: readonly ChatTurn[];
  /** Each piece of the answer as it comes. */
  onText(delta: string): void;
  /** The model is thinking before it writes (local models that report it). */
  onThinking?(): void;
  readonly signal?: AbortSignal;
}

/**
 * The answer, or why there is none. `truncated`: the answer stopped at the length
 * limit. A model that spends the whole limit on thinking gives no text: 'cutOff'.
 */
export type ChatResult = { readonly ok: true; readonly text: string; readonly model: string; readonly truncated?: boolean } | { readonly ok: false; readonly problem: ConnectionProblem; readonly detail?: string };

/** What a finished answer is: text, cut off by the limit, or nothing at all. */
function finished(text: string, model: string, atLimit: boolean): ChatResult {
  if (!text.trim()) return { ok: false, problem: atLimit ? 'cutOff' : 'empty' };
  return { ok: true, text, model, ...(atLimit ? { truncated: true } : {}) };
}

/** Claude models that take the effort setting and the server-side fallback after a refusal. */
const CURRENT_CLAUDE = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** A conversation turn: the answer streams in through onText. */
export async function chat(request: ChatRequest, transport: Transport = {}): Promise<ChatResult> {
  const provider = providerById(request.provider);
  if (!provider) return { ok: false, problem: 'noProvider' };
  if (provider.api === 'openai-compatible') return chatOpenAi(provider, request, transport.fetch ?? fetch);
  if (!request.apiKey?.trim()) return { ok: false, problem: 'noKey' };
  const client = new Anthropic({ apiKey: request.apiKey.trim(), authToken: null, maxRetries: 1 });
  const current = CURRENT_CLAUDE.has(request.model);
  try {
    const stream = client.beta.messages.stream(
      {
        model: request.model,
        max_tokens: 64000,
        system: request.system,
        messages: request.turns.map((t) => ({ role: t.role, content: t.text })),
        // A conversation needs no deep thinking unless the user asks for it; on a refusal the API answers with a fallback model.
        ...(current ? { output_config: { effort: request.effort ?? 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      request.signal ? { signal: request.signal } : {},
    );
    stream.on('text', (delta) => request.onText(delta));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') return { ok: false, problem: 'refused' };
    if (message.stop_reason === 'max_tokens') return finished(message.content.map((b) => (b.type === 'text' ? b.text : '')).join(''), message.model, true);
    const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return finished(text, message.model, false);
  } catch (error) {
    if (request.signal?.aborted) return { ok: false, problem: 'cancelled' };
    return { ok: false, ...problemOf(error) };
  }
}

/** POST /v1/chat/completions with stream: true; the answer comes as server-sent events. */
async function chatOpenAi(provider: ProviderInfo, request: ChatRequest, fetchFn: typeof fetch): Promise<ChatResult> {
  if (provider.urlEditable && request.url !== undefined && !serverUrl(request.url)) return { ok: false, problem: 'badUrl' };
  let response: Response;
  try {
    response = await fetchFn(`${localUrl(provider, request.url)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        stream: true,
        // Local models think before they answer, and their thinking counts in the limit: the room covers both.
        max_tokens: 16384,
        // As Cline sends it; servers that do not know it leave it out.
        ...(request.effort ? { reasoning_effort: request.effort } : {}),
        messages: [{ role: 'system', content: request.system }, ...request.turns.map((t) => ({ role: t.role, content: t.text }))],
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch {
    return request.signal?.aborted ? { ok: false, problem: 'cancelled' } : { ok: false, problem: 'notRunning' };
  }
  if (!response.ok || !response.body) return { ok: false, problem: 'provider', detail: `${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`.trim() };
  let text = '';
  let model = request.model;
  let atLimit = false;
  try {
    for await (const data of serverSentData(response.body)) {
      if (data === '[DONE]') break;
      const event = JSON.parse(data) as { model?: string; choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[] };
      if (event.model) model = event.model;
      if (event.choices?.[0]?.finish_reason === 'length') atLimit = true;
      const delta = event.choices?.[0]?.delta;
      if (delta?.reasoning_content) request.onThinking?.();
      if (delta?.content) {
        text += delta.content;
        request.onText(delta.content);
      }
    }
  } catch (error) {
    if (request.signal?.aborted) return { ok: false, problem: 'cancelled' };
    return { ok: false, problem: 'provider', detail: error instanceof Error ? error.message : String(error) };
  }
  return finished(text, model, atLimit);
}

/** The data of each server-sent event ("data: …" lines), as the stream arrives. */
export async function* serverSentData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, '');
      buffer = buffer.slice(end + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
  const last = buffer.trim();
  if (last.startsWith('data:')) yield last.slice(5).trim();
}

function problemOf(error: unknown): { problem: ConnectionProblem; detail?: string } {
  if (error instanceof Anthropic.AuthenticationError) return { problem: 'badKey' };
  if (error instanceof Anthropic.PermissionDeniedError) return { problem: 'denied' };
  if (error instanceof Anthropic.RateLimitError) return { problem: 'rateLimit' };
  if (error instanceof Anthropic.APIConnectionError) return { problem: 'network' };
  if (error instanceof Anthropic.APIError) return { problem: 'provider', detail: `${error.status ?? ''} ${error.message}`.trim() };
  return { problem: 'provider', detail: error instanceof Error ? error.message : String(error) };
}
