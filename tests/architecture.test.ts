/**
 * Hlídá pravidla architektury (Claude_navrh/02-architektura.md, kap. 2).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const CORE_SRC = join(ROOT, 'packages', 'core', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('pravidla architektury', () => {
  const files = sourceFiles(CORE_SRC);

  it('core nezávisí na jiných balíčcích projektu', () => {
    const bad = files.flatMap((f) =>
      importsOf(f)
        .filter((i) => i.startsWith('@calccanvas/'))
        .map((i) => `${relative(ROOT, f)} → ${i}`),
    );
    expect(bad).toEqual([]);
  });

  it('core nepoužívá soubory, síť ani procesy', () => {
    const forbidden = /^(node:)?(fs|fs\/promises|net|http|https|child_process|worker_threads)$/;
    const bad = files.flatMap((f) =>
      importsOf(f)
        .filter((i) => forbidden.test(i))
        .map((i) => `${relative(ROOT, f)} → ${i}`),
    );
    expect(bad).toEqual([]);
  });
});
