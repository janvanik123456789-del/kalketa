/**
 * Sums that keep the small terms: Neumaier's compensated summation (an improved Kahan sum). Summed from the left
 * in plain doubles, [1e16, 1, −1e16, 1] gave 1 (the first 1 is lost against 1e16; the exact sum is 2), with no
 * word of it (Strata, batch 3, 2026-11-10). The lost low part of each addition is kept aside and added at the end.
 */

/** The sum of the values, with the rounding error of each addition carried along. */
export function accurateSum(values: Iterable<number>): number {
  let sum = 0;
  let lost = 0;
  for (const v of values) {
    const t = sum + v;
    // What the addition rounded away: from the smaller of the two in size.
    lost += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
    sum = t;
  }
  return sum + lost;
}

/** Running sums (cumsum), each with the compensation of the terms before it. */
export function accurateRunningSums(values: readonly number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  let lost = 0;
  for (const v of values) {
    const t = sum + v;
    lost += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
    sum = t;
    out.push(sum + lost);
  }
  return out;
}
