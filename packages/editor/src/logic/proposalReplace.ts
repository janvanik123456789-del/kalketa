/**
 * A corrected proposal replaces the one it corrects. When the program finds errors in a proposed change (or its
 * check in Python disagrees), the model sends the change again, corrected. Accepting both put the same lines in
 * twice. So the corrected entries list the entries they replace (`replaces`); an open one of those can no longer be
 * accepted, and accepting the correction takes the lines of an accepted one out of the sheet first.
 */
import type { ChangeEntry } from '@kalketa/sheet';

/** The ids of the entries an answer replaces: those of the answer it corrects, and what that one replaced. */
export function replacedIds(entries: readonly ChangeEntry[], correctedPrefix: string): string[] {
  const corrected = entries.filter((e) => e.id.startsWith(correctedPrefix));
  return [...new Set(corrected.flatMap((e) => [e.id, ...(e.replaces ?? [])]))];
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

/** Where the lines an accepted entry put in stand now (0-based), or undefined when they are not there unchanged. */
function placeOf(lines: readonly string[], entry: ChangeEntry): number | undefined {
  const n = entry.after.length;
  if (n === 0) return undefined;
  const expected = entry.insert ? entry.from : entry.from - 1;
  if (expected >= 0 && sameLines(lines.slice(expected, expected + n), entry.after)) return expected;
  // Lines put in or taken out above it since: found by its lines, when they stand in one place only.
  const found: number[] = [];
  for (let i = 0; i + n <= lines.length; i++) if (sameLines(lines.slice(i, i + n), entry.after)) found.push(i);
  return found.length === 1 ? found[0] : undefined;
}

/**
 * The source with the accepted entries this one replaces taken back out (each as it was before it: the lines it
 * replaced put back), and which were taken out. Entries whose lines were edited since stay as they are.
 */
export function withoutReplaced(source: string, entry: ChangeEntry, entries: readonly ChangeEntry[]): { source: string; reverted: string[] } {
  const ids = new Set(entry.replaces ?? []);
  if (ids.size === 0) return { source, reverted: [] };
  const lines = source.split('\n');
  const accepted = entries.filter((e) => ids.has(e.id) && e.state === 'accepted' && !e.copiedTo && !e.replacedBy);
  const placed = accepted.flatMap((e) => {
    const at = placeOf(lines, e);
    return at === undefined ? [] : [{ e, at }];
  });
  // From the bottom up, so the places above stay where they are.
  placed.sort((a, b) => b.at - a.at);
  for (const { e, at } of placed) lines.splice(at, e.after.length, ...(e.insert ? [] : (e.before ?? [])));
  return { source: lines.join('\n'), reverted: placed.map((p) => p.e.id) };
}
