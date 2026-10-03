// Desktop smoke test: drives the built desktop app with real mouse and keyboard
// input and reports what failed. Run after `npm run build:desktop` (`npm run smoke` does both).
//
// It writes its own test sheets (AI notes, a block) into a temporary folder, so it
// needs nothing outside the repo and works wherever the repo lives.
import { spawn } from 'node:child_process';
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

const electron = createRequire(join(desktop, 'package.json'))('electron');
const env = { ...process.env, KALKETA_SMOKE_TEST: join(out, 'smoke.pdf'), KALKETA_SMOKE_AI: aiFile, KALKETA_SMOKE_BLOCKS: blocksFile };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [desktop], { env, stdio: ['ignore', 'pipe', 'ignore'] });
let stdout = '';
child.stdout.on('data', (chunk) => (stdout += chunk));
await new Promise((done) => child.on('close', done));

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
