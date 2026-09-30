/**
 * Typing helpers of the row editor (docs/03-jazyk.md, ch. 2):
 * "=" typed right after a new name at the start of a line becomes ":=", also
 * after the head of a new function: "A_kruh(d) =" becomes "A_kruh(d) :=".
 */

import { builtinFunctions } from '@calccanvas/core';

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
