/**
 * Number notation of the language the user writes in.
 *
 * The sheet file is language-neutral: "50.5" and "," between arguments.
 * Languages with a decimal comma write "50,5" and ";" between arguments, as
 * in their spreadsheets. The editor shows lines in local notation and stores
 * them back in file notation. Strings and comments are never changed, and
 * both conversions keep every character in place (same length), so the caret
 * does not move.
 */

import { tokenize, type Token } from './lexer.js';

/** File notation -> decimal-comma notation: 50.5 -> 50,5 and max(a, b) -> max(a; b). */
export function toDecimalComma(text: string): string {
  return rewrite(text, tokenize(text).tokens, (token, chars) => {
    if (token.type === 'number') replaceIn(chars, token, '.', ',');
    else if (token.type === ',') chars[token.span.offset] = ';';
  });
}

/** Decimal-comma notation -> file notation. A "." typed by habit is accepted too. */
export function fromDecimalComma(text: string): string {
  return rewrite(text, tokenize(text, { decimalComma: true }).tokens, (token, chars) => {
    if (token.type === 'number') replaceIn(chars, token, ',', '.');
    else if (token.type === ',' && chars[token.span.offset] === ';') chars[token.span.offset] = ',';
  });
}

function rewrite(text: string, tokens: readonly Token[], change: (token: Token, chars: string[]) => void): string {
  // Token offsets count UTF-16 code units, so split into code units too.
  const chars = text.split('');
  for (const token of tokens) change(token, chars);
  return chars.join('');
}

function replaceIn(chars: string[], token: Token, from: string, to: string): void {
  for (let i = token.span.offset; i < token.span.offset + token.span.length; i++) {
    if (chars[i] === from) chars[i] = to;
  }
}
