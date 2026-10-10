/**
 * AI settings belong to the program, never to a sheet (ch. 9.1). Keys are not
 * here: the desktop application keeps them, encrypted when the user wants
 * them remembered.
 */

import { providerById, serverUrl } from './providers.js';

export interface AiSettings {
  /** Provider id, or 'none' when the AI is switched off (the default). */
  readonly provider: string;
  readonly model: string;
  /** Address of a server whose provider lets the user give one. */
  readonly url?: string;
  /** How long the model may think before it answers; absent = as the model or server decides. */
  readonly effort?: AiEffort;
  /**
   * A local model may think this many tokens at most; past it the question goes again without
   * thinking. Absent: DEFAULT_THINKING_LIMIT; 0: no limit.
   */
  readonly thinkingLimit?: number;
}

export const THINKING_LIMITS: readonly number[] = [0, 2000, 4000, 8000];
export const DEFAULT_THINKING_LIMIT = 4000;

/** 'none': a local model answers at once, without thinking (Claude takes it as low). */
export type AiEffort = 'none' | 'low' | 'medium' | 'high';
export const AI_EFFORTS: readonly AiEffort[] = ['none', 'low', 'medium', 'high'];

export const AI_OFF = 'none';

export const DEFAULT_AI_SETTINGS: AiSettings = { provider: AI_OFF, model: '' };

/** Settings read back from storage; anything unknown falls back to the defaults. */
export function parseAiSettings(value: unknown): AiSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_AI_SETTINGS;
  const raw = value as Record<string, unknown>;
  const provider = typeof raw['provider'] === 'string' ? providerById(raw['provider']) : undefined;
  if (!provider) return DEFAULT_AI_SETTINGS;
  const model = typeof raw['model'] === 'string' && raw['model'].trim() !== '' ? raw['model'] : provider.defaultModel;
  const url = provider.urlEditable && typeof raw['url'] === 'string' ? serverUrl(raw['url']) : undefined;
  const effort = AI_EFFORTS.find((e) => e === raw['effort']);
  const thinkingLimit = THINKING_LIMITS.find((n) => n === raw['thinkingLimit']);
  return { provider: provider.id, model, ...(url ? { url } : {}), ...(effort ? { effort } : {}), ...(thinkingLimit !== undefined ? { thinkingLimit } : {}) };
}
