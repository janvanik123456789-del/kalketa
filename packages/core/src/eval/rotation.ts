/**
 * Turns and radians (docs/03-jazyk.md, ch. 4.5). SI writes Hz and rad/s both as 1/s and a radian has no dimension,
 * so a frequency and an angular velocity differ only by 2π that no dimension would notice: 3000 rpm is 50 per second
 * and 314 rad/s. The unit a value carries says which it is; where that is not known (a plain 1/s, sqrt(k/m) under
 * another name) nothing is assumed and no 2π is added.
 */

import { dim, sameDim } from '../units/dimension.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import type { Quantity } from '../values/value.js';

export type RotationKind = 'turns' | 'angle';

const PER_SECOND = dim({ T: -1 });
const TURNS = /^(?:[kMGTmμµ]?Hz|rpm|rps|min⁻¹|1\/min|min\^-1)$/;
const ANGLE = /^(?:rad|°)\/(?:s|min|h)$/;

export function rotationKind(unit: ResolvedUnit | undefined): RotationKind | undefined {
  if (!unit || !sameDim(unit.dim, PER_SECOND)) return undefined;
  if (unit.angular || ANGLE.test(unit.symbol)) return 'angle';
  return TURNS.test(unit.symbol) ? 'turns' : undefined;
}

/** What one unit of `from` is in `to`: 2π from turns to radians, 1/2π back, else 1. */
function rotationFactor(from: ResolvedUnit | undefined, to: ResolvedUnit | undefined): number {
  const [source, target] = [rotationKind(from), rotationKind(to)];
  if (!source || !target || source === target) return 1;
  return target === 'angle' ? 2 * Math.PI : 1 / (2 * Math.PI);
}

/** The value as the kind of rotation of `target`: 3000 rpm for rad/s is 314.16, 314 rad/s for rpm is 49.97 per second. */
export function inRotationOf(q: Quantity, target: ResolvedUnit | undefined): Quantity {
  const factor = rotationFactor(q.hint, target);
  if (factor === 1) return q;
  const { exact: _exact, ...rest } = q;
  return { ...rest, si: q.si * factor, ...(q.im ? { im: q.im * factor } : {}) };
}

/** A unit to show values of the kind `of` in, without changing them: a chart of rad/s drawn in rpm. */
export function shownInRotation(unit: ResolvedUnit, of: ResolvedUnit | undefined): ResolvedUnit {
  const factor = rotationFactor(of, unit);
  return factor === 1 ? unit : { ...unit, factor: unit.factor / factor };
}

/**
 * ω holding a value in turns: its radians. ω := 3000 rpm is 314 rad/s; ω := 3000 rpm | rpm goes on as 314 rad/s
 * too and is still shown in the rpm asked for.
 */
export function angularValue(q: Quantity, keepShown: boolean): Quantity {
  if (rotationKind(q.hint) !== 'turns') return q;
  const { exact: _exact, ...rest } = q;
  const shown: ResolvedUnit = keepShown ? { ...q.hint!, factor: q.hint!.factor * 2 * Math.PI, angular: true } : { symbol: 'rad/s', factor: 1, dim: q.dim };
  return { ...rest, si: q.si * 2 * Math.PI, hint: shown };
}
