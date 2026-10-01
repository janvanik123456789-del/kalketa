/**
 * Hlídá pravidla architektury (Claude_navrh/02-architektura.md, kap. 2).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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

/** Every source file of a package, with the modules it imports. */
function packageImports(pkg: string): { file: string; imports: string[] }[] {
  const dir = join(ROOT, 'packages', pkg, 'src');
  return readdirSync(dir, { recursive: true })
    .map((name) => join(dir, String(name)))
    .filter((path) => /\.(ts|tsx)$/.test(path) && statSync(path).isFile())
    .map((file) => ({ file: relative(ROOT, file).replaceAll('\\', '/'), imports: importsOf(file) }));
}

describe('modul plátna je samostatný', () => {
  it('plátno nepoužívá jiné balíčky projektu ani soubory mimo svůj balíček', () => {
    const bad = packageImports('canvas').flatMap(({ file, imports }) =>
      imports.filter((i) => i.startsWith('@calccanvas/') || (i.startsWith('.') && !resolve(ROOT, file, '..', i).startsWith(join(ROOT, 'packages', 'canvas', 'src')))).map((i) => `${file} → ${i}`),
    );
    expect(bad).toEqual([]);
  });

  it('čistá část plátna (formát, SVG, úpravy) nepoužívá React', () => {
    const bad = packageImports('canvas')
      .filter(({ file }) => !file.includes('/src/editor/'))
      .flatMap(({ file, imports }) => imports.filter((i) => i.startsWith('react')).map((i) => `${file} → ${i}`));
    expect(bad).toEqual([]);
  });

  it('jádro, list, tisk ani překlady plátno neznají', () => {
    const bad = ['core', 'sheet', 'render', 'i18n'].flatMap((pkg) =>
      packageImports(pkg).flatMap(({ file, imports }) => imports.filter((i) => i.startsWith('@calccanvas/canvas')).map((i) => `${file} → ${i}`)),
    );
    expect(bad).toEqual([]);
  });

  it('editor a příkazová řádka berou plátno jen přes jeho rozhraní', () => {
    const bad = ['editor', 'cli'].flatMap((pkg) =>
      packageImports(pkg).flatMap(({ file, imports }) =>
        imports.filter((i) => (i.startsWith('@calccanvas/canvas/') && i !== '@calccanvas/canvas/editor') || i.includes('/canvas/src/')).map((i) => `${file} → ${i}`),
      ),
    );
    expect(bad).toEqual([]);
  });
});
