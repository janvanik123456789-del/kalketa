/**
 * Where a picture or a chart stands among the lines: read from its line and
 * written back into it. A picture keeps it in braces after the path
 * (![S](a.png){width=40% wrap=right}), a chart in its place option
 * (plot(M(x), x: 0 m .. L, place: "width=40% wrap=right")).
 */

import { formatPicture, formatPlacement, parsePicture, parsePlacement, type Placement } from '@kalketa/core';

export interface Placeable {
  readonly kind: 'picture' | 'chart';
  readonly place: Placement;
  /** The line with this placement instead. */
  write(place: Placement): string;
}

const PLOT = /^\s*plot\s*\(/;
const PLACE = /,?\s*place\s*:\s*"([^"]*)"/;

export function placeable(text: string): Placeable | undefined {
  const picture = parsePicture(text);
  if (picture) return { kind: 'picture', place: picture, write: (place) => formatPicture({ ...place, caption: picture.caption, path: picture.path }) };
  if (!PLOT.test(text)) return undefined;
  const found = PLACE.exec(text);
  const place = found ? parsePlacement(found[1]!) : {};
  if (!place) return undefined;
  return { kind: 'chart', place, write: (next) => withPlotPlace(text, formatPlacement(next)) };
}

/** The plot line with its place option set to `options`; without it when they are empty. */
export function withPlotPlace(text: string, options: string): string {
  const found = PLACE.exec(text);
  if (found) {
    if (!options) return text.slice(0, found.index) + text.slice(found.index + found[0].length);
    const comma = found[0].startsWith(',') ? ', ' : found[0].match(/^\s*/)![0];
    return `${text.slice(0, found.index)}${comma}place: "${options}"${text.slice(found.index + found[0].length)}`;
  }
  if (!options) return text;
  const close = closingParen(text, text.indexOf('('));
  if (close < 0) return text;
  return `${text.slice(0, close)}, place: "${options}"${text.slice(close)}`;
}

/** The parenthesis that closes the one at `open`, past texts in quotes; -1 when it is missing. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}
