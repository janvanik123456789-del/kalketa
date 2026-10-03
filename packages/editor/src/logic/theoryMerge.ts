/**
 * Theory from the sheet's sources and from its libraries, put together for the
 * model (docs/01-filozofie.md, ch. 9.6).
 */

type Section = { readonly id?: string; readonly title: string; readonly text: string };

/** Title and text as the reader sees them: pictures by file name, spaces as one. */
function sameness(s: Section): string {
  return `${s.title}\n${s.text}`
    .replace(/\]\((?:layers\/[^/)]+\/)?images\/([^)\s]+)\)/g, ']($1)')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The sheet's own sections and those of its libraries, each text once: a
 * section that a library has too (the library was saved from these sources)
 * comes from the library, as an external source with its key.
 */
export function withoutDuplicates(own: readonly Section[], fromLibraries: readonly Section[]): Section[] {
  const inLibraries = new Set(fromLibraries.map(sameness));
  return [...own.filter((s) => !inLibraries.has(sameness(s))), ...fromLibraries];
}
