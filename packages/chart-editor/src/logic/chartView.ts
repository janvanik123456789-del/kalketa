/**
 * What part of its axes a chart shows, changed by the mouse (Shift + wheel, Shift + drag) and written
 * into its line as xlim and ylim. Linear and logarithmic axes alike: a logarithmic one moves by ratios.
 */

import type { Scale } from '@kalketa/chart';

export type AxisRange = readonly [number, number];

/** The axis zoomed by `factor` (below 1 closer) about the value `at`, which stays where it is under the pointer. */
export function zoomedRange(scale: Pick<Scale, 'min' | 'max' | 'log'>, at: number, factor: number): AxisRange {
  if (scale.log && at > 0) return [at * (scale.min / at) ** factor, at * (scale.max / at) ** factor];
  return [at + (scale.min - at) * factor, at + (scale.max - at) * factor];
}

/** The axis moved by a share of its length (0.1: a tenth of it towards higher values). */
export function movedRange(scale: Pick<Scale, 'min' | 'max' | 'log'>, by: number): AxisRange {
  if (scale.log) {
    const ratio = (scale.max / scale.min) ** by;
    return [scale.min * ratio, scale.max * ratio];
  }
  const shift = (scale.max - scale.min) * by;
  return [scale.min + shift, scale.max + shift];
}

/** A number for the line, with as many places as the span needs: a thousandth of it (of the value itself on a log axis). */
function written(value: number, span: number): string {
  const step = 10 ** Math.floor(Math.log10(span / 1000));
  const places = Math.max(0, Math.min(12, -Math.floor(Math.log10(step))));
  return String(Number((Math.round(value / step) * step).toFixed(places)));
}

/** One value of an axis as its line writes it: 2.5 m. */
export function axisValueText(value: number, span: number, unit: string): string {
  return `${written(value, span)}${unit ? ` ${unit}` : ''}`;
}

/** A range as its line writes it: 1.5 m .. 3 m. On a log axis each end is rounded by its own size. */
export function axisRangeText([low, high]: AxisRange, unit: string, log = false): string {
  return `${axisValueText(low, log ? low : high - low, unit)} .. ${axisValueText(high, log ? high : high - low, unit)}`;
}
