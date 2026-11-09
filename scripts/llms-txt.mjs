// Writes llms.txt at the root of the repository from the guide of the program: node scripts/llms-txt.mjs (npm run llms).
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = spawnSync(process.execPath, [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'packages/editor/tests/llmsTxt.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, KALKETA_WRITE_LLMS: '1' },
});
process.exit(run.status ?? 1);
