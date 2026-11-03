// The quick test of chart editing: builds the page with sample charts and tries it with the real mouse and keyboard,
// in about a minute. Not a replacement of npm run smoke, which tries the whole program before a push or an exe.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const started = Date.now();
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const built = spawnSync(process.execPath, [vite, 'build', '--config', join(root, 'packages', 'chart-editor', 'workbench', 'vite.config.ts'), '--logLevel', 'warn'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
if (built.status !== 0) {
  console.error('smoke:chart: the page did not build');
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), 'kalketa-smoke-chart-'));
const electron = createRequire(join(root, 'packages', 'desktop', 'package.json'))('electron');
const env = { ...process.env, KALKETA_CHART_OUT: out };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [join(root, 'scripts', 'smoke-chart-main.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => (stdout += chunk));
child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
const stop = setTimeout(() => child.kill(), 180_000);
await new Promise((done) => child.on('close', done));
clearTimeout(stop);

const line = stdout.split(/\r?\n/).find((l) => l.startsWith('{') && l.includes('"steps"'));
if (!line) {
  console.error(`smoke:chart: the test printed no result\n${stderr}`);
  process.exit(1);
}
const result = JSON.parse(line);
writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
const failed = Object.entries(result.steps).filter(([, passed]) => passed !== true);
for (const [name] of failed) console.error(`smoke:chart: FAILED ${name}`);
if (failed.length > 0) console.error(`smoke:chart: ${JSON.stringify(result.detail)}`);
for (const message of result.console ?? []) console.error(`smoke:chart: console: ${message}`);
if (result.error) console.error(`smoke:chart: ${result.error}`);
const ok = failed.length === 0 && !result.error && (result.console ?? []).length === 0;
console.log(`smoke:chart: ${ok ? 'OK' : 'FAILED'}, ${Object.keys(result.steps).length} steps in ${Math.round((Date.now() - started) / 1000)} s; picture and result in ${out}`);
process.exit(ok ? 0 : 1);
