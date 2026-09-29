/**
 * @calccanvas/i18n — turns diagnostics into messages and formats numbers
 * in the user's language.
 */

import type { Diagnostic } from '@calccanvas/core';
import type { Catalog } from './catalog.js';
import { cs } from './locales/cs.js';
import { en } from './locales/en.js';

export type { Catalog } from './catalog.js';

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
}

/**
 * Engineering-friendly number: significant digits, locale separators and
 * scientific notation for very large or very small magnitudes.
 */
export function formatNumber(value: number, catalog: Catalog, options: NumberFormatOptions = {}): string {
  const digits = options.digits ?? 4;
  const abs = Math.abs(value);
  const scientific = abs !== 0 && (abs >= 1e9 || abs < 1e-4);
  return new Intl.NumberFormat(catalog.locale, {
    maximumSignificantDigits: digits,
    ...(scientific ? { notation: 'scientific' } : {}),
  }).format(value);
}
