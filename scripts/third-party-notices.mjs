/**
 * Writes the notices of the third-party software the program ships: the
 * copyright and licence text of every package the editor, the desktop
 * application and the command line need at run time (npm ls --omit=dev), and
 * of Electron, which the desktop application is built on.
 *
 *   node scripts/third-party-notices.mjs
 *
 * The MIT licence and its kin ask for exactly this: the notice goes with every
 * copy of the software. Run it after adding or updating a dependency.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages', 'editor', 'src', 'generated', 'third-party-notices.txt');

// npm is a script on Windows (npm.cmd), so it runs through the shell there; the arguments are fixed.
const tree = JSON.parse(execFileSync(process.platform === 'win32' ? 'npm.cmd ls --omit=dev --all --json --long' : 'npm ls --omit=dev --all --json --long', { cwd: ROOT, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 }));

/** Optional packages the desktop build leaves out (see "files" in packages/desktop/package.json). */
const NOT_SHIPPED = /^@napi-rs\//;

/** name@version -> the package and where it is installed */
const found = new Map();
const visit = (deps) => {
  for (const [name, info] of Object.entries(deps ?? {})) {
    if (!info.version) continue;
    if (NOT_SHIPPED.test(name)) continue;
    if (!name.startsWith('@kalketa/')) found.set(`${name}@${info.version}`, { name, version: info.version, path: info.path });
    visit(info.dependencies);
  }
};
visit(tree.dependencies);
// Shipped with the desktop application although it is a build dependency.
const electron = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'));
found.set(`electron@${electron.version}`, { name: 'electron', version: electron.version, path: join(ROOT, 'node_modules', 'electron') });

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

function notice({ name, version, path }) {
  // Each version from where it is installed (two versions of a package may live side by side).
  const dir = path ?? join(ROOT, 'node_modules', ...name.split('/'));
  const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {};
  const licence = typeof pkg.license === 'string' ? pkg.license : (pkg.licenses ?? []).map((l) => l.type ?? l).join(' OR ') || 'not stated by the package';
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort() : [];
  const texts = files.map((f) => readFileSync(join(dir, f), 'utf8').trim());
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  const head = `${name} ${version} — ${licence}${pkg.homepage ? `\n${pkg.homepage}` : ''}`;
  const body = texts.length ? texts.join('\n\n') : `Licence: ${licence}${author ? `\nCopyright: ${author}` : ''}`;
  return `${head}\n${'-'.repeat(Math.min(78, head.split('\n')[0].length))}\n${body}`;
}

const packages = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
// The Python packages of the built-in Python (scripts/pyodide-packages.mjs): their licences as the wheels carry them.
const WHEELS = join(ROOT, 'packages', 'desktop', 'pyodide-packages');
const wheels = existsSync(WHEELS)
  ? readdirSync(WHEELS)
      .filter((f) => f.endsWith('.whl.LICENSE.txt'))
      .sort()
      .map((f) => {
        const [name, version] = f.split('-');
        const head = `${name} ${version} (Python, in the built-in Python of checks)`;
        return `${head}\n${'-'.repeat(head.length)}\n${readFileSync(join(WHEELS, f), 'utf8').trim()}`;
      })
  : [];
const text = [
  'Third-party software in this program',
  '====================================',
  '',
  'The program contains the packages below. Each is the work of its authors and',
  'is used under its own licence, given in full here. Electron includes Chromium;',
  'its notices are in LICENSES.chromium.html next to the program.',
  '',
  ...packages.map(notice).map((n) => `${n}\n`),
  ...wheels.map((n) => `${n}\n`),
].join('\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, text.replace(/\r\n/g, '\n'));
console.log(`${packages.length} packages -> ${OUT}`);
