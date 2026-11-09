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
   * Places after the decimal sign instead, always shown (5,47; 23,53; 1 234 567 890,50). A number too small for
   * them, or one that would need more than the 15 significant digits a calculation holds, is written with an
   * exponent and as many significant digits as it has (the core says so on the line, I-DECIMALS-PRECISION).
   */
  readonly decimals?: number;
  /**
   * The value as an exact whole number, where the calculation knows it (20! is 2432902008176640000): with decimals
   * asked, every digit of it is written, however many, as none of them is invented.
   */
  readonly exactWhole?: bigint;
  /** Money: the whole part is never rounded (643 212 USD, not 643 200), however few significant digits are asked. */
  readonly whole?: boolean;
  /** Money to the cent (129 226,88 Kč), unless decimals are asked; with whole only. */
  readonly cents?: boolean;
  /**
   * A number without a unit (a year, a count): four digits stand without a space (2030, 1500), as Czech
   * typography allows and a year is always written; five and more are grouped (12 450).
   */
  readonly unitless?: boolean;
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
  if (!unit) return im ? number : formatNumber(value, catalog, { ...options, unitless: true });
  const gap = unitGap(unit);
  return im && value !== 0 ? `(${number})${gap}${unit}` : `${number}${gap}${unit}`;
}

/** What stands between a number and its unit: a space ("20 °C", "5 m"), none before a degree, minute or second of angle ("120°"). */
export function unitGap(unit: string): string {
  return /^[°′″]$/.test(unit) ? '' : ' ';
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

/**
 * The utilization of a check as a percentage that agrees with its verdict: a failed one over its limit by 0,04 % is
 * "100,04 %", not "100 %" beside NEVYHOVUJE; over it by less than nine digits show, "> 100 %".
 */
export function formatUtilization(ratio: number, passed: boolean, catalog: Catalog, digits = 4): string {
  // Next to nothing of a limit is said so: 7,034E-5 % would only stop the reader.
  if (ratio !== 0 && Math.abs(ratio) < 1e-4) return `< ${formatNumber(0.01, catalog, { digits: 4 })} %`;
  if (!passed && ratio > 1) {
    for (let more = digits; more <= 9; more++) {
      if (Number((ratio * 100).toPrecision(more)) > 100) return `${formatNumber(ratio * 100, catalog, { digits: more })} %`;
    }
    return `> ${formatNumber(100, catalog)} %`;
  }
  return `${formatNumber(ratio * 100, catalog, { digits })} %`;
}

/** Significant digits a calculation in double precision holds and a number is shown with at most. */
export const SHOWN_DIGITS = 15;

export function formatNumber(value: number, catalog: Catalog, options: NumberFormatOptions = {}): string {
  if (options.decimals !== undefined && options.exactWhole !== undefined) {
    const grouping = options.unitless ? { useGrouping: 'min2' as unknown as boolean } : {};
    return new Intl.NumberFormat(catalog.locale, { minimumFractionDigits: options.decimals, maximumFractionDigits: options.decimals, ...grouping }).format(options.exactWhole);
  }
  // −0 (as −b/(2·a) with b = 0 gives) and a negative number rounded to nothing are plain 0.
  // Read to 15 digits first: 1.025³·120 000 is 129 226,874999… in binary, 129 226,875 on paper, and rounds to ,88.
  const clean = Number.isFinite(value) ? Number(value.toPrecision(15)) : value;
  const shown = formatSigned(clean === 0 ? 0 : clean, catalog, options);
  return /^[-−]0(?:[.,]0+)?$/.test(shown) ? shown.slice(1) : shown;
}

function formatSigned(value: number, catalog: Catalog, options: NumberFormatOptions): string {
  const abs = Math.abs(value);
  const places = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 0;
  const digits = options.whole && abs < 1e15 ? Math.max(options.digits ?? 4, places) : (options.digits ?? 4);
  const scientific = abs !== 0 && ((abs >= 1e9 && !(options.whole && abs < 1e15)) || abs < 1e-4);
  const asked = options.decimals ?? (options.whole && options.cents ? 2 : undefined);
  // Places past the digits a calculation holds are invented: T := 17.0652165601579625588917206249 is 17,0652165601580,
  // not 17,0652165601580000000000000000. Up to 17 significant digits are left as written (13 983 816,00000000).
  const leading = abs >= 1e-4 && abs < 1e9 ? Math.floor(Math.log10(abs)) + 1 : 0;
  const decimals = asked !== undefined && leading + asked > SHOWN_DIGITS + 2 ? Math.max(0, SHOWN_DIGITS - leading) : asked;
  // 'min2' groups only from five digits on (Intl's option; the lib types know only booleans and 'always' / 'auto').
  const grouping = options.unitless ? { useGrouping: 'min2' as unknown as boolean } : {};
  if (decimals !== undefined) {
    // Places as asked, a large number too (1 234 567 890,50), while they stay within the digits a calculation holds.
    // (Below 10⁹ as always: 13 983 816,00000000 keeps its places.)
    if (abs === 0 || (abs >= 1e-4 && abs >= 10 ** -decimals / 2 && (abs < 1e9 || places + decimals <= SHOWN_DIGITS))) {
      return new Intl.NumberFormat(catalog.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, ...grouping }).format(value);
    }
    if (abs >= 1) {
      // Past them, with an exponent and all the digits held: more were asked than there are (30! {decimals=0} is
      // 2,65252859812191·10³², not 3·10³²).
      return new Intl.NumberFormat(catalog.locale, { maximumSignificantDigits: SHOWN_DIGITS, notation: 'scientific' }).format(value);
    }
    return new Intl.NumberFormat(catalog.locale, { maximumSignificantDigits: Math.max(1, decimals + 1), notation: 'scientific' }).format(value);
  }
  return new Intl.NumberFormat(catalog.locale, {
    maximumSignificantDigits: digits,
    ...(scientific ? { notation: 'scientific' } : {}),
    ...grouping,
  }).format(value);
}
