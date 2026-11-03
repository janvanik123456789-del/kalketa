import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const file = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const src = (pkg: string) => file(`${pkg}/src/index.ts`);

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative paths, so the quick test can load the build from disk.
  base: './',
  plugins: [react()],
  resolve: {
    // Exact names, as in the editor: the sources of the other packages, no build step.
    alias: [
      { find: /^@kalketa\/core$/, replacement: src('core') },
      { find: /^@kalketa\/i18n$/, replacement: src('i18n') },
      { find: /^@kalketa\/sheet$/, replacement: src('sheet') },
      { find: /^@kalketa\/render$/, replacement: src('render') },
      { find: /^@kalketa\/canvas$/, replacement: src('canvas') },
      { find: /^@kalketa\/chart$/, replacement: src('chart') },
      { find: /^@kalketa\/chart-editor$/, replacement: src('chart-editor') },
      { find: /^@kalketa\/chart-editor\/logic$/, replacement: file('chart-editor/src/logic/index.ts') },
      { find: /^@kalketa\/ai$/, replacement: src('ai') },
      { find: /^@kalketa\/canvas\/editor$/, replacement: file('canvas/src/editor/index.ts') },
    ],
  },
  server: { port: 5174, strictPort: true, open: true, fs: { allow: ['../../..'] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 20000 },
});
