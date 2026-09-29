import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the sources, no build needed.
    alias: {
      '@calccanvas/core': src('core'),
      '@calccanvas/i18n': src('i18n'),
      '@calccanvas/sheet': src('sheet'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts', 'reference/**/*.test.ts'],
  },
});
