/**
 * Dates (docs/03-jazyk.md, ch. 6): a date is an absolute time, like an
 * absolute temperature. Stored in seconds since 1970-01-01 (UTC, so a result
 * never depends on the computer's time zone), shown as a calendar day.
 *
 *   2026-09-29 − 2026-01-01    → 271 d        (a difference)
 *   2026-09-29 + 30 d          → 29. 10. 2026 (a date)
 *   (d_2 − d_1) | a            → years
 */

import { dim } from '../units/dimension.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type Quantity } from './value.js';

const DAY = 86_400;

/** The "unit" of dates: days from 1970-01-01, absolute; a difference of dates is in days. */
export const DATE_UNIT: ResolvedUnit = { symbol: 'date', factor: DAY, dim: dim({ T: 1 }), offset: 0, delta: 'd' };

/** Days from 1970-01-01 of a calendar day (proleptic Gregorian calendar). */
export function daysFromCivil(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / (DAY * 1000));
}

export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const d = new Date(Math.round(days) * DAY * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** A real calendar day? (2026-02-30 is not.) */
export function isValidDay(year: number, month: number, day: number): boolean {
  const back = civilFromDays(daysFromCivil(year, month, day));
  return back.year === year && back.month === month && back.day === day;
}

/** "2026-09-29" or "29.9.2026" (also with spaces: "29. 9. 2026"); undefined when not a date. */
export function parseDate(text: string): number | undefined {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const czech = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(t);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : czech ? [czech[3], czech[2], czech[1]] : [];
  if (year === undefined) return undefined;
  const [y, m, d] = [Number(year), Number(month), Number(day)];
  return isValidDay(y, m, d) ? daysFromCivil(y, m, d) : undefined;
}

export function dateValue(days: number): Quantity {
  return quantity(days * DAY, DATE_UNIT.dim, { absolute: true, hint: DATE_UNIT });
}

/** A date (and not, say, an absolute temperature). */
export function isDate(q: Quantity): boolean {
  return q.absolute === true && q.hint?.symbol === DATE_UNIT.symbol;
}

/** Days from 1970-01-01 of a date value. */
export function daysOf(q: Quantity): number {
  return q.si / DAY;
}
