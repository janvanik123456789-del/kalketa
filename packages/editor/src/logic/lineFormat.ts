/**
 * The format of a line, {decimals=2} or {size=12 italic} at its end (before a
 * comment), written and read for the menu of the right button. Only the first
 * line of a segment carries it.
 */

export type LineFormatChoice = { readonly decimals: number } | { readonly digits: number } | undefined;

/** Attributes of a line by key: "decimals" -> "2", "italic" -> "" (a flag). */
export type LineAttributes = ReadonlyMap<string, string>;

/** Where the comment of a line starts ('), outside "strings"; the line length if none. */
function commentAt(line: string): number {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inString = !inString;
    else if (line[i] === "'" && !inString) return i;
  }
  return line.length;
}

const ATTRIBUTES = /\s*\{[^{}'"\n]*\}\s*$/;

/** The attributes written on the first line of a segment's text. */
export function lineAttributesOf(text: string): LineAttributes {
  const first = text.split('\n')[0]!;
  const block = /\{([^{}'"\n]*)\}\s*$/.exec(first.slice(0, commentAt(first)))?.[1] ?? '';
  return new Map(
    block
      .split(/\s+/)
      .filter(Boolean)
      .map((item) => {
        const at = item.indexOf('=');
        return at < 0 ? ([item, ''] as const) : ([item.slice(0, at), item.slice(at + 1)] as const);
      }),
  );
}

/** The segment's text with the attributes of its first line replaced (none: the block goes). */
export function withLineAttributes(text: string, attributes: LineAttributes): string {
  const [first, ...rest] = text.split('\n');
  const at = commentAt(first!);
  const body = first!.slice(0, at).replace(ATTRIBUTES, '').replace(/\s+$/, '');
  const comment = first!.slice(at);
  const items = [...attributes].map(([key, value]) => (value === '' ? key : `${key}=${value}`));
  const block = items.length > 0 ? ` {${items.join(' ')}}` : '';
  return [`${body}${block}${comment ? `  ${comment}` : ''}`, ...rest].join('\n');
}

/** One attribute set (a value, '' for a flag) or taken away (undefined); the others stay. */
export function withLineAttribute(text: string, key: string, value: string | undefined): string {
  const next = new Map(lineAttributesOf(text));
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  return withLineAttributes(text, next);
}

/** The number format of a line: decimal places or significant digits. */
export function lineFormatOf(text: string): LineFormatChoice {
  const attributes = lineAttributesOf(text);
  const decimals = Number(attributes.get('decimals'));
  if (attributes.has('decimals') && Number.isInteger(decimals)) return { decimals };
  const digits = Number(attributes.get('digits'));
  return attributes.has('digits') && Number.isInteger(digits) ? { digits } : undefined;
}

/** The segment's text with its number format set, or removed (undefined); one replaces the other. */
export function withLineFormat(text: string, format: LineFormatChoice): string {
  const next = new Map(lineAttributesOf(text));
  next.delete('decimals');
  next.delete('digits');
  // Calculating on with the rounded value means nothing without a rounding.
  if (format === undefined) next.delete('rounded');
  if (format && 'decimals' in format) next.set('decimals', String(format.decimals));
  if (format && 'digits' in format) next.set('digits', String(format.digits));
  return withLineAttributes(text, next);
}

/** The parts of a line's first line: its formula, the unit after "|", the source, the attributes and the comment. */
interface LineParts {
  readonly body: string;
  readonly target?: string;
  readonly source?: string;
  readonly tail: string;
}

/** Where the last "|" outside brackets and strings stands (the unit of the result), -1 when there is none. */
function targetAt(code: string): number {
  let depth = 0;
  let inString = false;
  let found = -1;
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (c === '"') inString = !inString;
    else if (inString) continue;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '|' && depth === 0) found = i;
  }
  return found;
}

function partsOf(first: string): LineParts {
  const at = commentAt(first);
  const code = first.slice(0, at);
  const attributes = ATTRIBUTES.exec(code)?.[0] ?? '';
  let body = code.slice(0, code.length - attributes.length).replace(/\s+$/, '');
  const source = /\s+source\s+"([^"]*)"\s*$/.exec(body);
  if (source) body = body.slice(0, source.index);
  const bar = targetAt(body);
  const target = bar >= 0 ? body.slice(bar + 1).trim() : undefined;
  if (bar >= 0) body = body.slice(0, bar).replace(/\s+$/, '');
  return { body, ...(target ? { target } : {}), ...(source ? { source: source[1]! } : {}), tail: `${attributes.replace(/\s+$/, '')}${first.slice(at) ? `  ${first.slice(at)}` : ''}` };
}

function joined(p: LineParts): string {
  return `${p.body}${p.target ? ` | ${p.target}` : ''}${p.source !== undefined ? ` source "${p.source}"` : ''}${p.tail}`;
}

/** The unit the result of a line is shown in (after "|"), undefined when the calculation chooses it. */
export function lineTargetOf(text: string): string | undefined {
  return partsOf(text.split('\n')[0]!).target;
}

/** The line with the unit of its result set, or taken away (undefined): the calculation chooses it then. */
export function withLineTarget(text: string, unit: string | undefined): string {
  const [first, ...rest] = text.split('\n');
  const p = partsOf(first!);
  return [joined({ body: p.body, ...(unit ? { target: unit } : {}), ...(p.source !== undefined ? { source: p.source } : {}), tail: p.tail }), ...rest].join('\n');
}

/** The source of a line (source "EN 1990, 6.10"), undefined when it has none. */
export function lineSourceOf(text: string): string | undefined {
  return partsOf(text.split('\n')[0]!).source;
}

/** The line with its source set, or taken away (undefined or empty); a double quote in it becomes ”. */
export function withLineSource(text: string, source: string | undefined): string {
  const [first, ...rest] = text.split('\n');
  const p = partsOf(first!);
  const clean = source?.trim().replace(/"/g, '”');
  return [joined({ body: p.body, ...(p.target ? { target: p.target } : {}), ...(clean ? { source: clean } : {}), tail: p.tail }), ...rest].join('\n');
}
