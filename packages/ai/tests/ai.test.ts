import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AI_OFF, applyPolicy, allowedProviders, DEFAULT_AI_SETTINGS, parseAiPolicy, parseAiSettings, PROVIDERS } from '@kalketa/ai';
import { testConnection, type ClientFactory } from '@kalketa/ai/connect';

describe('AI settings', () => {
  it('are off until the user picks a provider', () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe(AI_OFF);
    expect(parseAiSettings(undefined)).toEqual(DEFAULT_AI_SETTINGS);
    expect(parseAiSettings({ provider: 'unknown', model: 'x' })).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('fall back to the default model of the provider', () => {
    expect(parseAiSettings({ provider: 'anthropic' })).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(parseAiSettings({ provider: 'anthropic', model: 'claude-sonnet-5-5' }).model).toBe('claude-sonnet-5-5');
  });

  it('offer Claude first, with a key', () => {
    expect(PROVIDERS[0]).toMatchObject({ id: 'anthropic', needsKey: true, local: false });
  });
});

describe('company rules', () => {
  const claude = { provider: 'anthropic', model: 'claude-opus-5-5' };

  it('switch the AI off for everyone', () => {
    const policy = parseAiPolicy({ disabled: true });
    expect(allowedProviders(policy)).toEqual([]);
    expect(applyPolicy(claude, policy)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it('limit providers and models', () => {
    expect(applyPolicy(claude, parseAiPolicy({ allowedProviders: ['local'] }))).toEqual(DEFAULT_AI_SETTINGS);
    expect(applyPolicy(claude, parseAiPolicy({ allowedModels: ['claude-haiku-4-5'] }))).toEqual(DEFAULT_AI_SETTINGS);
    expect(applyPolicy(claude, parseAiPolicy({ allowedProviders: ['anthropic'], instructions: 'Eurocodes' }))).toEqual(claude);
  });

  it('leave out what is malformed instead of guessing', () => {
    expect(parseAiPolicy({ disabled: 'yes', allowedProviders: 'anthropic', instructions: 3 })).toEqual({});
    expect(parseAiPolicy('nonsense')).toEqual({});
  });
});

describe('connection test', () => {
  const listing = (models: { id: string; display_name: string }[]): ClientFactory => () => ({
    models: {
      async *list() {
        yield* models;
      },
    },
  });
  const failing = (error: Error): ClientFactory => () => ({
    models: {
      // eslint-disable-next-line require-yield
      async *list() {
        throw error;
      },
    },
  });

  it('returns the models the key can use', async () => {
    const result = await testConnection('anthropic', ' sk-test ', listing([{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }]));
    expect(result).toEqual({ ok: true, models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }] });
  });

  it('asks for a key before calling anything', async () => {
    expect(await testConnection('anthropic', '  ', failing(new Error('must not run')))).toEqual({ ok: false, problem: 'noKey' });
    expect(await testConnection('nobody', 'k')).toEqual({ ok: false, problem: 'noProvider' });
  });

  it('turns errors into codes', async () => {
    const headers = new Headers();
    expect(await testConnection('anthropic', 'k', failing(new Anthropic.AuthenticationError(401, undefined, 'bad', headers)))).toMatchObject({ ok: false, problem: 'badKey' });
    expect(await testConnection('anthropic', 'k', failing(new Anthropic.RateLimitError(429, undefined, 'slow', headers)))).toMatchObject({ ok: false, problem: 'rateLimit' });
    expect(await testConnection('anthropic', 'k', failing(new Anthropic.APIConnectionError({ message: 'offline' })))).toMatchObject({ ok: false, problem: 'network' });
    expect(await testConnection('anthropic', 'k', failing(new Error('odd')))).toEqual({ ok: false, problem: 'provider', detail: 'odd' });
  });
});
