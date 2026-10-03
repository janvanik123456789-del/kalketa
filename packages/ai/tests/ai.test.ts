import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AI_OFF, applyPolicy, allowedProviders, DEFAULT_AI_SETTINGS, parseAiPolicy, parseAiSettings, PROVIDERS } from '@kalketa/ai';
import { discoverLocal, testConnection, type ClientFactory } from '@kalketa/ai/connect';

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
    const result = await testConnection('anthropic', ' sk-test ', { anthropic: listing([{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }]) });
    expect(result).toEqual({ ok: true, models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }] });
  });

  it('asks for a key before calling anything', async () => {
    expect(await testConnection('anthropic', '  ', { anthropic: failing(new Error('must not run')) })).toEqual({ ok: false, problem: 'noKey' });
    expect(await testConnection('nobody', 'k')).toEqual({ ok: false, problem: 'noProvider' });
  });

  it('turns errors into codes', async () => {
    const headers = new Headers();
    expect(await testConnection('anthropic', 'k', { anthropic: failing(new Anthropic.AuthenticationError(401, undefined, 'bad', headers)) })).toMatchObject({ ok: false, problem: 'badKey' });
    expect(await testConnection('anthropic', 'k', { anthropic: failing(new Anthropic.RateLimitError(429, undefined, 'slow', headers)) })).toMatchObject({ ok: false, problem: 'rateLimit' });
    expect(await testConnection('anthropic', 'k', { anthropic: failing(new Anthropic.APIConnectionError({ message: 'offline' })) })).toMatchObject({ ok: false, problem: 'network' });
    expect(await testConnection('anthropic', 'k', { anthropic: failing(new Error('odd')) })).toEqual({ ok: false, problem: 'provider', detail: 'odd' });
  });
});

describe('local servers', () => {
  const serving = (byPort: Record<string, unknown>): typeof fetch =>
    (async (url: string | URL | Request) => {
      const port = new URL(String(url)).port;
      if (!(port in byPort)) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(byPort[port]), { status: 200 });
    }) as typeof fetch;

  it('need no key and list their models, without embedding models', async () => {
    const fetchFn = serving({ '1234': { data: [{ id: 'qwen/qwen3.5-9b' }, { id: 'text-embedding-nomic' }] } });
    expect(await testConnection('lmstudio', undefined, { fetch: fetchFn })).toEqual({ ok: true, models: [{ id: 'qwen/qwen3.5-9b', name: 'qwen/qwen3.5-9b' }] });
  });

  it('say when the server does not run', async () => {
    expect(await testConnection('ollama', undefined, { fetch: serving({}) })).toEqual({ ok: false, problem: 'notRunning' });
  });

  it('are found when they run', async () => {
    const found = await discoverLocal({ fetch: serving({ '11434': { data: [{ id: 'llama3' }] } }) });
    expect(found).toEqual({ ollama: [{ id: 'llama3', name: 'llama3' }] });
  });

  it('can be at an address the user gives, http or https only', async () => {
    const fetchFn = serving({ '8080': { data: [{ id: 'qwen' }] }, '9000': { data: [{ id: 'llama' }] } });
    expect(await testConnection('server', undefined, { fetch: fetchFn })).toMatchObject({ ok: true, models: [{ id: 'qwen' }] });
    expect(await testConnection('server', undefined, { fetch: fetchFn }, 'http://127.0.0.1:9000/')).toMatchObject({ ok: true, models: [{ id: 'llama' }] });
    expect(await testConnection('server', undefined, { fetch: fetchFn }, 'ftp://x')).toEqual({ ok: false, problem: 'badUrl' });
    // LM Studio keeps its own address.
    expect(await testConnection('lmstudio', undefined, { fetch: fetchFn }, 'http://127.0.0.1:9000')).toEqual({ ok: false, problem: 'notRunning' });
    expect(parseAiSettings({ provider: 'server', url: 'http://10.0.0.5:8080/' })).toEqual({ provider: 'server', model: '', url: 'http://10.0.0.5:8080' });
    expect(parseAiSettings({ provider: 'server', url: 'file:///c:/x' })).toEqual({ provider: 'server', model: '' });
  });

  it('keep an empty model until the server is asked', () => {
    expect(parseAiSettings({ provider: 'lmstudio' })).toEqual({ provider: 'lmstudio', model: '' });
  });
});
