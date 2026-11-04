// Checks finished sample calculations: node scripts/sample-check.mjs R35 R36 …
// All a case must hold, the English sheet the same calculation as the Czech one, then the tests of those cases.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('sample-check: give the cases, for example R35 R36');
  process.exit(2);
}

/** The folders of cases under reference/: <field>/[<subfield>/]R<n>-<name>. */
function caseFolders(dir, depth) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => (/^R\d+-/.test(d.name) ? [join(dir, d.name)] : depth > 0 ? caseFolders(join(dir, d.name), depth - 1) : []));
}
const all = caseFolders(join(root, 'reference'), 2);

/** The lines of a sheet that calculate: no words, no comments, no sources. */
const calculation = (text) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^["#!]/.test(l))
    .map((l) => l.replace(/\s+'.*$/, '').replace(/source "[^"]*"/, '').replace(/"[^"]*"/g, '""').trim());

let failed = false;
const say = (id, problem) => {
  failed = true;
  console.log(`${id}: ${problem}`);
};

for (const id of ids) {
  const dir = all.find((d) => new RegExp(`[\\\\/]${id}-`).test(d));
  if (!dir) {
    say(id, 'no folder');
    continue;
  }
  const files = readdirSync(dir);
  const sheet = files.find((f) => f.endsWith('.cc') && !f.endsWith('.en.cc'));
  if (!sheet) {
    say(id, 'no Czech sheet');
    continue;
  }
  const name = sheet.replace(/\.cc$/, '');
  for (const file of [`${name}.en.cc`, `${name}.expected.json`, 'podklady.md', 'podklady.en.md', 'kontrola.md', 'kontrola.en.md']) {
    if (!files.includes(file)) say(id, `missing ${file}`);
  }
  if (!existsSync(join(dir, `${name}.en.cc`))) continue;
  const cs = readFileSync(join(dir, sheet), 'utf8');
  const en = readFileSync(join(dir, `${name}.en.cc`), 'utf8');
  const [a, b] = [calculation(cs), calculation(en)];
  const other = a.findIndex((line, i) => line !== b[i] && !line.startsWith('|'));
  if (a.length !== b.length) say(id, `the sheets have ${a.length} and ${b.length} calculation lines`);
  else if (other >= 0) say(id, `calculation differs:\n  ${a[other]}\n  ${b[other]}`);
  if (!/^"Zdroj: /m.test(cs)) say(id, 'the Czech sheet has no line "Zdroj: …"');
  if (!/^"Source: /m.test(en)) say(id, 'the English sheet has no line "Source: …"');
  if (!/^#\s+\S/m.test(cs) || !/^#\s+\S/m.test(en)) say(id, 'a sheet has no title');
  const pictures = [...en.matchAll(/\]\((images\/[^)\s]+)\)/g), ...cs.matchAll(/\]\((images\/[^)\s]+)\)/g)].map((m) => m[1]);
  for (const picture of pictures) if (!existsSync(join(dir, picture))) say(id, `missing ${picture}`);
}

const vitest = (args) => spawnSync(process.execPath, [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const clean = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
const pattern = ids.map((id) => `${id}-`).join('|');
const tests = vitest(['reference/reference.test.ts', '-t', pattern]);
const out = clean(tests.stdout + tests.stderr);
const failures = out.split('\n').filter((l) => /^\s*FAIL\s/.test(l));
for (const line of failures.slice(0, 20)) console.log(line.trim());
if (tests.status !== 0) failed = true;

// The rest of the program's view of samples: each only for itself, others may be at work.
const samples = vitest(['packages/editor/tests/samples.test.ts']);
const mine = clean(samples.stdout + samples.stderr).split('\n').filter((l) => ids.some((id) => l.includes(`${id}-`)));
if (samples.status !== 0 && mine.length > 0) {
  failed = true;
  for (const line of mine.slice(0, 8)) console.log(line.trim().slice(0, 300));
}

console.log(failed ? 'sample-check: FAILED' : `sample-check: OK (${ids.join(', ')}); ${/Tests\s+.*/.exec(out)?.[0] ?? ''}`);
process.exit(failed ? 1 : 0);
