// Desktop smoke test: drives the built desktop app with real mouse and keyboard
// input and reports what failed. Run after `npm run build:desktop` (`npm run smoke` does both).
//
// It writes its own test sheets (AI notes, a block) into a temporary folder, so it
// needs nothing outside the repo and works wherever the repo lives.
// KALKETA_SMOKE_EXE=<path to Kalketa.exe> runs the same test on a packaged build.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDocument, writeSheetFile } from '@kalketa/sheet';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'packages', 'desktop');
const out = mkdtempSync(join(tmpdir(), 'kalketa-smoke-run-'));

// A sheet whose AI notes an AI wrote.
const ai = newDocument('AI smoke', 'L := 6 m\nw := L / 250\n');
const aiLayers = [...ai.layers.filter((l) => l.kind !== 'ai'), { id: 'ai', kind: 'ai', visible: true, locked: false, appendix: false, text: '# AI review\n\nPrůhyb vyhovuje.\n' }];
const aiFile = join(out, 'ai.kalk');
writeFileSync(aiFile, await writeSheetFile({ ...ai, layers: aiLayers }));

// A sheet that uses a block: 10 kN/m · (6 m)² / 8 = 45 kN·m.
const beam = '# Prostý nosník\n@version 1.2\ninput L := 5 m\ninput q := 12 kN/m\nM_max := q·L²/8 | kN·m';
const blocks = newDocument('Blocks smoke', 'N1 := Prosty_nosnik(L: 6 m, q: 10 kN/m)\nM := N1.M_max');
const blocksFile = join(out, 'blocks.kalk');
writeFileSync(blocksFile, await writeSheetFile({ ...blocks, blocks: new Map([['Prosty_nosnik', { source: beam, version: '1.2', origin: 'Prosty nosnik.kalk' }]]) }));

// A stand-in for the Claude API: accepts one key and lists two models, so the
// AI settings are tested end to end without the internet or a real key.
// Requests the app sent to the fake servers: none may come before the user switches the AI on.
let requests = 0;
const fakeApi = createServer((request, response) => {
  if (request.url === '/stats') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ requests }));
    return;
  }
  requests++;
  // A local server (stands in for LM Studio): no key, an embedding model that must not be offered.
  if (request.url === '/local/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'local-smoke-7b', object: 'model' }, { id: 'text-embedding-smoke', object: 'model' }] }));
    return;
  }
  if (request.url === '/local/v1/chat/completions' && request.method === 'POST') {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const body = JSON.parse(raw);
      if (!body.stream) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
        return;
      }
      // The chat: answers in pieces what it was given, so the test sees the briefing arrived.
      const system = body.messages[0]?.content ?? '';
      const question = body.messages.at(-1)?.content ?? '';
      const title = /The sheet "([^"]+)"/.exec(system)?.[1] ?? '?';
      // Cites the first theory section with words from it, and a section the sheet does not have.
      const section = /^\[(T\d+)\] [^\n]+\n(\S+ \S+ \S+)/m.exec(system);
      const cites = section ? `"${section[2]}" [${section[1]}] a [T99]; ` : 'bez teorie; ';
      // A section of a theory library, if the briefing has one: cited by its key.
      const fromLibrary = /^\[([A-Z][A-Z0-9]*:T\d+)\] [^\n]+\n(\S+ \S+)/m.exec(system);
      const pieces = [`list: **${title}**; `, `jazyk: ${system.includes('Answer in Czech') ? 'Czech' : '?'}; `, `výsledky: ${system.includes('Computed results') ? 'ano' : 'ne'}; `, `úsilí: ${body.reasoning_effort ?? '-'}; `, `paměť: ${system.includes('Memory of this sheet') ? 'ano' : 'ne'}; `, cites, fromLibrary ? `knihovna: "${fromLibrary[2]}" [${fromLibrary[1]}]; ` : '', `otázka: ` + String.fromCharCode(96) + question + String.fromCharCode(96), ['', '', '| Profil | G |', '|---|---:|', '| IPE 220 | 26.2 |'].join(String.fromCharCode(10))];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const event = (data) => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}${String.fromCharCode(10).repeat(2)}`;
      // The end of a conversation: the model rewrites the sheet's memory.
      if (question.startsWith('The conversation ends here.')) {
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: 'Intent: smoke memory.' } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Analyzuj…": a model that thinks until the length limit and writes nothing.
      if (question.startsWith('Analyzuj')) {
        response.write(event({ choices: [{ delta: { reasoning_content: 'thinking a lot' } }] }));
        response.write(event({ choices: [{ delta: {}, finish_reason: 'length' }] }));
        response.end(event('[DONE]'));
        return;
      }
      response.write(event({ choices: [{ delta: { reasoning_content: 'thinking' } }] }));
      for (const piece of pieces) response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: piece } }] }));
      response.end(event('[DONE]'));
    });
    return;
  }
  const good = request.headers['x-api-key'] === 'sk-smoke-good';
  response.writeHead(good ? 200 : 401, { 'content-type': 'application/json' });
  const model = (id, name) => ({ type: 'model', id, display_name: name, created_at: '2026-01-01T00:00:00Z', capabilities: null, max_input_tokens: null, max_tokens: null });
  response.end(
    JSON.stringify(
      good && request.url?.startsWith('/v1/models')
        ? { data: [model('claude-opus-5-5', 'Claude Opus 5.5'), model('claude-smoke-1', 'Claude Smoke 1')], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-smoke-1' }
        : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
    ),
  );
});
await new Promise((ready) => fakeApi.listen(0, '127.0.0.1', ready));

const electron = createRequire(join(desktop, 'package.json'))('electron');
const env = {
  ...process.env,
  KALKETA_SMOKE_TEST: join(out, 'smoke.pdf'),
  KALKETA_SMOKE_AI: aiFile,
  KALKETA_SMOKE_BLOCKS: blocksFile,
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakeApi.address().port}`,
  // Never the user's own local servers: LM Studio and the other server are the fake one, Ollama does not run.
  KALKETA_AI_URL_LMSTUDIO: `http://127.0.0.1:${fakeApi.address().port}/local`,
  KALKETA_AI_URL_OLLAMA: 'http://127.0.0.1:9',
  KALKETA_AI_URL_SERVER: `http://127.0.0.1:${fakeApi.address().port}/local`,
  // Theory libraries go to a folder of the test, never the user's Documents.
  KALKETA_THEORY_USER_DIR: join(out, 'teorie'),
};
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.env.KALKETA_SMOKE_EXE;
const child = spawn(packaged ?? electron, packaged ? [] : [desktop], { env, stdio: ['ignore', 'pipe', 'ignore'] });
let stdout = '';
child.stdout.on('data', (chunk) => (stdout += chunk));
await new Promise((done) => child.on('close', done));
fakeApi.close();

const line = stdout.split(/\r?\n/).find((l) => l.startsWith('{') && l.includes('"ok"'));
if (!line) {
  console.error('smoke: the app printed no result');
  process.exit(1);
}
const result = JSON.parse(line);
writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
// Checks that pass when false; every other true/false check passes when true.
const passWhenFalse = new Set(['aiDeletable', 'aiTabWhileEmpty', 'aiTabAfterClose']);
const failed = Object.entries({ ...result, ...result.layers })
  .filter(([key, value]) => key !== 'ok' && typeof value === 'boolean' && value === passWhenFalse.has(key))
  .map(([key]) => key);
console.log(result.ok ? 'smoke: OK' : `smoke: FAILED ${result.error ?? (failed.join(', ') || 'see the counts in main.ts')}`);
console.log(`smoke: screenshots and PDF in ${out}`);
process.exit(result.ok ? 0 : 1);
