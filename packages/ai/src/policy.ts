/**
 * Company rules (ch. 9.1): what an administrator allows. They take precedence
 * over the user's settings. Kept apart from the rest of the module so a
 * company can change them, or this file, without touching anything else.
 */

import { PROVIDERS, type ProviderInfo } from './providers.js';
import { AI_OFF, DEFAULT_AI_SETTINGS, type AiSettings } from './settings.js';

export interface AiPolicy {
  /** The AI is switched off for everyone. */
  readonly disabled?: boolean;
  /** Only these providers may be picked; all when missing. */
  readonly allowedProviders?: readonly string[];
  /** Only these models may be picked; all when missing. */
  readonly allowedModels?: readonly string[];
  /** Shared instructions for the model, e.g. "Eurocodes with the Czech national annexes". */
  readonly instructions?: string;
  /** The company folder of theory libraries (.kalkt), e.g. on a shared drive. */
  readonly theoryFolder?: string;
}

export const NO_POLICY: AiPolicy = {};

/** Providers the user may pick under the policy. */
export function allowedProviders(policy: AiPolicy): readonly ProviderInfo[] {
  if (policy.disabled) return [];
  return PROVIDERS.filter((p) => !policy.allowedProviders || policy.allowedProviders.includes(p.id));
}

export function modelAllowed(policy: AiPolicy, model: string): boolean {
  return !policy.allowedModels || policy.allowedModels.includes(model);
}

/** The settings that apply: what the policy forbids is switched off. */
export function applyPolicy(settings: AiSettings, policy: AiPolicy): AiSettings {
  if (settings.provider === AI_OFF) return settings;
  if (!allowedProviders(policy).some((p) => p.id === settings.provider)) return DEFAULT_AI_SETTINGS;
  if (!modelAllowed(policy, settings.model)) return DEFAULT_AI_SETTINGS;
  return settings;
}

/** A policy read from a file; anything malformed is left out rather than guessed. */
export function parseAiPolicy(value: unknown): AiPolicy {
  if (typeof value !== 'object' || value === null) return NO_POLICY;
  const raw = value as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) && v.every((s) => typeof s === 'string') ? (v as string[]) : undefined);
  const providers = strings(raw['allowedProviders']);
  const models = strings(raw['allowedModels']);
  return {
    ...(raw['disabled'] === true ? { disabled: true } : {}),
    ...(providers ? { allowedProviders: providers } : {}),
    ...(models ? { allowedModels: models } : {}),
    ...(typeof raw['instructions'] === 'string' ? { instructions: raw['instructions'] } : {}),
    ...(typeof raw['theoryFolder'] === 'string' && raw['theoryFolder'].trim() ? { theoryFolder: raw['theoryFolder'].trim() } : {}),
  };
}
