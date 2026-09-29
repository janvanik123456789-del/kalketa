import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The editor uses the other packages' sources directly; no build step needed.
    alias: {
      '@calccanvas/core': src('core'),
      '@calccanvas/i18n': src('i18n'),
      '@calccanvas/sheet': src('sheet'),
      '@calccanvas/render': src('render'),
    },
  },
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
});
