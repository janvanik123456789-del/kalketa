/**
 * The Python packages shipped with Kalketa for checking calculations in its built-in Python
 * (Pyodide): fetched once from the Pyodide CDN of the installed version, checked against the
 * SHA-256 of pyodide-lock.json, kept in packages/desktop/pyodide-packages/. The program never
 * downloads anything when it runs.
 *
 *   node scripts/pyodide-packages.mjs
 */
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PYODIDE = join(ROOT, 'node_modules', 'pyodide');
const OUT = join(ROOT, 'packages', 'desktop', 'pyodide-packages');
/** What a check may import beyond the standard library. */
const WANTED = ['numpy'];

const version = JSON.parse(readFileSync(join(PYODIDE, 'package.json'), 'utf8')).version;
const lock = JSON.parse(readFileSync(join(PYODIDE, 'pyodide-lock.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });

const needed = new Set();
const add = (name) => {
  const entry = lock.packages[name];
  if (!entry) throw new Error(`No package ${name} in pyodide-lock.json`);
  if (needed.has(name)) return;
  needed.add(name);
  for (const dep of entry.depends ?? []) add(dep);
};
WANTED.forEach(add);

for (const name of needed) {
  const { file_name: file, sha256 } = lock.packages[name];
  const target = join(OUT, file);
  const sum = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (existsSync(target) && sum(readFileSync(target)) === sha256) {
    console.log(`${file}: kept`);
    writeLicence(name, target);
    continue;
  }
  const url = `https://cdn.jsdelivr.net/pyodide/v${version}/full/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sum(bytes) !== sha256) throw new Error(`${file}: SHA-256 differs from pyodide-lock.json`);
  writeFileSync(target, bytes);
  console.log(`${file}: ${(bytes.length / 1e6).toFixed(1)} MB`);
  writeLicence(name, target);
}

/**
 * The licence texts inside a wheel (*.dist-info/LICENSE*, *.dist-info/licenses/*) beside it, as
 * <wheel>.LICENSE.txt, for the notices of third-party software (scripts/third-party-notices.mjs).
 * A wheel is a zip: its central directory read here, so no unzip is needed on any system.
 */
function writeLicence(name, wheel) {
  const zip = readFileSync(wheel);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const texts = [];
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const path = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extra + comment;
    if (!/\.dist-info\/(licenses\/.+|LICEN[CS]E[^/]*)$/i.test(path)) continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    texts.push(`${path}\n\n${(method === 8 ? inflateRawSync(data) : data).toString('utf8').trim()}`);
  }
  writeFileSync(`${wheel}.LICENSE.txt`, `${name}\n\n${texts.join('\n\n')}\n`);
}
