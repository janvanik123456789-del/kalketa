// Check of a packaged program: node scripts/packaged-check.mjs <path to Kalketa.exe, AppImage or kalketa>
//
// A package holds no test code, so the program is looked at from outside over the debugging port of
// Chromium: it starts, its editor loads and has the bridge, and the page reports no errors. It must also
// ignore KALKETA_SMOKE_TEST (that mode skips the question before Python of the computer runs a script)
// and KALKETA_DEV_URL (a page loaded from there would have the bridge of the program), and where the
// package can be read, it must not contain the smoke test.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, readSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const program = process.argv[2];
if (!program || !existsSync(program)) {
  console.error('packaged check: give the path of the packaged program');
  process.exit(2);
}

const out = mkdtempSync(join(tmpdir(), 'kalketa-packaged-'));
const forbidden = join(out, 'must-not-appear.pdf');
const env = { ...process.env, KALKETA_USER_DATA: join(out, 'profile'), KALKETA_SMOKE_TEST: forbidden, KALKETA_DEV_URL: 'http://127.0.0.1:9/foreign.html' };
delete env.ELECTRON_RUN_AS_NODE;

const failures = [];
const child = spawn(program, ['--remote-debugging-port=0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => (stdout += chunk));
child.stderr.on('data', (chunk) => (stderr += chunk));
let exited = false;
child.on('exit', () => (exited = true));

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** Waits for what `read` gives, up to the time allowed. */
async function waitFor(read, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end && !exited) {
    const value = await read();
    if (value) return value;
    await pause(250);
  }
  return undefined;
}

/** Evaluates an expression in the page over the DevTools protocol. */
function inPage(url, expression) {
  return new Promise((done, fail) => {
    const socket = new WebSocket(url);
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    socket.onerror = () => fail(new Error('no connection to the page'));
    socket.onmessage = (event) => {
      const answer = JSON.parse(event.data);
      if (answer.id !== 1) return;
      socket.close();
      done(answer.result?.result?.value);
    };
  });
}

/** Whether the app.asar beside the program lists the smoke test; undefined where it cannot be read (inside an AppImage). */
function packageHoldsSmokeTest() {
  const asar = join(dirname(program), 'resources', 'app.asar');
  if (!existsSync(asar)) return undefined;
  // The Chromium pickle of an asar: its header (JSON of all files) has its length at byte 12 and starts at byte 16.
  const file = openSync(asar, 'r');
  try {
    const head = Buffer.alloc(16);
    readSync(file, head, 0, 16, 0);
    const listing = Buffer.alloc(head.readUInt32LE(12));
    readSync(file, listing, 0, listing.length, 16);
    return /"smoke\.[a-z.]*js(\.map)?"/.test(listing.toString('utf8'));
  } finally {
    closeSync(file);
  }
}

try {
  const port = await waitFor(() => /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(stderr)?.[1], 60);
  if (!port) throw new Error(`the program gave no debugging port. ${stderr.slice(-1000)}`);
  const page = await waitFor(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => []);
    return targets.find((t) => t.type === 'page' && (t.url.includes('index.html') || t.url.includes('foreign.html')));
  }, 60);
  if (!page) throw new Error('the editor page did not open');
  if (page.url.includes('foreign.html') || !page.url.startsWith('file:')) failures.push(`the program loaded ${page.url}`);
  const state = await waitFor(async () => {
    const seen = await inPage(page.webSocketDebuggerUrl, `({ bridge: typeof window.kalketaDesktop === 'object', menus: document.querySelectorAll('.menubar-item').length, title: document.title })`).catch(() => undefined);
    return seen?.menus > 0 ? seen : undefined;
  }, 60);
  if (!state) failures.push('the editor did not load (no menus)');
  else if (!state.bridge) failures.push('the editor has no bridge to the program');
  // Long enough for the test mode to have shown itself, had it started.
  await pause(5000);
  if (exited) failures.push('the program ended by itself');
  if (stdout.includes('"ok"')) failures.push('the program ran the smoke test');
  if (existsSync(forbidden)) failures.push('the program wrote the file of the smoke test');
  if (packageHoldsSmokeTest()) failures.push('the package contains the smoke test');
} catch (err) {
  failures.push(err.message);
} finally {
  child.kill();
  await pause(1000);
  try {
    rmSync(out, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // A profile still held by a closing program stays in the temporary folder.
  }
}

console.log(failures.length === 0 ? 'packaged check: OK' : `packaged check: FAILED ${failures.join('; ')}`);
process.exit(failures.length === 0 ? 0 : 1);
