/**
 * Typing helpers of the row editor (docs/03-jazyk.md, ch. 2):
 * "=" typed right after a new name at the start of a line becomes ":=", also
 * after the head of a new function: "A_kruh(d) =" becomes "A_kruh(d) :=".
 */

import { builtinFunctions } from '@kalketa/core';

const NAME = String.raw`[\p{L}][\p{L}\p{Nd}\p{M}_]*`;
const PARAMS = String.raw`\(\s*${NAME}(?:\s*[,;]\s*${NAME})*\s*\)`;
const LEADING_NAME = new RegExp(String.raw`^\s*(${NAME})\s*(?:${PARAMS})?\s*$`, 'u');

export interface Edit {
  readonly text: string;
  readonly cursor: number;
}

/**
 * Called when the user types "=". Returns the edit to apply instead, or
 * undefined to insert "=" normally (e.g. "L =" asks for the value of an
 * existing L).
 */
export function defineShortcut(text: string, cursor: number, isDefinedElsewhere: (name: string) => boolean): Edit | undefined {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const match = LEADING_NAME.exec(before);
  if (!match || after.trimStart().startsWith('=')) return undefined;
  const name = match[1]!;
  if (isDefinedElsewhere(name) || builtinFunctions.has(name)) return undefined;
  // "payback(CF) =" with CF defined above is a call that asks for the result.
  const params = /\(([^()]*)\)/.exec(before)?.[1]?.split(/[,;]/).map((p) => p.trim()) ?? [];
  if (params.some((p) => isDefinedElsewhere(p))) return undefined;
  const head = `${before.trimEnd()} := `;
  return { text: head + after.trimStart(), cursor: head.length };
}

/** Name defined by a line of text, if it is a definition. */
export function definedName(text: string): string | undefined {
  return new RegExp(String.raw`^\s*(${NAME})\s*(?:${PARAMS})?\s*:=`, 'u').exec(text)?.[1];
}

/** Greek letters by their names, as typed: "alpha" becomes α, "Omega" Ω. */
const GREEK_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'].flatMap((name, i) => {
    const small = String.fromCodePoint(0x3b1 + i + (i >= 17 ? 1 : 0));
    return [[name, small], [name[0]!.toUpperCase() + name.slice(1), small.toUpperCase()]];
  }),
);

/** "<" and "=" typed one after the other become ≤, as printed. */
const COMPARISON_SIGNS: Readonly<Record<string, string>> = { '<': '≤', '>': '≥', '!': '≠' };

/** Whether a place of a line is in a "string" or in a comment ('), where nothing is corrected. */
function inTextAt(text: string, at: number): boolean {
  let inString = false;
  for (let i = 0; i < at; i++) {
    if (text[i] === '"') inString = !inString;
    else if (text[i] === "'" && !inString) return true;
  }
  return inString;
}

/**
 * Corrections of what was just typed (the character before the cursor), as a word processor makes them:
 * "<=" ≤, ">=" ≥, "!=" ≠, "*" ·, and the name of a Greek letter ended by a space, an operator or "_"
 * ("sigma_m" σ_m). Not in strings and comments, not a name the sheet defines; undefined: nothing to correct.
 */
export function autocorrect(text: string, cursor: number, isDefinedElsewhere: (name: string) => boolean): Edit | undefined {
  if (cursor < 1 || inTextAt(text, cursor - 1)) return undefined;
  const typed = text[cursor - 1]!;
  if (/[\p{L}\p{N}]/u.test(typed)) return undefined;
  let edit: Edit = { text, cursor };
  // The sign: "*" ·, "<=" ≤, ">=" ≥, "!=" ≠.
  const compared = typed === '=' ? COMPARISON_SIGNS[text[cursor - 2] ?? ''] : undefined;
  const sign = typed === '*' ? { from: cursor - 1, by: '·' } : compared ? { from: cursor - 2, by: compared } : undefined;
  if (sign) edit = { text: text.slice(0, sign.from) + sign.by + text.slice(cursor), cursor: sign.from + sign.by.length };
  // The name of a Greek letter just ended by this character.
  const end = sign ? sign.from : cursor - 1;
  const word = /(?:^|[^\p{L}\p{N}_])([A-Za-z]+)$/u.exec(edit.text.slice(0, end))?.[1];
  const letter = word ? GREEK_NAMES[word] : undefined;
  if (word && letter && !isDefinedElsewhere(word)) {
    edit = { text: edit.text.slice(0, end - word.length) + letter + edit.text.slice(end), cursor: edit.cursor - word.length + letter.length };
  }
  return edit.text === text ? undefined : edit;
}

/** One suggestion of the completion: a value of the sheet or a built-in function. */
export interface Completion {
  readonly name: string;
  readonly kind: 'value' | 'function';
  /** The value of a name ("54,00 kN·m"), how a function is written ("max(a; b; …)"). */
  readonly detail: string;
  /** One sentence of a function, the line of a value. */
  readonly note?: string;
}

/**
 * The word being typed at the cursor that completion offers names for, with where it starts; undefined at
 * the start of a line (a new name is being written), after a number (a unit follows) and in strings and comments.
 */
export function wordToComplete(text: string, cursor: number): { word: string; from: number } | undefined {
  const before = text.slice(0, cursor);
  const match = /[\p{L}_][\p{L}\p{N}_]*$/u.exec(before);
  if (!match || inTextAt(text, match.index)) return undefined;
  const head = before.slice(0, match.index);
  if (head.trim() === '' || /\d\s*$/.test(head)) return undefined;
  if (/[\p{L}\p{N}_]/u.test(text[cursor] ?? '')) return undefined;
  return { word: match[0], from: match.index };
}

/** The suggestions for a word: names starting with it (as typed first, then in any case), at most `limit`. */
export function completionsFor(all: readonly Completion[], word: string, limit = 8): Completion[] {
  const lower = word.toLowerCase();
  const exact = all.filter((c) => c.name.startsWith(word));
  const loose = all.filter((c) => !c.name.startsWith(word) && c.name.toLowerCase().startsWith(lower));
  const found = [...exact, ...loose].slice(0, limit);
  // Nothing to offer when the word is already the one name it could be.
  return found.length === 1 && found[0]!.name === word ? [] : found;
}
