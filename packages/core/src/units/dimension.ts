/**
 * Physical dimensions as sparse maps of base dimension -> exponent.
 *
 * A sparse map (instead of a fixed array as in postgresql-unit) lets sheets
 * define their own base dimensions later (currency, pieces, ...), each with
 * its own exponent. Zero exponents are never stored, so two equal dimensions
 * always have the same keys.
 */

export type Dimension = Readonly<Record<string, number>>;

/** SI base dimensions, in the order used for display. */
export const BASE_DIMENSIONS = ['M', 'L', 'T', 'I', 'Θ', 'N', 'J'] as const;

export const DIMENSIONLESS: Dimension = Object.freeze({});

export function dim(parts: Record<string, number>): Dimension {
  const out: Record<string, number> = {};
  for (const [key, exp] of Object.entries(parts)) {
    if (exp !== 0) out[key] = exp;
  }
  return Object.freeze(out);
}

export function multiplyDims(a: Dimension, b: Dimension): Dimension {
  const out: Record<string, number> = { ...a };
  for (const [key, exp] of Object.entries(b)) {
    out[key] = (out[key] ?? 0) + exp;
  }
  return dim(out);
}

export function divideDims(a: Dimension, b: Dimension): Dimension {
  return multiplyDims(a, powerDim(b, -1));
}

export function powerDim(d: Dimension, n: number): Dimension {
  const out: Record<string, number> = {};
  for (const [key, exp] of Object.entries(d)) {
    // Round away floating point noise such as 0.5 * 2 = 0.9999999999.
    out[key] = Math.round(exp * n * 1e9) / 1e9;
  }
  return dim(out);
}

export function sameDim(a: Dimension, b: Dimension): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((key) => a[key] === b[key]);
}

export function isDimensionless(d: Dimension): boolean {
  return Object.keys(d).length === 0;
}

/** Stable text form used in diagnostics and cache keys, e.g. "M·L²·T⁻²". */
export function dimKey(d: Dimension): string {
  const keys = Object.keys(d).sort((x, y) => orderOf(x) - orderOf(y) || x.localeCompare(y));
  if (keys.length === 0) return '1';
  return keys.map((key) => key + superscript(d[key]!)).join('·');
}

function orderOf(key: string): number {
  const i = (BASE_DIMENSIONS as readonly string[]).indexOf(key);
  return i === -1 ? BASE_DIMENSIONS.length : i;
}

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '-': '⁻', '.': '·',
};

/** Exponent as superscript; 1 is omitted. Non-integers use "^x". */
export function superscript(exp: number): string {
  if (exp === 1) return '';
  if (!Number.isInteger(exp)) return `^${exp}`;
  return [...String(exp)].map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch).join('');
}
