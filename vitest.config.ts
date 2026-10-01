import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the sources, no build needed.
    alias: {
      '@kalketa/core': src('core'),
      '@kalketa/i18n': src('i18n'),
      '@kalketa/sheet': src('sheet'),
      '@kalketa/render': src('render'),
      '@kalketa/canvas': src('canvas'),
      '@kalketa/chart': src('chart'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts', 'reference/**/*.test.ts'],
  },
});
