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
const fakeApi = createServer((request, response) => {
  // A local server (stands in for LM Studio): no key, an embedding model that must not be offered.
  if (request.url === '/local/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'local-smoke-7b', object: 'model' }, { id: 'text-embedding-smoke', object: 'model' }] }));
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
// Checks that pass when false; every other true/false check passes when true.
const passWhenFalse = new Set(['aiDeletable', 'aiTabWhileEmpty', 'aiTabAfterClose']);
const failed = Object.entries({ ...result, ...result.layers })
  .filter(([key, value]) => key !== 'ok' && typeof value === 'boolean' && value === passWhenFalse.has(key))
  .map(([key]) => key);
console.log(result.ok ? 'smoke: OK' : `smoke: FAILED ${result.error ?? (failed.join(', ') || 'see the counts in main.ts')}`);
console.log(`smoke: screenshots and PDF in ${out}`);
process.exit(result.ok ? 0 : 1);
