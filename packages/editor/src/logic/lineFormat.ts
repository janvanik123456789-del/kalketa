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
