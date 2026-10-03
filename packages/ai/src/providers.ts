/**
 * Providers the user can pick in the settings: Claude, and servers with the
 * OpenAI-style API that need no key: LM Studio, Ollama, or any other at an
 * address the user gives (e.g. llama.cpp or an own server).
 */

export interface ModelChoice {
  readonly id: string;
  readonly name: string;
}

export interface ProviderInfo {
  readonly id: string;
  readonly name: string;
  /** How the program talks to it: Claude's own API, or the OpenAI-style API local servers offer. */
  readonly api: 'anthropic' | 'openai-compatible';
  /** Shows the field for an API key. A local server needs none. */
  readonly needsKey: boolean;
  /** Runs on this computer; nothing leaves it. */
  readonly local: boolean;
  /** Where a local server listens by default. */
  readonly baseUrl?: string;
  /** The user may give another address (AiSettings.url). */
  readonly urlEditable?: boolean;
  /** Where the user gets a key. */
  readonly keyUrl?: string;
  /** Empty for a local server: its first model is used. */
  readonly defaultModel: string;
  /** Offered before the provider is asked for its own list. */
  readonly models: readonly ModelChoice[];
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    api: 'anthropic',
    needsKey: true,
    local: false,
    keyUrl: 'https://platform.claude.com/docs/en/get-api-key',
    defaultModel: 'claude-opus-5-5',
    models: [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
  },
  { id: 'lmstudio', name: 'LM Studio', api: 'openai-compatible', needsKey: false, local: true, baseUrl: 'http://127.0.0.1:1234', defaultModel: '', models: [] },
  { id: 'ollama', name: 'Ollama', api: 'openai-compatible', needsKey: false, local: true, baseUrl: 'http://127.0.0.1:11434', defaultModel: '', models: [] },
  { id: 'server', name: 'Other server', api: 'openai-compatible', needsKey: false, local: true, baseUrl: 'http://127.0.0.1:8080', urlEditable: true, defaultModel: '', models: [] },
];

/** An address a server may have: http or https, nothing else. */
export function serverUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.replace(/\/+$/, '') : undefined;
  } catch {
    return undefined;
  }
}

/** Runs on this computer, so the data stay here. */
export function isLoopback(url: string): boolean {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function providerById(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
