/**
 * {example} on an input put in from the formula library: the core warns of it (W-EXAMPLE-VALUE) until the value is
 * the user's own. Changing the value or the formula of the line takes the mark away; a changed comment does not.
 */

const MARK = /[ \t]*\{example\}/;

/** The line without its comment and the mark: what it calculates. Text in quotes (source "…") may hold an apostrophe. */
function calculated(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === "'" && !quoted) return line.slice(0, i).replace(MARK, '').trim();
  }
  return line.replace(MARK, '').trim();
}

/** The new lines of a row, without {example} where the row now calculates something else than before. */
export function dropChangedExampleMarks(before: string, after: string): string {
  if (!after.includes('{example}')) return after;
  const old = before.split('\n');
  return after
    .split('\n')
    .map((line, i) => (MARK.test(line) && old[i] !== undefined && calculated(old[i]!) !== calculated(line) ? line.replace(MARK, '') : line))
    .join('\n');
}
