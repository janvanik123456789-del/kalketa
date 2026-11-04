// The pictures of sample calculations on one sheet, to be looked at: node scripts/sample-pictures.mjs R35 R36 …
// Tests see the numbers only; a label cut off at the edge of a picture takes eyes. Writes a PNG and says where.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'kalketa-sample-pictures-'));

const cases = (dir, depth) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => (/^R\d+-/.test(d.name) ? [join(dir, d.name)] : depth > 0 ? cases(join(dir, d.name), depth - 1) : []));
const all = cases(join(root, 'reference'), 2);
const ids = process.argv.slice(2);
const pictures = ids.flatMap((id) => {
  const dir = all.find((d) => new RegExp(`[\\\\/]${id}-`).test(d));
  if (!dir) return [];
  try {
    return readdirSync(join(dir, 'images'))
      .filter((f) => f.endsWith('.svg'))
      .map((f) => ({ id, file: join(dir, 'images', f), name: f }));
  } catch {
    return [];
  }
});
if (pictures.length === 0) {
  console.log('sample-pictures: no pictures');
  process.exit(0);
}

const page = join(out, 'pictures.html');
const figures = pictures.map((p) => `<figure><img src="${pathToFileURL(p.file)}"><figcaption>${p.id} ${p.name}</figcaption></figure>`).join('');
writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>body{margin:8px;background:#ddd;display:flex;flex-wrap:wrap;gap:8px;font:12px sans-serif}figure{margin:0;background:#fff}img{display:block;max-width:660px;max-height:420px}figcaption{padding:2px 4px;background:#eee}</style>${figures}`);
const main = join(out, 'main.mjs');
writeFileSync(
  main,
  `import { writeFileSync } from 'node:fs';
import { app, BrowserWindow } from 'electron';
void app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: ${Math.max(500, Math.ceil(pictures.length / 2) * 450)}, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(${JSON.stringify(page)});
  await new Promise((done) => setTimeout(done, 1500));
  writeFileSync(${JSON.stringify(join(out, 'pictures.png'))}, (await win.webContents.capturePage()).toPNG());
  app.exit(0);
});
`,
);
const electron = createRequire(join(root, 'packages', 'desktop', 'package.json'))('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawnSync(electron, [main], { env, stdio: 'ignore', timeout: 60_000 });
console.log(`sample-pictures: ${pictures.length} pictures in ${join(out, 'pictures.png')}`);
