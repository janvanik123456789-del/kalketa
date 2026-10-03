/**
 * Providers the user can pick in the settings. For now only Claude; local
 * servers (Ollama, LM Studio) come later and need no key.
 */

export interface ModelChoice {
  readonly id: string;
  readonly name: string;
}

export interface ProviderInfo {
  readonly id: string;
  readonly name: string;
  /** Shows the field for an API key. A local server needs none. */
  readonly needsKey: boolean;
  /** Runs on this computer; nothing leaves it. */
  readonly local: boolean;
  /** Where the user gets a key. */
  readonly keyUrl?: string;
  readonly defaultModel: string;
  /** Offered before the provider is asked for its own list. */
  readonly models: readonly ModelChoice[];
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
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
];

export function providerById(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
