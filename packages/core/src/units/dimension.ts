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
  let any = false;
  for (const key in parts) {
    const exp = parts[key]!;
    if (exp !== 0) {
      out[key] = exp;
      any = true;
    }
  }
  return any ? Object.freeze(out) : DIMENSIONLESS;
}

// Dimensions are frozen and the same few meet again and again (inside an integral, a chart, a solver):
// their products and powers are kept, so they are composed once.
const products = new WeakMap<Dimension, WeakMap<Dimension, Dimension>>();
const powers = new WeakMap<Dimension, Map<number, Dimension>>();

export function multiplyDims(a: Dimension, b: Dimension): Dimension {
  if (a === DIMENSIONLESS || isEmpty(a)) return b;
  if (b === DIMENSIONLESS || isEmpty(b)) return a;
  let row = products.get(a);
  const known = row?.get(b);
  if (known) return known;
  const out: Record<string, number> = { ...a };
  for (const key in b) out[key] = (out[key] ?? 0) + b[key]!;
  const product = dim(out);
  if (!row) products.set(a, (row = new WeakMap()));
  row.set(b, product);
  return product;
}

export function divideDims(a: Dimension, b: Dimension): Dimension {
  if (b === DIMENSIONLESS || isEmpty(b)) return a;
  if (a === b) return DIMENSIONLESS;
  return multiplyDims(a, powerDim(b, -1));
}

export function powerDim(d: Dimension, n: number): Dimension {
  if (n === 1 || d === DIMENSIONLESS || isEmpty(d)) return n === 0 ? DIMENSIONLESS : d;
  let row = powers.get(d);
  const known = row?.get(n);
  if (known) return known;
  const out: Record<string, number> = {};
  for (const key in d) {
    // Round away floating point noise such as 0.5 * 2 = 0.9999999999.
    out[key] = Math.round(d[key]! * n * 1e9) / 1e9;
  }
  const power = dim(out);
  if (!row) powers.set(d, (row = new Map()));
  if (row.size < 64) row.set(n, power);
  return power;
}

function isEmpty(d: Dimension): boolean {
  for (const _ in d) return false;
  return true;
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
