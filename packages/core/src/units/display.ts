/**
 * Chooses the unit a quantity is shown in and converts the magnitude.
 *
 * Order (docs/03-jazyk.md, ch. 4.3): target unit (| kN·m), then the unit the
 * value came with, then a preferred SI unit, then a product of base units.
 * Number formatting (digits, decimal separator) is left to the render layer.
 */

import { dimKey, isDimensionless, sameDim, superscript, type Dimension } from './dimension.js';
import { PREFERRED_UNITS, type UnitRegistry } from './registry.js';
import type { ResolvedUnit } from './unitExpr.js';
import type { Quantity } from '../values/value.js';

export interface DisplayValue {
  /** Magnitude in `unit`. */
  readonly value: number;
  /** Unit symbol; empty for dimensionless values. */
  readonly unit: string;
}

const BASE_SYMBOLS: Readonly<Record<string, string>> = {
  M: 'kg', L: 'm', T: 's', I: 'A', Θ: 'K', N: 'mol', J: 'cd',
};

export function toDisplay(q: Quantity, registry: UnitRegistry, target?: ResolvedUnit): DisplayValue {
  if (target && sameDim(target.dim, q.dim)) return inUnit(q, target);
  if (q.hint && sameDim(q.hint.dim, q.dim)) return inUnit(q, q.hint);
  if (isDimensionless(q.dim)) return { value: q.si, unit: '' };
  for (const symbol of PREFERRED_UNITS) {
    const def = registry.resolve(symbol);
    if (def && sameDim(def.dim, q.dim)) return { value: q.si / def.factor, unit: symbol };
  }
  return { value: q.si, unit: baseUnitSymbol(q.dim) };
}

/** Converts to a unit; absolute temperatures honour the zero-point shift. */
export function inUnit(q: Quantity, unit: ResolvedUnit): DisplayValue {
  if (unit.offset !== undefined) {
    if (q.absolute) return { value: (q.si - unit.offset) / unit.factor, unit: unit.symbol };
    // A temperature difference shown in °C is a Δ°C.
    return { value: q.si / unit.factor, unit: unit.delta ?? unit.symbol };
  }
  return { value: q.si / unit.factor, unit: unit.symbol };
}

/** "kg·m²/s³" from a dimension. */
export function baseUnitSymbol(d: Dimension): string {
  const part = (key: string, exp: number): string => (BASE_SYMBOLS[key] ?? key) + superscript(exp);
  const keys = dimKey(d) === '1' ? [] : Object.keys(d);
  const num = keys.filter((k) => d[k]! > 0).map((k) => part(k, d[k]!));
  const den = keys.filter((k) => d[k]! < 0).map((k) => part(k, -d[k]!));
  const top = num.length > 0 ? num.join('·') : '1';
  if (den.length === 0) return top;
  return `${top}/${den.length > 1 ? `(${den.join('·')})` : den[0]}`;
}
