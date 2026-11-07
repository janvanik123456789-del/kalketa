import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AI_OFF, applyPolicy, briefing, languageName, allowedProviders, DEFAULT_AI_SETTINGS, parseAiPolicy, parseAiSettings, prepareBriefing, providerById, PROVIDERS, QUESTION_MARK, withSheetState } from '@kalketa/ai';
import { chat, discoverLocal, testConnection, tryModel, type ClientFactory } from '@kalketa/ai/connect';

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
    expect(applyPolicy(claude, parseAiPolicy({ allowedModels: ['claude-haiku-5-5'] }))).toEqual(DEFAULT_AI_SETTINGS);
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
    expect(await testConnection('server', undefined, { fetch: fetchFn }, 'http://127.0.0.1:9000/v1')).toMatchObject({ ok: true, models: [{ id: 'llama' }] });
    expect(await testConnection('server', undefined, { fetch: fetchFn }, 'ftp://x')).toEqual({ ok: false, problem: 'badUrl' });
    // LM Studio keeps its own address.
    expect(await testConnection('lmstudio', undefined, { fetch: fetchFn }, 'http://127.0.0.1:9000')).toEqual({ ok: false, problem: 'notRunning' });
    expect(parseAiSettings({ provider: 'server', url: 'http://10.0.0.5:8080/' })).toEqual({ provider: 'server', model: '', url: 'http://10.0.0.5:8080' });
    expect(parseAiSettings({ provider: 'server', url: 'file:///c:/x' })).toEqual({ provider: 'server', model: '' });
  });

  it('let the user see that the model answers', async () => {
    const asked: string[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      asked.push(`${String(url)} ${String(init?.body)}`);
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: ' OK ' } }] }), { status: 200 });
    }) as typeof fetch;
    const result = await tryModel('server', 'qwen', { fetch: fetchFn }, 'http://127.0.0.1:8080/v1');
    expect(result).toMatchObject({ ok: true, reply: 'OK' });
    expect(asked[0]).toContain('http://127.0.0.1:8080/v1/chat/completions');
    expect(asked[0]).toContain('"model":"qwen"');
    // Claude is not asked: every answer costs.
    expect(await tryModel('anthropic', 'claude-opus-5-5', { fetch: fetchFn })).toEqual({ ok: false, problem: 'noProvider' });
  });

  describe('that ask for a key', () => {
    // A server set to ask for a key (LM Studio with authentication, llama.cpp --api-key): 401 without the right one.
    const guarded = (seen: string[] = []): typeof fetch =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        const auth = new Headers(init?.headers).get('authorization') ?? '';
        seen.push(auth);
        if (auth !== 'Bearer tajny') return new Response('{"error":"unauthorized"}', { status: 401 });
        if (String(url).endsWith('/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'qwen' }] }), { status: 200 });
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }), { status: 200 });
      }) as typeof fetch;

    it('get it as a bearer token, and none without it', async () => {
      const seen: string[] = [];
      expect(await testConnection('server', ' tajny ', { fetch: guarded(seen) })).toMatchObject({ ok: true, models: [{ id: 'qwen' }] });
      expect(await tryModel('lmstudio', 'qwen', { fetch: guarded(seen) }, undefined, 'tajny')).toMatchObject({ ok: true, reply: 'OK' });
      expect(seen).toEqual(['Bearer tajny', 'Bearer tajny']);
      const open: string[] = [];
      await testConnection('ollama', undefined, { fetch: guarded(open) });
      expect(open).toEqual(['']);
    });

    it('say the key is missing or not taken, not a server error', async () => {
      expect(await testConnection('server', undefined, { fetch: guarded() })).toEqual({ ok: false, problem: 'noKey' });
      expect(await testConnection('server', 'spatny', { fetch: guarded() })).toEqual({ ok: false, problem: 'badKey' });
      expect(await tryModel('server', 'qwen', { fetch: guarded() })).toEqual({ ok: false, problem: 'noKey' });
      expect(await chat({ provider: 'server', model: 'qwen', apiKey: 'spatny', system: '', turns: [], onText: () => {} }, { fetch: guarded() })).toEqual({ ok: false, problem: 'badKey' });
    });

    it('are found running without the key, with no models yet', async () => {
      const found = await discoverLocal({ fetch: guarded() });
      expect(found['lmstudio']).toEqual([]);
      expect(await discoverLocal({ fetch: guarded() }, { lmstudio: 'tajny' })).toMatchObject({ lmstudio: [{ id: 'qwen' }] });
    });

    it('offer the field for the key, which may stay empty', () => {
      for (const id of ['lmstudio', 'ollama', 'server']) expect(providerById(id)).toMatchObject({ needsKey: false, optionalKey: true });
      expect(providerById('anthropic')).toMatchObject({ needsKey: true });
    });
  });

  it('keep an empty model until the server is asked', () => {
    expect(parseAiSettings({ provider: 'lmstudio' })).toEqual({ provider: 'lmstudio', model: '' });
  });
});

describe('briefing', () => {
  const sheet = { title: 'Beam', source: 'L := 6 m\nM := q·L²/8', findings: ['line 2: error E-UNDEFINED: q is not defined'] };

  it('shows the auxiliary calculations of the sheet, numbered, and says how to change them', () => {
    const text = briefing({ language: 'cs', sheet: { ...sheet, auxiliary: [{ name: 'Pomocný výpočet', source: 'q := 12 kN/m', findings: ['line 1 = 12 kN/m'] }, { name: 'Prázdná', source: '' }] } });
    expect(text).toContain('### Layer "Pomocný výpočet"\n  1 | q := 12 kN/m');
    expect(text).toContain('line 1 = 12 kN/m');
    expect(text).toContain('### Layer "Prázdná"\n(empty)');
    expect(text).toContain('A change block changes only the printed sheet');
  });

  it('is English, asks for answers in the user language and numbers the lines', () => {
    const text = briefing({ language: 'cs', sheet, languageGuide: 'Built-in functions: sqrt(x).' });
    expect(languageName('cs')).toBe('Czech');
    expect(text).toContain('Answer in Czech');
    expect(text).toContain('  1 | L := 6 m');
    expect(text).toContain('  2 | M := q·L²/8');
    expect(text).toContain('line 2: error E-UNDEFINED');
    expect(text).toContain('Built-in functions: sqrt(x).');
    expect(text).toContain('never change the calculation');
  });

  it('puts the company rules last', () => {
    const prepared = prepareBriefing({ language: 'en', sheet: { ...sheet, findings: [] }, companyInstructions: 'Eurocodes with Czech national annexes.' });
    expect(prepared.text.trimEnd().endsWith('Eurocodes with Czech national annexes.')).toBe(true);
    expect(prepared.state).toContain('no errors and no failed checks');
  });

  it('keeps the start of a conversation the same while the sheet changes, so a server reads only what is new', () => {
    const before = prepareBriefing({ language: 'cs', sheet: { ...sheet, findings: [] }, languageGuide: 'Guide.', python: { numpy: false } });
    const after = prepareBriefing({ language: 'cs', sheet: { ...sheet, source: `${sheet.source}\nq := 12 kN/m`, findings: ['line 3 = 12 kN/m'] }, languageGuide: 'Guide.', python: { numpy: false }, query: 'jiná otázka' });
    expect(after.text).toBe(before.text);
    expect(before.text).not.toContain('M := q·L²/8');
    expect(after.state).toContain('3 | q := 12 kN/m');
    const asked = [
      { role: 'user' as const, text: 'Přesuň obrázky.' },
      { role: 'assistant' as const, text: 'Hotovo.' },
      { role: 'user' as const, text: 'Spočítej část 1.' },
    ];
    const sent = withSheetState(asked, after.state);
    // The turns before the latest question go as they were; the state of the sheet and the question are the last message.
    expect(sent.slice(0, 2)).toEqual(asked.slice(0, 2));
    expect(sent[2]!.text.startsWith('=== The sheet as it is now ===\n')).toBe(true);
    expect(sent[2]!.text.endsWith(`${QUESTION_MARK}\nSpočítej část 1.`)).toBe(true);
  });

  it('sends an earlier question exactly as it went, with the sheet as it was then', () => {
    const first = prepareBriefing({ language: 'cs', sheet: { ...sheet, findings: [] } });
    const asked = [{ role: 'user' as const, text: 'Spočítej část 1.' }];
    const went = withSheetState(asked, first.state)[0]!.text;
    // The answer came; the sheet changed; the next question goes with the new state, the first one as it went.
    const later = prepareBriefing({ language: 'cs', sheet: { ...sheet, source: `${sheet.source}\nq := 12 kN/m`, findings: [] } });
    const turns = [{ role: 'user' as const, text: 'Spočítej část 1.', sent: went }, { role: 'assistant' as const, text: 'Hotovo.', reasoning: 'Nejdřív reakce.' }, { role: 'user' as const, text: 'Ověř to.' }];
    const next = withSheetState(turns, later.state);
    expect(next[0]!.text).toBe(went);
    expect(next[1]).toMatchObject({ text: 'Hotovo.', reasoning: 'Nejdřív reakce.' });
    expect(next[2]!.text).toContain('q := 12 kN/m');
    expect(next[0]!.text).not.toContain('q := 12 kN/m');
  });
});

describe('chat with a local server', () => {
  const streaming = (events: string[], seen: { body?: string } = {}): typeof fetch =>
    (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.body = String(init?.body);
      const bytes = new TextEncoder().encode(events.join(''));
      // Arrives in two pieces, split inside an event.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 25));
          controller.enqueue(bytes.slice(25));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
  const event = (delta: object) => `data: ${JSON.stringify({ model: 'qwen', choices: [{ delta }] })}\n\n`;

  it('asks again without thinking when a local model thinks past the limit', async () => {
    const bodies: string[] = [];
    let cut = 0;
    const thinker = event({ reasoning_content: 'x'.repeat(100) });
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      // The first time it thinks on and on; asked again, it answers at once.
      const events = bodies.length === 1 ? Array.from({ length: 20 }, () => thinker) : [event({ content: 'Hned.' }), 'data: [DONE]\n\n'];
      return streaming(events)(url, init);
    }) as typeof fetch;
    const result = await chat({ provider: 'server', model: 'qwen', system: '', turns: [], thinkingLimit: 100, onText: () => {}, onThinkingCut: () => cut++ }, { fetch: fetchFn });
    expect(result).toEqual({ ok: true, text: 'Hned.', model: 'qwen', thinkingCut: true });
    expect(cut).toBe(1);
    expect(JSON.parse(bodies[1]!)).toMatchObject({ reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } });
    // Without a limit it thinks as long as it likes.
    const free = await chat({ provider: 'server', model: 'qwen', system: '', turns: [], onText: () => {} }, { fetch: streaming([thinker, thinker, event({ content: 'Pak.' }), 'data: [DONE]\n\n']) });
    expect(free).toEqual({ ok: true, text: 'Pak.', model: 'qwen' });
  });

  it('streams the answer piece by piece and reports thinking', async () => {
    const pieces: string[] = [];
    const thinking: string[] = [];
    const seen: { body?: string } = {};
    const fetchFn = streaming([event({ reasoning_content: 'hmm' }), event({ content: 'Řádek 3 ' }), event({ content: 'počítá moment.' }), 'data: [DONE]\n\n'], seen);
    const result = await chat(
      { provider: 'server', model: 'qwen', system: 'SYSTEM', turns: [{ role: 'user', text: 'Co je M?' }], onText: (t) => pieces.push(t), onThinking: (t) => thinking.push(t) },
      { fetch: fetchFn },
    );
    expect(result).toEqual({ ok: true, text: 'Řádek 3 počítá moment.', model: 'qwen' });
    expect(pieces).toEqual(['Řádek 3 ', 'počítá moment.']);
    expect(thinking).toEqual(['hmm']);
    const body = JSON.parse(seen.body!) as { stream: boolean; messages: { role: string; content: string }[]; reasoning_effort?: string };
    expect(body.stream).toBe(true);
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.messages).toEqual([{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'Co je M?' }]);
  });

  it('sends an answer back with what the model thought before it', async () => {
    const seen: { body?: string } = {};
    const turns = [
      { role: 'user' as const, text: 'Spočítej.' },
      { role: 'assistant' as const, text: 'Hotovo.', reasoning: 'Nejdřív reakce.' },
      { role: 'user' as const, text: 'Ověř.' },
    ];
    await chat({ provider: 'server', model: 'qwen', system: 'S', turns, onText: () => {} }, { fetch: streaming([event({ content: 'OK' })], seen) });
    const messages = JSON.parse(seen.body!).messages;
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Hotovo.', reasoning_content: 'Nejdřív reakce.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Spočítej.' });
  });

  it('passes the thinking depth the user chose', async () => {
    const seen: { body?: string } = {};
    await chat({ provider: 'server', model: 'qwen', system: '', turns: [], effort: 'low', onText: () => {} }, { fetch: streaming([event({ content: 'OK' })], seen) });
    expect(JSON.parse(seen.body!).reasoning_effort).toBe('low');
    expect(parseAiSettings({ provider: 'server', effort: 'low' })).toMatchObject({ effort: 'low' });
    await chat({ provider: 'server', model: 'qwen', system: '', turns: [], effort: 'none', onText: () => {} }, { fetch: streaming([event({ content: 'OK' })], seen) });
    expect(JSON.parse(seen.body!)).toMatchObject({ reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } });
    expect(parseAiSettings({ provider: 'server', effort: 'extreme' })).not.toHaveProperty('effort');
    expect(parseAiSettings({ provider: 'server', thinkingLimit: 2000 })).toMatchObject({ thinkingLimit: 2000 });
    expect(parseAiSettings({ provider: 'server', thinkingLimit: 123 })).not.toHaveProperty('thinkingLimit');
  });

  it('says when the server does not run, or Claude has no key', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await chat({ provider: 'ollama', model: 'x', system: '', turns: [], onText: () => {} }, { fetch: down })).toEqual({ ok: false, problem: 'notRunning' });
    expect(await chat({ provider: 'anthropic', model: 'claude-opus-5-5', system: '', turns: [], onText: () => {} })).toEqual({ ok: false, problem: 'noKey' });
  });
});

describe('an answer that hits the length limit', () => {
  const stream = (events: object[]): typeof fetch =>
    (async () => {
      const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
      return new Response(new TextEncoder().encode(body), { status: 200 });
    }) as typeof fetch;
  const ask = (events: object[]) => chat({ provider: 'server', model: 'qwen', system: '', turns: [{ role: 'user', text: 'Analyzuj výpočet.' }], onText: () => {} }, { fetch: stream(events) });

  it('with only thinking gives no empty answer but says the model ran out', async () => {
    const result = await ask([{ choices: [{ delta: { reasoning_content: 'dlouhé přemýšlení' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }]);
    expect(result).toEqual({ ok: false, problem: 'cutOff' });
  });

  it('with some text keeps it, marked as cut short', async () => {
    const result = await ask([{ choices: [{ delta: { content: 'Výpočet posuzuje' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }]);
    expect(result).toEqual({ ok: true, text: 'Výpočet posuzuje', model: 'qwen', truncated: true });
  });

  it('with nothing at all, not at the limit, says there is no answer', async () => {
    expect(await ask([{ choices: [{ delta: {}, finish_reason: 'stop' }] }])).toEqual({ ok: false, problem: 'empty' });
  });
});

describe('checks in Python come after the sheet', () => {
  it('the rule says so first, before how to write a check', async () => {
    const { pythonRule } = await import('../src/pythonChecks.js');
    const rule = pythonRule(false);
    expect(rule.indexOf('Order, always: the calculation goes into the sheet first')).toBe(2);
    expect(rule).toContain('never first, never instead of the sheet');
    expect(rule).toContain('the check comes in the same answer right after the change block');
    expect(rule).toContain('Do not put it off to a later answer');
  });
});
