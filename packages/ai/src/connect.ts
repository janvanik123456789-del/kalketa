/**
 * Talking to a provider: runs outside the editor (in the desktop main process),
 * where the key is kept. Results carry codes, the user interface words them.
 */

import Anthropic from '@anthropic-ai/sdk';
import { providerById, type ModelChoice } from './providers.js';

/** Why a connection failed; the editor turns the code into a message. */
export type ConnectionProblem = 'noProvider' | 'noKey' | 'badKey' | 'denied' | 'rateLimit' | 'network' | 'provider';

export type ConnectionResult = { readonly ok: true; readonly models: readonly ModelChoice[] } | { readonly ok: false; readonly problem: ConnectionProblem; readonly detail?: string };

/** The part of the Anthropic client used here, so tests can pass their own. */
export interface ModelLister {
  readonly models: { list(): AsyncIterable<{ readonly id: string; readonly display_name: string }> };
}

export type ClientFactory = (apiKey: string) => ModelLister;

// Only the key from the settings: no token or profile from the environment rides along.
// ANTHROPIC_BASE_URL is honoured, e.g. for a company proxy (and the smoke test's fake server).
const anthropicClient: ClientFactory = (apiKey) => new Anthropic({ apiKey, authToken: null, maxRetries: 1, timeout: 20_000 });

/**
 * Checks the key by asking for the list of models: no tokens are spent.
 * The list is what the user can then pick from.
 */
export async function testConnection(providerId: string, apiKey: string | undefined, client: ClientFactory = anthropicClient): Promise<ConnectionResult> {
  const provider = providerById(providerId);
  if (!provider) return { ok: false, problem: 'noProvider' };
  if (provider.needsKey && !apiKey?.trim()) return { ok: false, problem: 'noKey' };
  try {
    const models: ModelChoice[] = [];
    for await (const model of client(apiKey!.trim()).models.list()) models.push({ id: model.id, name: model.display_name });
    return { ok: true, models };
  } catch (error) {
    return { ok: false, ...problemOf(error) };
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
