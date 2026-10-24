/**
 * The units a result can be shown in, for the unit button of the floating row toolbar: the usual units of
 * engineering of the same dimension as the value, each with the value in it as a preview.
 */

import { evaluateSheet, inUnit, type Quantity, type ResolvedUnit } from '@kalketa/core';

/** Units offered, by kind; only those of the value's dimension are shown. */
const CANDIDATES = [
  'mm', 'cm', 'm', 'km',
  'mm²', 'cm²', 'm²',
  'mm³', 'cm³', 'm³', 'l',
  'mm⁴', 'cm⁴', 'm⁴',
  'g', 'kg', 't',
  'N', 'kN', 'MN',
  'N·m', 'kN·m', 'N·mm',
  'N/m', 'kN/m', 'N/mm',
  'Pa', 'kPa', 'MPa', 'GPa',
  'kg/m', 'kg/m³',
  's', 'min', 'h', 'd',
  'm/s', 'km/h', 'm/s²',
  'Hz', 'rad/s', 's⁻²',
  'J', 'kJ', 'MJ', 'Wh', 'kWh',
  'W', 'kW', 'MW',
  'V', 'kV', 'A', 'mA', 'Ω', 'kΩ',
  'K', '°C',
  'rad', '°', '%',
] as const;

interface Known {
  readonly unit: string;
  readonly resolved: ResolvedUnit;
  readonly key: string;
}

let known: readonly Known[] | undefined;

/** A dimension as a key: its nonzero exponents in order ("L1 M1 T-2"). */
const dimKey = (dim: Quantity['dim']): string =>
  Object.entries(dim)
    .filter(([, e]) => e !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, e]) => `${d}${e}`)
    .join(' ');

/** The candidates with what they are, worked out once by the core itself (1 kN·m is a moment). */
function candidates(): readonly Known[] {
  if (known) return known;
  const lines = CANDIDATES.map((u, i) => `u_${i} := 1 ${u}`).join('\n');
  const result = evaluateSheet(lines);
  known = CANDIDATES.flatMap((unit, i) => {
    const v = result.values.get(`u_${i}`);
    return v?.type === 'quantity' && v.hint ? [{ unit, resolved: v.hint, key: dimKey(v.dim) }] : [];
  });
  return known;
}

/** Energy and moment share a dimension; a value of one is not offered the units of the other. */
const ENERGY = new Set(['J', 'kJ', 'MJ', 'Wh', 'kWh']);
const isEnergy = (symbol: string) => /^(k|M|G)?(J|Wh)$/.test(symbol);

/** The units of the value's dimension with the value in each ("54 kN·m" → N·m, kN·m, N·mm). */
export function unitChoices(value: Quantity): { unit: string; value: number }[] {
  if (value.im) return [];
  const key = dimKey(value.dim);
  // A moment (kN·m) gets moments, energy (kWh, J) gets energy; without a unit of its own, moments as Kalketa shows them.
  const energy = value.hint ? isEnergy(value.hint.symbol) : false;
  return candidates()
    .filter((c) => c.key === key && !(key === '' && c.unit !== '%' && c.unit !== 'rad' && c.unit !== '°'))
    .filter((c) => ENERGY.has(c.unit) === energy)
    .map((c) => ({ unit: c.unit, value: inUnit(value, c.resolved).value }));
}
