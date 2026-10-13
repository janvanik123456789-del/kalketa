/**
 * @kalketa/i18n — turns diagnostics into messages and formats numbers
 * in the user's language.
 */

import type { Diagnostic } from '@kalketa/core';
import type { Catalog } from './catalog.js';
import { cs } from './locales/cs.js';
import { en } from './locales/en.js';

export { UI_KEYS, type Catalog, type UiKey } from './catalog.js';
import type { UiKey } from './catalog.js';

/** UI label with {param} placeholders filled in. */
export function t(catalog: Catalog, key: UiKey, params: Readonly<Record<string, string | number>> = {}): string {
  return catalog.ui[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : typeof value === 'number' ? formatNumber(value, catalog) : value;
  });
}

export const CATALOGS: Readonly<Record<string, Catalog>> = { en, cs };

export const DEFAULT_LOCALE = 'en';

/** Catalog for a locale such as "cs" or "cs-CZ"; falls back to English. */
export function catalogFor(locale: string): Catalog {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? DEFAULT_LOCALE;
  return CATALOGS[language] ?? en;
}

export function formatDiagnostic(d: Diagnostic, catalog: Catalog): string {
  const template = catalog.diagnostics[d.code] ?? d.code;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = d.params[key];
    if (value === undefined) return match;
    return typeof value === 'string' ? (catalog.terms[value] ?? value) : formatNumber(value, catalog);
  });
}

export interface NumberFormatOptions {
  /** Significant digits (default 4). */
  readonly digits?: number;
  /**
   * Places after the decimal sign instead, always shown (5,47; 23,53). A number too small
   * or too large for them is written with an exponent and as many significant digits.
   */
  readonly decimals?: number;
}

/**
 * Engineering-friendly number: significant digits, locale separators and
 * scientific notation for very large or very small magnitudes.
 */
/**
 * A value that may be complex, with its unit: "46 A", "(27,6 − 36,8j) A", "4j".
 * The imaginary unit is written j, as electrical engineers do.
 */
export function formatValue(value: number, im: number | undefined, unit: string, catalog: Catalog, options: NumberFormatOptions = {}): string {
  if (unit === 'date') return formatDate(value, catalog);
  const number = im ? complexText(value, im, (x) => formatNumber(x, catalog, options)) : formatNumber(value, catalog, options);
  if (!unit) return number;
  return im && value !== 0 ? `(${number}) ${unit}` : `${number} ${unit}`;
}

/** A calendar day given as days from 1970-01-01: "29. 9. 2026" in Czech, "9/29/2026" in English. */
export function formatDate(days: number, catalog: Catalog): string {
  return new Intl.DateTimeFormat(catalog.locale, { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(Math.round(days) * 86_400_000));
}

/** "3 + 4j", "−2 − 1,5j", "4j" from the parts, each formatted by `format`. */
export function complexText(re: number, im: number, format: (x: number) => string): string {
  const imaginary = `${format(Math.abs(im))}j`;
  if (re === 0) return im < 0 ? `−${imaginary}` : imaginary;
  return `${format(re).replace('-', '−')} ${im < 0 ? '−' : '+'} ${imaginary}`;
}

export function formatNumber(value: number, catalog: Catalog, options: NumberFormatOptions = {}): string {
  // −0 (as −b/(2·a) with b = 0 gives) and a negative number rounded to nothing are plain 0.
  const shown = formatSigned(value === 0 ? 0 : value, catalog, options);
  return /^[-−]0(?:[.,]0+)?$/.test(shown) ? shown.slice(1) : shown;
}

function formatSigned(value: number, catalog: Catalog, options: NumberFormatOptions): string {
  const digits = options.digits ?? 4;
  const abs = Math.abs(value);
  const scientific = abs !== 0 && (abs >= 1e9 || abs < 1e-4);
  const decimals = options.decimals;
  if (decimals !== undefined && !scientific && (abs === 0 || abs >= 10 ** -decimals / 2)) {
    return new Intl.NumberFormat(catalog.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  }
  if (decimals !== undefined) {
    return new Intl.NumberFormat(catalog.locale, { maximumSignificantDigits: Math.max(1, decimals + 1), notation: 'scientific' }).format(value);
  }
  return new Intl.NumberFormat(catalog.locale, {
    maximumSignificantDigits: digits,
    ...(scientific ? { notation: 'scientific' } : {}),
  }).format(value);
}
