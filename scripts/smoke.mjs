// Desktop smoke test: drives the built desktop app with real mouse and keyboard
// input and reports what failed. Run after `npm run build:desktop` (`npm run smoke` does both).
//
// It writes its own test sheets (AI notes, a block) into a temporary folder, so it
// needs nothing outside the repo and works wherever the repo lives.
// KALKETA_SMOKE_EXE=<path to Kalketa.exe> runs the same test on a packaged build.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDocument, writeSheetFile } from '@kalketa/sheet';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'packages', 'desktop');
// What earlier runs left in the temporary folder (profiles, saved sheets, pictures): gone after two days.
const twoDaysAgo = Date.now() - 2 * 24 * 3600 * 1000;
for (const name of readdirSync(tmpdir()).filter((n) => n.startsWith('kalketa-smoke'))) {
  try {
    const path = join(tmpdir(), name);
    if (statSync(path).mtimeMs < twoDaysAgo) rmSync(path, { recursive: true, force: true });
  } catch {
    // In use or gone already: left for the next run.
  }
}
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
      // A formula read from a picture: the picture came, the formula goes back, a chain of equal forms as models write it.
      if (!body.stream && Array.isArray(body.messages?.[0]?.content) && body.messages[0].content.some((c) => c.type === 'image_url' && String(c.image_url?.url).startsWith('data:image/png;base64,'))) {
        response.writeHead(200, { 'content-type': 'application/json' });
        // A part of a scanned page read again: the text of the recognition, with what it read wrongly put right.
        const prompt = body.messages[0].content.find((c) => c.type === 'text')?.text ?? '';
        if (String(prompt).includes('scanned page of an engineering textbook')) {
          const ocr = String(prompt).split('Text from the recognition:')[1]?.trim() ?? '';
          const fixed = ocr.replace(/\n/g, ' ').replace('Ohybový moment', 'Ohybový moment σ_Kt');
          response.end(JSON.stringify({ object: 'chat.completion', model: 'local-smoke-7b', choices: [{ index: 0, message: { role: 'assistant', content: fixed }, finish_reason: 'stop' }] }));
          return;
        }
        // A figure is described, a formula read.
        const figure = body.messages[0].content.some((c) => c.type === 'text' && String(c.text).includes('figure from an engineering textbook'));
        // A figure is described from the text of the book around it, which must come with it.
        const withText = body.messages[0].content.some((c) => c.type === 'text' && String(c.text).includes('Ohybový moment a průhyb'));
        const content = figure ? (withText ? 'Průběh ohybového momentu prostého nosníku.' : 'No text came.') : 'M = F·a = a·F (7)';
        response.end(JSON.stringify({ object: 'chat.completion', model: 'local-smoke-7b', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
        return;
      }
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
      const fromLibraries = [...system.matchAll(/^\[([A-Z][A-Z0-9]*):(T\d+)\] [^\n]+\n(\S+ \S+)/gm)].filter((m, i, all) => all.findIndex((x) => x[1] === m[1]) === i);
      const pieces = [`list: **${title}**; `, `jazyk: ${system.includes('Answer in Czech') ? 'Czech' : '?'}; `, `výsledky: ${system.includes('Computed results') ? 'ano' : 'ne'}; `, `úsilí: ${body.reasoning_effort ?? '-'}; `, `paměť: ${system.includes('Memory of this sheet') ? 'ano' : 'ne'}; `, cites, fromLibraries.map((m) => `knihovna: "${m[3]}" [${m[1]}:${m[2]}]; `).join(''), `otázka: ` + String.fromCharCode(96) + question + String.fromCharCode(96), ['', '', '| Profil | G |', '|---|---:|', '| IPE 220 | 26.2 |'].join(String.fromCharCode(10))];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const event = (data) => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}${String.fromCharCode(10).repeat(2)}`;
      // The end of a conversation: the model rewrites the sheet's memory.
      if (question.startsWith('The conversation ends here.')) {
        // Wrapped in a code block, as models like to: the program keeps the memory without it.
        const fence = '`'.repeat(3);
        const lf = String.fromCharCode(10);
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: `${fence}${lf}Intent: smoke memory.${lf}${fence}` } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Přemýšlej dlouho": thinks on and on (past any limit) unless asked not to think at all.
      if (question.startsWith('Přemýšlej dlouho')) {
        if (body.reasoning_effort === 'none') {
          response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: 'Odpověď hned.' } }] }));
          response.end(event('[DONE]'));
          return;
        }
        let sent = 0;
        const think = () => {
          if (response.destroyed || sent++ > 200) return void response.end();
          response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { reasoning_content: 'hmm '.repeat(250) } }] }));
          setTimeout(think, 5);
        };
        think();
        return;
      }
      // A new calculation from its intent: questions first, then an outline, then the whole sheet replacing the empty one,
      // by the number of the user's turns; only when the briefing says so.
      if (system.includes('starts a new calculation from its intent')) {
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        const asked = body.messages.filter((m) => m.role === 'user').length;
        const lines = [...system.matchAll(/^ *(\d+) \| /gm)].map((m) => Number(m[1]));
        const text =
          asked === 1
            ? `záměr: otázky.${lf}1. Ocel S235? 2. Profil z tabulky IPE?`
            : asked === 2
              ? `záměr: osnova.${lf}1. Zadání 2. Ohybový moment 3. Posudek ohybu. Souhlasíte?`
              : `záměr: list.${lf}${lf}${fence}change 1-${Math.max(1, ...lines)}${lf}# Prostý nosník se silou uprostřed${lf}"Předmět výpočtu: prostý nosník 4 m se silou 2 kN uprostřed, posouzení ohybu."${lf}F := 2 kN${lf}L := 4 m${lf}M := F·L/4${lf}${fence}${lf}`;
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: text } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Napiš nový…": a whole new calculation, and how many other open sheets the briefing had.
      if (question.startsWith('Napiš nový')) {
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        const others = [...system.matchAll(/^### "/gm)].length;
        const text = `Jiné listy: ${others}.${lf}${lf}${fence}sheet Nosník se silou${lf}# Nosník se silou${lf}F := 1000 N${lf}L := 4 m${lf}M := F·L/4${lf}${fence}${lf}`;
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: text } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Spočítej…": without a level of detail, the model asks for it by a choice; with one (the user picked it),
      // it says which and proposes a note for the AI notes.
      const level = /chose the level of detail "(\w+)"/.exec(system)?.[1];
      if (question.startsWith('Spočítej') || question.includes('→')) {
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        const text = level
          ? `úroveň: ${level}.${lf}${lf}${fence}note ai Shrnutí výpočtu${lf}Výpočet je hotový, výsledky souhlasí.${lf}${fence}${lf}`
          : `Než začnu, zvolte podrobnost.${lf}${lf}${fence}choice detail Jak podrobně má být výpočet?${lf}brief: Stručně${lf}paper: Jako na papíře${lf}teaching: Výukově${lf}${fence}${lf}`;
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: text } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Ověř…": a check in Python of a number of the sheet, first wrong (twice the value), then, given the
      // program's report that it disagrees, right; and whether the briefing told how to write checks.
      const report = question.includes('Ověření v Pythonu') || question.includes('Check in Python');
      if (question.startsWith('Ověř') || report) {
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        const found = /^ *\d+ \| ([A-Za-z][A-Za-z0-9_]*) := (\d+(?:\.\d+)?)(?: ([A-Za-zΩ°µ/^·0-9]+))?[ \t]*$/m.exec(system);
        const [name, value, unit] = found ? [found[1], Number(found[2]), found[3] ?? ''] : ['x', 1, ''];
        const told = system.includes('check a calculation independently in Python') ? 'ano' : 'ne';
        const text = `python: ${told}; ${report ? 'opraveno' : 'první pokus'}.${lf}${lf}${fence}python${lf}print("kontrola ${name}")${lf}result("${name}", ${report ? value : value * 2}, "${unit}")${lf}${fence}${lf}`;
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: text } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Zdvoj…": a proposal with a name defined twice and a number in text the sheet does not compute; given the
      // program's report of the proposed sheet, the same calculation with a name of its own and no such number.
      const sheetReport = question.includes('Kontrola navrženého listu') || question.includes('Check of the proposed sheet');
      if (question.startsWith('Zdvoj') || sheetReport) {
        const lines = [...system.matchAll(/^ *(\d+) \| /gm)].map((m) => Number(m[1]));
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        const body = sheetReport
          ? `smoke_d := 2 m${lf}smoke_d2 := smoke_d·1.5${lf}"Druhá délka je o polovinu větší."`
          : `smoke_d := 2 m${lf}smoke_d := 3 m${lf}"Je to asi 777× víc než nic."${lf}check "Smoke dost dlouhé": smoke_d ≥ 5 m`;
        const text = `zdvojeno: ${sheetReport ? 'opraveno' : 'první'}${lf}${lf}${fence}change after ${Math.max(...lines)}${lf}${body}${lf}${fence}${lf}`;
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: text } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Navrhni dvě…": two changes that belong together, a variable at the top and a line using it at the end.
      if (question.startsWith('Navrhni dvě')) {
        const lines = [...system.matchAll(/^ *(\d+) \| /gm)].map((m) => Number(m[1]));
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        const text = `Dvě změny:${lf}${lf}${fence}change after 1${lf}smoke_b := 3 m${lf}${fence}${lf}${lf}${fence}change after ${Math.max(...lines)}${lf}smoke_c := smoke_b·2${lf}${fence}${lf}`;
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: text } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Navrhni…": a model that proposes a line added at the end of the sheet.
      if (question.startsWith('Navrhni')) {
        const lines = [...system.matchAll(/^ *(\d+) \| /gm)].map((m) => Number(m[1]));
        const lf = String.fromCharCode(10);
        const fence = '`'.repeat(3);
        response.write(event({ model: 'local-smoke-7b', choices: [{ delta: { content: `Přidám řádek:${lf}${lf}${fence}change after ${Math.max(...lines)}${lf}smoke_ai := 2 m${lf}${fence}${lf}` } }] }));
        response.end(event('[DONE]'));
        return;
      }
      // "Analyzuj…": a model that thinks until the length limit and writes nothing.
      if (question.startsWith('Analyzuj')) {
        response.write(event({ choices: [{ delta: { reasoning_content: 'Nejdřív zkontroluji ' } }] }));
        response.write(event({ choices: [{ delta: { reasoning_content: 'průhyb na řádku 12.' } }] }));
        // Long enough to look at the thinking while it goes on.
        setTimeout(() => {
          response.write(event({ choices: [{ delta: {}, finish_reason: 'length' }] }));
          response.end(event('[DONE]'));
        }, 2500);
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
const child = spawn(packaged ?? electron, packaged ? [] : [desktop], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => (stdout += chunk));
// Kept for a report on GitHub, where a program that does not start says why only here.
child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
await new Promise((done) => child.on('close', done));
fakeApi.close();

const line = stdout.split(/\r?\n/).find((l) => l.startsWith('{') && l.includes('"ok"'));
if (!line) {
  console.error('smoke: the app printed no result');
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Smoke test::the app printed no result. ${stderr.replace(/\r?\n/g, ' | ')}`);
  process.exit(1);
}
const result = JSON.parse(line);
writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
// Checks that pass when false; every other true/false check passes when true.
const passWhenFalse = new Set(['aiTabWhileEmpty', 'aiTabAfterClose']);
const failed = Object.entries({ ...result, ...result.layers })
  .filter(([key, value]) => key !== 'ok' && typeof value === 'boolean' && value === passWhenFalse.has(key))
  .map(([key]) => key);
console.log(result.ok ? 'smoke: OK' : `smoke: FAILED ${result.error ?? (failed.join(', ') || 'see the counts in main.ts')}`);
// On GitHub the log needs a sign-in, an annotation does not: every check that came out false or empty,
// by its path in result.json (some are meant to be false; the list is for finding the one that is not).
if (!result.ok && process.env.GITHUB_ACTIONS) {
  const suspects = [];
  const walk = (value, path) => {
    if (value === false || value === '' || value === 0) suspects.push(path);
    else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) walk(inner, path ? `${path}.${key}` : key);
  };
  walk(result, '');
  console.log(`::error title=Smoke test::${result.error ?? ''} false or empty: ${suspects.slice(0, 200).join(' ')}`);
  // The whole result too, for the values behind a check (what a line held, how long typing took).
  console.log(`::notice title=Smoke result::${JSON.stringify(result).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').slice(0, 60000)}`);
}
console.log(`smoke: screenshots and PDF in ${out}`);
process.exit(result.ok ? 0 : 1);
