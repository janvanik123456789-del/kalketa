/**
 * Lexer: source text -> tokens.
 *
 * Unicode and ASCII spellings produce the same tokens (· and *, ≤ and <=,
 * ² and ^2, sigma and σ, degC and °C), so the parser never sees the difference.
 */

import { diagnostic, type Diagnostic, type Span } from '../diagnostics.js';
import { normalizeIdentifier } from './names.js';
import { daysFromCivil, isValidDay } from '../values/date.js';

export type TokenType =
  | 'number' | 'ident' | 'string' | 'superscript' | 'date'
  | 'heading' | 'comment' | 'directive' | 'picture' | 'attributes'
  | '+' | '-' | '*' | '/' | '^' | '√' | '∛'
  | '(' | ')' | '[' | ']' | ',' | '.' | '..' | ':' | '|'
  | ':=' | '=' | '==' | '!=' | '<' | '<=' | '>' | '>='
  | 'newline' | 'eof';

export interface Token {
  readonly type: TokenType;
  /** Normalized text: identifier name, string contents, heading text, ... */
  readonly text: string;
  /** Numeric value for numbers and superscripts, heading level for headings. */
  readonly value: number;
  /** A number written with i or j right after it: 4j. */
  readonly imaginary?: boolean;
  readonly span: Span;
}

export interface LexResult {
  readonly tokens: Token[];
  readonly diagnostics: Diagnostic[];
}

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};

/** Multi-character operators first, so ":=" wins over ":". */
const OPERATORS: readonly (readonly [string, TokenType])[] = [
  [':=', ':='], ['==', '=='], ['!=', '!='], ['<=', '<='], ['>=', '>='],
  ['≠', '!='], ['≤', '<='], ['≥', '>='],
  ['+', '+'], ['-', '-'], ['−', '-'], ['*', '*'], ['·', '*'], ['⋅', '*'], ['×', '*'],
  ['/', '/'], ['÷', '/'], ['^', '^'], ['√', '√'], ['∛', '∛'],
  ['(', '('], [')', ')'], ['[', '['], [']', ']'], [',', ','], ['..', '..'], ['…', '..'], ['.', '.'],
  [':', ':'], ['|', '|'], ['=', '='], ['<', '<'], ['>', '>'],
];

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';
const isIdentStart = (ch: string): boolean => /[\p{L}°%‰€$£¥]/u.test(ch);
// Superscript digits are not part of a name (L² is L squared), subscripts are (T₁).
const isIdentPart = (ch: string): boolean => /[\p{L}\p{Nd}\p{M}_°₀-₉]/u.test(ch);

export interface LexOptions {
  /**
   * Local notation of languages with a decimal comma: "50,5" is a number and
   * ";" separates arguments. The sheet file itself always uses "50.5" and ",".
   */
  readonly decimalComma?: boolean;
}

export function tokenize(source: string, options: LexOptions = {}): LexResult {
  const decimalComma = options.decimalComma ?? false;
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  const spanFrom = (start: number): Span => ({
    offset: start,
    length: pos - start,
    line,
    column: start - lineStart + 1,
  });
  const push = (type: TokenType, start: number, text: string, value = 0): void => {
    tokens.push({ type, text, value, span: spanFrom(start) });
  };
  const atLineStart = (): boolean => source.slice(lineStart, pos).trim() === '';

  while (pos < source.length) {
    const ch = source[pos]!;
    const start = pos;

    if (ch === '\n') {
      pos++;
      push('newline', start, '\n');
      line++;
      lineStart = pos;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === ' ' || ch === ' ') {
      pos++;
      continue;
    }

    // A picture line, as in Markdown: ![caption](images/sheet/schema.png){width=60%}
    if (ch === '!' && source[pos + 1] === '[' && atLineStart()) {
      const end = lineEnd(source, pos);
      // A trailing ' comment is not part of the picture (captions may contain apostrophes only in the brackets).
      const text = source.slice(pos, end).trim();
      pos = end;
      push('picture', start, text);
      continue;
    }

    // Line-level constructs: headings and directives.
    if ((ch === '#' || ch === '@') && atLineStart()) {
      if (ch === '#') {
        let level = 0;
        while (source[pos] === '#') { level++; pos++; }
        const end = lineEnd(source, pos);
        const text = source.slice(pos, end).trim();
        pos = end;
        push('heading', start, text, level);
      } else {
        pos++;
        while (pos < source.length && isIdentPart(source[pos]!)) pos++;
        push('directive', start, source.slice(start + 1, pos));
      }
      continue;
    }

    // How the line is shown, at its end (before a comment): σ_k := R_m/2 | MPa  {decimals=1}
    if (ch === '{') {
      const end = lineEnd(source, pos);
      const attributes = /^\{([^{}'"\n]*)\}[ \t]*(?='|$)/.exec(source.slice(pos, end).replace(/\r$/, ''));
      if (attributes) {
        pos += attributes[0].length;
        push('attributes', start, attributes[1]!.trim());
        continue;
      }
    }

    // Comment: ' until end of line.
    if (ch === "'") {
      const end = lineEnd(source, pos);
      const text = source.slice(pos + 1, end).trim();
      pos = end;
      push('comment', start, text);
      continue;
    }

    if (ch === '"') {
      pos++;
      while (pos < source.length && source[pos] !== '"' && source[pos] !== '\n') pos++;
      if (source[pos] !== '"') {
        diagnostics.push(diagnostic('E-UNTERMINATED-STRING', spanFrom(start)));
        push('string', start, source.slice(start + 1, pos));
        continue;
      }
      pos++;
      push('string', start, source.slice(start + 1, pos - 1));
      continue;
    }

    // A date: 2026-09-29 (not a subtraction). Its value is days from 1970-01-01.
    if (isDigit(ch)) {
      const date = /^(\d{4})-(\d{2})-(\d{2})(?![\p{L}\p{Nd}_])/u.exec(source.slice(pos, pos + 11));
      if (date) {
        pos += 10;
        const [y, m, d] = [Number(date[1]), Number(date[2]), Number(date[3])];
        if (!isValidDay(y, m, d)) diagnostics.push(diagnostic('E-DATE-INVALID', spanFrom(start), { value: date[0] }));
        push('date', start, date[0], daysFromCivil(y, m, d));
        continue;
      }
    }
    // "0 .. 10" and "0..10": a range, not the number .10.
    if (ch === '.' && source[pos + 1] === '.') {
      pos += 2;
      push('..', start, '..');
      continue;
    }
    if (isDigit(ch) || (ch === '.' && isDigit(source[pos + 1]))) {
      const text = readNumber();
      // An imaginary number: 4j or 4i, with nothing between the digits and the letter.
      const suffix = source[pos];
      if ((suffix === 'j' || suffix === 'i') && !isIdentPart(source[pos + 1] ?? ' ')) {
        pos++;
        tokens.push({ type: 'number', text, value: Number(text), imaginary: true, span: spanFrom(start) });
        continue;
      }
      push('number', start, text, Number(text));
      continue;
    }

    if (ch in SUPERSCRIPTS) {
      let digits = '';
      while (pos < source.length && source[pos]! in SUPERSCRIPTS) {
        digits += SUPERSCRIPTS[source[pos]!];
        pos++;
      }
      push('superscript', start, digits, Number(digits));
      continue;
    }

    if (isIdentStart(ch)) {
      // % and ‰ are complete symbols on their own.
      if (ch === '%' || ch === '‰') {
        pos++;
      } else {
        pos++;
        while (pos < source.length && isIdentPart(source[pos]!)) pos++;
      }
      push('ident', start, normalizeIdentifier(source.slice(start, pos)));
      continue;
    }

    if (decimalComma && ch === ';') {
      pos++;
      push(',', start, ';');
      continue;
    }

    const op = OPERATORS.find(([text]) => source.startsWith(text, pos));
    if (op) {
      pos += op[0].length;
      push(op[1], start, op[0]);
      continue;
    }

    pos++;
    diagnostics.push(diagnostic('E-UNEXPECTED-CHAR', spanFrom(start), { char: ch }));
  }

  push('eof', pos, '');
  return { tokens, diagnostics };

  /** Digits with optional "_" separators, decimals and exponent (1.5e-3). */
  function readNumber(): string {
    let text = '';
    const digits = (): void => {
      while (isDigit(source[pos]) || (source[pos] === '_' && isDigit(source[pos + 1]) && isDigit(source[pos - 1]))) {
        if (source[pos] !== '_') text += source[pos];
        pos++;
      }
    };
    digits();
    const separator = source[pos];
    if ((separator === '.' || (decimalComma && separator === ',')) && isDigit(source[pos + 1])) {
      text += '.';
      pos++;
      digits();
    }
    const e = source[pos];
    if (e === 'e' || e === 'E') {
      const sign = source[pos + 1];
      const hasSign = sign === '+' || sign === '-';
      if (isDigit(source[pos + (hasSign ? 2 : 1)])) {
        text += 'e' + (hasSign ? sign : '');
        pos += hasSign ? 2 : 1;
        digits();
      }
    }
    return text;
  }
}

function lineEnd(source: string, from: number): number {
  const end = source.indexOf('\n', from);
  return end === -1 ? source.length : end;
}
