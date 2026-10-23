/**
 * Options of functions served in the Details pane (docs/navrhy/NAPADY-NA-POZDEJI.md, 2026-10-15): a switch for
 * steps: true, a choice for kind: "exp", the set of a solve line. A change rewrites the line, so what is written
 * stays the truth; an option at its default is left out of the line.
 */

import type { UiKey } from '@kalketa/i18n';

/** One option of a function: yes/no (written name: true) or one of some values (written as they are). */
export type FunctionOption =
  | { readonly kind: 'flag'; readonly name: string; readonly label: UiKey }
  | { readonly kind: 'choice'; readonly name: string; readonly label: UiKey; readonly values: readonly { readonly value: string; readonly label: UiKey }[] };

const STEPS: FunctionOption = { kind: 'flag', name: 'steps', label: 'opt.steps' };

/** The options of each function; the first value of a choice is its default (not written). */
export const FUNCTION_OPTIONS: Readonly<Record<string, readonly FunctionOption[]>> = {
  fit: [
    {
      kind: 'choice',
      name: 'kind',
      label: 'opt.fitKind',
      values: [
        { value: '"linear"', label: 'opt.fit.linear' },
        { value: '"poly2"', label: 'opt.fit.poly2' },
        { value: '"poly3"', label: 'opt.fit.poly3' },
        { value: '"exp"', label: 'opt.fit.exp' },
        { value: '"power"', label: 'opt.fit.power' },
        { value: '"log"', label: 'opt.fit.log' },
      ],
    },
    STEPS,
  ],
  polyfit: [STEPS],
  derivative: [
    {
      kind: 'choice',
      name: 'order',
      label: 'opt.order',
      values: [
        { value: '1', label: 'opt.order.1' },
        { value: '2', label: 'opt.order.2' },
      ],
    },
  ],
  plot: [
    {
      kind: 'choice',
      name: 'kind',
      label: 'opt.plotKind',
      values: [
        { value: '"line"', label: 'opt.plot.line' },
        { value: '"points"', label: 'opt.plot.points' },
        { value: '"bar"', label: 'opt.plot.bar' },
      ],
    },
    { kind: 'flag', name: 'roots', label: 'opt.roots' },
  ],
};

/** The set of numbers of a solve line, as the ℝ▾ button writes it; '' for none (one root, found numerically). */
export const SOLVE_DOMAINS: readonly { readonly value: string; readonly label: UiKey }[] = [
  { value: '', label: 'opt.domain.none' },
  { value: 'ℝ', label: 'sets.real' },
  { value: 'ℂ', label: 'sets.complex' },
  { value: 'ℕ', label: 'sets.natural' },
  { value: 'ℕ₀', label: 'sets.natural0' },
  { value: 'ℤ', label: 'sets.integer' },
];

/** The closing parenthesis of the call opened at `open`, past brackets and texts in quotes; -1 if none. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && --depth === 0) return i;
  }
  return -1;
}

/** Where the call of fn opens in the line (its "("), outside texts in quotes; -1 if it is not called. */
function callOpen(text: string, fn: string): number {
  const blanked = text.replace(/"[^"\n]*"/g, (s) => ' '.repeat(s.length));
  const m = new RegExp(`(?<![\\p{L}\\p{N}_])${fn}\\s*\\(`, 'u').exec(blanked);
  return m ? m.index + m[0].length - 1 : -1;
}

/** Where a named argument of the call of fn stands: from its comma to its end; its value as written. */
function argumentSpan(text: string, fn: string, name: string): { start: number; end: number; value: string } | undefined {
  const open = callOpen(text, fn);
  const close = open < 0 ? -1 : closingParen(text, open);
  if (close < 0) return undefined;
  let depth = 0;
  let itemStart = open + 1;
  for (let i = open + 1; i <= close; i++) {
    const c = text[i];
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) return undefined;
      i = end;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0 && i < close) depth--;
    else if ((c === ',' && depth === 0) || i === close) {
      const item = text.slice(itemStart, i);
      const m = new RegExp(`^\\s*${name}\\s*:\\s*`).exec(item);
      if (m) return { start: itemStart - 1, end: i, value: item.slice(m[0].length).trim() };
      itemStart = i + 1;
    }
  }
  return undefined;
}

/** The value of an option of the call of fn as written in the line, undefined when it is not written. */
export function optionValue(text: string, fn: string, name: string): string | undefined {
  return argumentSpan(text, fn, name)?.value;
}

/** The line with the option of the call of fn set to `value`, or left out (undefined: the default). */
export function withOption(text: string, fn: string, name: string, value: string | undefined): string {
  const found = argumentSpan(text, fn, name);
  // The first argument may stand alone in the call: its comma is the opening parenthesis.
  const without = found ? (text[found.start] === '(' ? `${text.slice(0, found.start + 1)}${text.slice(found.end + (text[found.end] === ',' ? 1 : 0)).replace(/^\s+/, '')}` : text.slice(0, found.start) + text.slice(found.end)) : text;
  if (value === undefined) return without;
  const open = callOpen(without, fn);
  const close = open < 0 ? -1 : closingParen(without, open);
  if (close < 0) return text;
  const empty = without.slice(open + 1, close).trim() === '';
  return `${without.slice(0, close)}${empty ? '' : ', '}${name}: ${value}${without.slice(close)}`;
}

/** The current value of an option: as written, else its default (the first value; false for a flag). */
export function currentOption(text: string, fn: string, option: FunctionOption): string {
  const written = optionValue(text, fn, option.name);
  if (option.kind === 'flag') return written === 'true' ? 'true' : 'false';
  return option.values.find((v) => v.value === written)?.value ?? written ?? option.values[0]!.value;
}

/** The line with an option changed: a flag on as name: true, off left out; a choice at its default left out. */
export function setOption(text: string, fn: string, option: FunctionOption, value: string): string {
  if (option.kind === 'flag') return withOption(text, fn, option.name, value === 'true' ? 'true' : undefined);
  return withOption(text, fn, option.name, value === option.values[0]!.value ? undefined : value);
}

const SOLVE_HEAD = /^(\s*solve\s+)([^:∈]*?)(\s*∈\s*[^\s,:]+)?(\s*[,:])/;

/** The set of a solve line ('' for none), or undefined for no solve line (or one of several unknowns). */
export function solveDomain(text: string): string | undefined {
  const m = SOLVE_HEAD.exec(text);
  if (!m || m[2]!.includes('(') || m[2]!.includes(',')) return undefined;
  return m[3]?.replace(/^\s*∈\s*/, '') ?? '';
}

/** The solve line with its set changed ('' takes it away). */
export function withSolveDomain(text: string, domain: string): string {
  const m = SOLVE_HEAD.exec(text);
  if (!m) return text;
  return `${m[1]}${m[2]}${domain ? ` ∈ ${domain}` : ''}${m[4]}${text.slice(m[0].length)}`;
}
