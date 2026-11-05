/**
 * What was probably meant by a name nobody knows: 12 KN is kN, x_nett is x_net, and a function by the name another
 * program has for it. Only a close match is offered; better nothing than a wrong lead.
 */

/** Functions of other programs (Mathcad, SMath, Excel, MATLAB) that are written otherwise here. */
const OF_OTHER_PROGRAMS: Readonly<Record<string, string>> = {
  average: 'mean',
  avg: 'mean',
  stddev: 'stdev',
  std: 'stdev',
  variance: 'var',
  length: 'len',
  size: 'len',
  count: 'len',
  Find: 'solve',
  find: 'solve',
  root: 'solve',
  fsolve: 'solve',
  polyroots: 'roots',
  linsolve: 'lsolve',
  linsolv: 'lsolve',
  inv: 'inverse',
  ceiling: 'ceil',
  sum2: 'sumsq',
  npv2: 'npv',
  interp: 'interp1',
  linterp: 'interp1',
  vlookup: 'pick',
  lookup: 'pick',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  fabs: 'abs',
};

/** The number of single changes between two words, stopped once over the limit. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = Array.from({ length: b.length + 1 }, (_, j) => j);
  let beforeThat: number[] = [];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      let cell = Math.min(before[j]! + 1, row[j - 1]! + 1, before[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cell = Math.min(cell, beforeThat[j - 2]! + 1);
      row.push(cell);
    }
    beforeThat = before;
    before = row;
  }
  return before[b.length]!;
}

export function suggestName(written: string, candidates: readonly string[], isFunction = false): string | undefined {
  if (isFunction && OF_OTHER_PROGRAMS[written]) return OF_OTHER_PROGRAMS[written];
  const named = candidates.filter((c) => c !== written);
  // Another case is the likeliest slip of all, however short the name: KN, Mpa.
  const lower = written.toLowerCase();
  const cased = named.find((c) => c.toLowerCase() === lower);
  if (cased) return cased;
  // A short name is near too many others to tell.
  if (written.length < 3) return undefined;
  const limit = written.length >= 6 ? 2 : 1;
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const c of named) {
    if (c.length < 2) continue;
    const d = distance(written, c, limit);
    if (d < bestDistance || (d === bestDistance && best && d <= limit && c.length < best.length)) [best, bestDistance] = [c, d];
  }
  return best;
}
