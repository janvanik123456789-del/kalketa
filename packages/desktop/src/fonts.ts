/**
 * The fonts installed in the operating system, by family name, for the font
 * menus of the editor. Windows lists them in the registry (for the machine and
 * for the user), Linux and others through fontconfig. Read once, then kept.
 */

import { execFile } from 'node:child_process';

const run = (file: string, args: readonly string[]) =>
  new Promise<string>((resolve) => execFile(file, [...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, out) => resolve(error ? '' : out)));

/** "Arial Bold Italic (TrueType)", "Cambria & Cambria Math (TrueType)" → Arial; Cambria, Cambria Math. */
export function familiesOfRegistry(listing: string): string[] {
  const names: string[] = [];
  for (const line of listing.split(/\r?\n/)) {
    const entry = /^\s{2,}(.+?)\s+REG_\w+\s+/.exec(line)?.[1];
    if (!entry) continue;
    for (const part of entry.replace(/\s*\((TrueType|OpenType|All res|VGA res|[^)]*)\)\s*$/i, '').split(/\s*&\s*/)) {
      const family = part.replace(/(\s+(Bold|Italic|Oblique|Regular|Bold Italic))+$/i, '').trim();
      if (family) names.push(family);
    }
  }
  return names;
}

/** "DejaVu Sans,DejaVu Sans Condensed" per line → each name. */
export function familiesOfFontconfig(listing: string): string[] {
  return listing
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .map((name) => name.replace(/\\-/g, '-').trim())
    .filter(Boolean);
}

let cached: Promise<string[]> | undefined;

export function systemFonts(): Promise<string[]> {
  cached ??= (async () => {
    const names =
      process.platform === 'win32'
        ? familiesOfRegistry(
            (
              await Promise.all(
                ['HKLM', 'HKCU'].map((hive) => run('reg', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`])),
              )
            ).join('\n'),
          )
        : familiesOfFontconfig(await run('fc-list', [':', 'family']));
    // Names a person reads; the symbol and the hidden ones (@…, starting with a dot) left out.
    return [...new Set(names.filter((n) => !/^[@.]/.test(n)))].sort((a, b) => a.localeCompare(b));
  })();
  return cached;
}
