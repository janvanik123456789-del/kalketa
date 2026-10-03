// Makes node_modules/@kalketa/* point at packages/* of this copy of the repo.
//
// npm links the workspace packages with absolute paths (junctions on Windows).
// Moving or copying the project folder breaks them: they point at the old place,
// or the copy turns them into stale plain folders. This puts them right again,
// without the network, and does nothing when they are already right.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = join(root, 'packages');
let fixed = 0;

for (const dir of readdirSync(packages)) {
  const manifest = join(packages, dir, 'package.json');
  if (!existsSync(manifest)) continue;
  const name = JSON.parse(readFileSync(manifest, 'utf8')).name;
  if (typeof name !== 'string') continue;
  const target = join(packages, dir);
  const link = join(root, 'node_modules', ...name.split('/'));
  if (pointsAt(link, target)) continue;
  rmSync(link, { recursive: true, force: true });
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  fixed++;
}

if (fixed > 0) console.log(`link-workspaces: ${fixed} package link(s) repaired`);

function pointsAt(link, target) {
  try {
    if (!lstatSync(link).isSymbolicLink()) return false;
    return realpathSync(link).toLowerCase() === realpathSync(target).toLowerCase();
  } catch {
    return false;
  }
}
