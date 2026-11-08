/**
 * Line numbers of open proposals kept true when the sheet changes under them. A proposal names lines of the sheet as
 * it was when it was made; accepting one of several (or a correction) puts lines in or takes them out, and the line
 * numbers of the others then point elsewhere: an insertion would land a line off without a word, a replacement would
 * no longer fit. So after a change the lines are matched (longest common subsequence) and the numbers moved with them.
 */
import type { ChangeEntry } from '@kalketa/sheet';

/** For each line of `before` (1-based), its number in `after`, where the line is still there unchanged. */
export function lineMap(before: readonly string[], after: readonly string[]): Map<number, number> {
  const n = before.length;
  const m = after.length;
  const map = new Map<number, number>();
  // Lines equal at the start and the end are matched directly: a proposal changes a few lines in the middle.
  let start = 0;
  while (start < n && start < m && before[start] === after[start]) {
    map.set(start + 1, start + 1);
    start++;
  }
  let endB = n;
  let endA = m;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    map.set(endB, endA);
    endB--;
    endA--;
  }
  const b = before.slice(start, endB);
  const a = after.slice(start, endA);
  if (b.length === 0 || a.length === 0 || b.length * a.length > 4_000_000) return map;
  const table: number[][] = Array.from({ length: b.length + 1 }, () => new Array<number>(a.length + 1).fill(0));
  for (let i = b.length - 1; i >= 0; i--) for (let j = a.length - 1; j >= 0; j--) table[i]![j] = b[i] === a[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  for (let i = 0, j = 0; i < b.length && j < a.length; ) {
    if (b[i] === a[j]) {
      map.set(start + i + 1, start + j + 1);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return map;
}

/**
 * The open proposals with their line numbers moved to the sheet as it is now. An insertion follows the line it goes
 * after (the nearest one above that is still there); a replacement follows its lines when they are all still there
 * together, else it keeps its numbers (and no longer fits, as before). Only entries that moved are returned.
 */
export function shiftedEntries(before: string, after: string, entries: readonly ChangeEntry[]): ChangeEntry[] {
  if (before === after) return [];
  const old = before.split('\n');
  const map = lineMap(old, after.split('\n'));
  const moved: ChangeEntry[] = [];
  for (const e of entries) {
    if (e.state !== 'open' || e.replacedBy) continue;
    if (e.insert) {
      let line = e.from;
      while (line > 0 && !map.has(line)) line--;
      const to = line === 0 ? 0 : map.get(line)!;
      if (to !== e.from) moved.push({ ...e, from: to, to });
      continue;
    }
    const from = map.get(e.from);
    const to = map.get(e.to);
    if (from === undefined || to === undefined || to - from !== e.to - e.from) continue;
    if (from !== e.from) moved.push({ ...e, from, to });
  }
  return moved;
}
