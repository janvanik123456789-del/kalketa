/**
 * The format of a line, {decimals=2} or {digits=3} at its end (before a comment),
 * written and read for the menu of the right button. Only the first line of a
 * segment carries it.
 */

export type LineFormatChoice = { readonly decimals: number } | { readonly digits: number } | undefined;

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

/** The format written on the first line of a segment's text. */
export function lineFormatOf(text: string): LineFormatChoice {
  const first = text.split('\n')[0]!;
  const body = first.slice(0, commentAt(first));
  const block = /\{([^{}'"\n]*)\}\s*$/.exec(body)?.[1] ?? '';
  const decimals = /(?:^|\s)decimals=(\d+)(?:\s|$)/.exec(block);
  if (decimals) return { decimals: Number(decimals[1]) };
  const digits = /(?:^|\s)digits=(\d+)(?:\s|$)/.exec(block);
  return digits ? { digits: Number(digits[1]) } : undefined;
}

/** The segment's text with the format of its first line set, or removed (undefined). */
export function withLineFormat(text: string, format: LineFormatChoice): string {
  const [first, ...rest] = text.split('\n');
  const at = commentAt(first!);
  const body = first!.slice(0, at).replace(ATTRIBUTES, '').replace(/\s+$/, '');
  const comment = first!.slice(at);
  const block = format === undefined ? '' : 'decimals' in format ? ` {decimals=${format.decimals}}` : ` {digits=${format.digits}}`;
  return [`${body}${block}${comment ? `  ${comment}` : ''}`, ...rest].join('\n');
}
