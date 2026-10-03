import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

export default defineConfig(({ command }) => ({
  // Relative asset paths, so the desktop app can load the build from disk.
  base: './',
  plugins: [react(), ...(command === 'build' ? [contentSecurityPolicy()] : [])],
  resolve: {
    // The editor uses the other packages' sources directly; no build step needed.
    // Exact names, so '@kalketa/canvas' does not also catch '@kalketa/canvas/editor'.
    alias: [
      { find: /^@kalketa\/core$/, replacement: src('core') },
      { find: /^@kalketa\/i18n$/, replacement: src('i18n') },
      { find: /^@kalketa\/sheet$/, replacement: src('sheet') },
      { find: /^@kalketa\/render$/, replacement: src('render') },
      { find: /^@kalketa\/canvas$/, replacement: src('canvas') },
      { find: /^@kalketa\/chart$/, replacement: src('chart') },
      { find: /^@kalketa\/ai$/, replacement: src('ai') },
      { find: /^@kalketa\/canvas\/editor$/, replacement: fileURLToPath(new URL('../canvas/src/editor/index.ts', import.meta.url)) },
    ],
  },
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
}));

/** The built editor may load only its own files; images come as data: URIs. */
function contentSecurityPolicy(): Plugin {
  const policy = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self' about: data:; connect-src 'self'";
  return {
    name: 'kalketa-csp',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}
