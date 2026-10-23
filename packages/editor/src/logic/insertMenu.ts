/**
 * The insert menu of an empty line: "/" typed at its start offers what can be put in, each with an example
 * of how it is written. More letters after "/" narrow it ("/pos" → Posudek). The choices and how a query
 * narrows them; the menu itself is components/InsertMenu.tsx.
 */

/** One thing to put in: a line to write (template, ‸ marks the cursor) or an action of the program (a dialog). */
export interface InsertChoice {
  readonly id: string;
  /** A short sign in the square before it (≔, ✓, x=?). */
  readonly icon: string;
  readonly label: string;
  /** How it is written, as an example. */
  readonly example: string;
  /** The line it writes; without one the program does it (opens a dialog, inserts a picture). */
  readonly template?: string;
  /** More words it is found by, in any language ("check", "posudek"). */
  readonly keywords?: string;
}

/** The query of a line that asks for the menu: "/" and letters after it; undefined for any other line. */
export function insertQuery(line: string): string | undefined {
  return /^\/([\p{L}\p{N}_]*)$/u.exec(line)?.[1];
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The choices a query leaves: those whose name or other words start a word with it, in their order. */
export function matchingChoices(choices: readonly InsertChoice[], query: string): InsertChoice[] {
  const q = plain(query);
  if (q === '') return [...choices];
  return choices.filter((c) => plain(`${c.label} ${c.keywords ?? ''} ${c.id}`).split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(q)));
}
