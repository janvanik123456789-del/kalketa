/**
 * Unit registry: built-in units, SI prefixes and lookup.
 *
 * Lookup is case-sensitive (mm ≠ Mm). An exact symbol always wins over a
 * prefixed interpretation (min is minute, not milli-inch).
 *
 * Angles follow SI and are dimensionless (rad = 1), so ω·r gives m/s.
 *
 * Symbols that are hard to type have keyboard spellings, shown canonically:
 * u and µ (micro sign) for the micro prefix μ (uF -> μF), ohm for Ω (kohm -> kΩ).
 */

import { dim, DIMENSIONLESS, type Dimension } from './dimension.js';

export interface UnitDef {
  readonly symbol: string;
  /** Multiplier to the coherent SI unit. */
  readonly factor: number;
  readonly dim: Dimension;
  /** Zero-point shift for absolute temperatures (°C, °F), in kelvin. */
  readonly offset?: number;
  /** Symbol of the matching temperature-difference unit (°C -> Δ°C). */
  readonly delta?: string;
  readonly prefixable?: boolean;
}

const L = dim({ L: 1 });
const M = dim({ M: 1 });
const T = dim({ T: 1 });
const I = dim({ I: 1 });
const K = dim({ Θ: 1 });
const N = dim({ N: 1 });
const J = dim({ J: 1 });
const AREA = dim({ L: 2 });
const VOLUME = dim({ L: 3 });
const FORCE = dim({ M: 1, L: 1, T: -2 });
const PRESSURE = dim({ M: 1, L: -1, T: -2 });
const ENERGY = dim({ M: 1, L: 2, T: -2 });
const POWER = dim({ M: 1, L: 2, T: -3 });
const CHARGE = dim({ I: 1, T: 1 });
const VOLTAGE = dim({ M: 1, L: 2, T: -3, I: -1 });
const RESISTANCE = dim({ M: 1, L: 2, T: -3, I: -2 });
const CONDUCTANCE = dim({ M: -1, L: -2, T: 3, I: 2 });
const CAPACITANCE = dim({ M: -1, L: -2, T: 4, I: 2 });
const MAG_FLUX = dim({ M: 1, L: 2, T: -2, I: -1 });
const MAG_FLUX_DENSITY = dim({ M: 1, T: -2, I: -1 });
const INDUCTANCE = dim({ M: 1, L: 2, T: -2, I: -2 });
const FREQUENCY = dim({ T: -1 });
const DOSE = dim({ L: 2, T: -2 });
const ILLUMINANCE = dim({ J: 1, L: -2 });
const CATALYTIC = dim({ N: 1, T: -1 });

const BUILT_IN: readonly UnitDef[] = [
  // Base units
  { symbol: 'm', factor: 1, dim: L, prefixable: true },
  { symbol: 'g', factor: 1e-3, dim: M, prefixable: true },
  { symbol: 's', factor: 1, dim: T, prefixable: true },
  { symbol: 'A', factor: 1, dim: I, prefixable: true },
  { symbol: 'K', factor: 1, dim: K, prefixable: true },
  { symbol: 'mol', factor: 1, dim: N, prefixable: true },
  { symbol: 'cd', factor: 1, dim: J },

  // Temperature
  { symbol: '°C', factor: 1, dim: K, offset: 273.15, delta: 'Δ°C' },
  { symbol: '°F', factor: 5 / 9, dim: K, offset: (459.67 * 5) / 9, delta: 'Δ°F' },
  { symbol: 'Δ°C', factor: 1, dim: K },
  { symbol: 'Δ°F', factor: 5 / 9, dim: K },

  // Length, area, volume, mass, time
  { symbol: 'in', factor: 0.0254, dim: L },
  { symbol: 'ft', factor: 0.3048, dim: L },
  { symbol: 'ha', factor: 1e4, dim: AREA },
  { symbol: 'L', factor: 1e-3, dim: VOLUME, prefixable: true },
  { symbol: 'l', factor: 1e-3, dim: VOLUME, prefixable: true },
  { symbol: 't', factor: 1e3, dim: M, prefixable: true },
  { symbol: 'lb', factor: 0.45359237, dim: M },
  { symbol: 'min', factor: 60, dim: T },
  { symbol: 'h', factor: 3600, dim: T },
  { symbol: 'd', factor: 86400, dim: T },

  // Mechanics
  { symbol: 'N', factor: 1, dim: FORCE, prefixable: true },
  { symbol: 'lbf', factor: 4.4482216152605, dim: FORCE },
  { symbol: 'Nm', factor: 1, dim: ENERGY, prefixable: true },
  { symbol: 'Pa', factor: 1, dim: PRESSURE, prefixable: true },
  { symbol: 'bar', factor: 1e5, dim: PRESSURE, prefixable: true },
  { symbol: 'atm', factor: 101325, dim: PRESSURE },
  { symbol: 'psi', factor: 6894.757293168, dim: PRESSURE },
  { symbol: 'mmHg', factor: 133.322387415, dim: PRESSURE },
  { symbol: 'J', factor: 1, dim: ENERGY, prefixable: true },
  { symbol: 'Wh', factor: 3600, dim: ENERGY, prefixable: true },
  { symbol: 'cal', factor: 4.184, dim: ENERGY, prefixable: true },
  { symbol: 'eV', factor: 1.602176634e-19, dim: ENERGY, prefixable: true },
  { symbol: 'W', factor: 1, dim: POWER, prefixable: true },
  { symbol: 'Hz', factor: 1, dim: FREQUENCY, prefixable: true },
  { symbol: 'rpm', factor: 1 / 60, dim: FREQUENCY },

  // Electrical
  { symbol: 'C', factor: 1, dim: CHARGE, prefixable: true },
  { symbol: 'Ah', factor: 3600, dim: CHARGE, prefixable: true },
  { symbol: 'V', factor: 1, dim: VOLTAGE, prefixable: true },
  { symbol: 'VA', factor: 1, dim: POWER, prefixable: true },
  { symbol: 'var', factor: 1, dim: POWER, prefixable: true },
  { symbol: 'Ω', factor: 1, dim: RESISTANCE, prefixable: true },
  { symbol: 'S', factor: 1, dim: CONDUCTANCE, prefixable: true },
  { symbol: 'F', factor: 1, dim: CAPACITANCE, prefixable: true },
  { symbol: 'Wb', factor: 1, dim: MAG_FLUX, prefixable: true },
  { symbol: 'T', factor: 1, dim: MAG_FLUX_DENSITY, prefixable: true },
  { symbol: 'H', factor: 1, dim: INDUCTANCE, prefixable: true },

  // Light, radiation, chemistry
  { symbol: 'lm', factor: 1, dim: J, prefixable: true },
  { symbol: 'lx', factor: 1, dim: ILLUMINANCE, prefixable: true },
  { symbol: 'Bq', factor: 1, dim: FREQUENCY, prefixable: true },
  { symbol: 'Gy', factor: 1, dim: DOSE, prefixable: true },
  { symbol: 'Sv', factor: 1, dim: DOSE, prefixable: true },
  { symbol: 'kat', factor: 1, dim: CATALYTIC, prefixable: true },

  // Dimensionless
  { symbol: 'rad', factor: 1, dim: DIMENSIONLESS, prefixable: true },
  { symbol: '°', factor: Math.PI / 180, dim: DIMENSIONLESS },
  { symbol: '%', factor: 1e-2, dim: DIMENSIONLESS },
  { symbol: '‰', factor: 1e-3, dim: DIMENSIONLESS },
  { symbol: 'ppm', factor: 1e-6, dim: DIMENSIONLESS },
];

/** SI prefixes (2022, quecto to quetta). Two-letter "da" is listed first so it wins over "d". */
const PREFIXES: readonly (readonly [string, number])[] = [
  ['da', 1e1],
  ['Q', 1e30], ['R', 1e27], ['Y', 1e24], ['Z', 1e21], ['E', 1e18], ['P', 1e15], ['T', 1e12], ['G', 1e9],
  ['M', 1e6], ['k', 1e3], ['h', 1e2], ['d', 1e-1], ['c', 1e-2], ['m', 1e-3],
  ['μ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15], ['a', 1e-18],
  ['z', 1e-21], ['y', 1e-24], ['r', 1e-27], ['q', 1e-30],
];

/** Keyboard spellings of symbols; no built-in unit starts with u or µ. */
const MICRO_SPELLINGS = /^[uµ](?=.)/;
const ALIASES: Readonly<Record<string, string>> = { ohm: 'Ω' };

/** The canonical way to write a unit symbol: uF -> μF, µm -> μm, kohm -> kΩ. */
export function canonicalUnitSymbol(symbol: string): string {
  const micro = symbol.replace(MICRO_SPELLINGS, 'μ');
  const alias = Object.keys(ALIASES).find((a) => micro.endsWith(a));
  return alias ? micro.slice(0, -alias.length) + ALIASES[alias] : micro;
}

export class UnitRegistry {
  private readonly units = new Map<string, UnitDef>();

  constructor(defs: readonly UnitDef[] = BUILT_IN) {
    for (const def of defs) this.units.set(def.symbol, def);
  }

  /** Finds a unit by symbol, trying SI prefixes when there is no exact match. */
  resolve(written: string): UnitDef | undefined {
    const exact = this.units.get(written);
    if (exact) return exact;
    const symbol = canonicalUnitSymbol(written);
    if (symbol !== written) return this.resolve(symbol);
    for (const [prefix, scale] of PREFIXES) {
      if (!symbol.startsWith(prefix) || symbol.length === prefix.length) continue;
      const base = this.units.get(symbol.slice(prefix.length));
      if (base?.prefixable) {
        return { symbol, factor: scale * base.factor, dim: base.dim };
      }
    }
    return undefined;
  }

  isUnit(symbol: string): boolean {
    return this.resolve(symbol) !== undefined;
  }
}

export const defaultRegistry = new UnitRegistry();

/**
 * Preferred display units for common dimensions of computed results that
 * carry no unit hint. Sheet settings will override this later (F5).
 */
export const PREFERRED_UNITS: readonly string[] = [
  'm', 'kg', 's', 'A', 'K', 'mol', 'cd',
  'N', 'Pa', 'J', 'W', 'C', 'V', 'Ω', 'S', 'F', 'Wb', 'T', 'H', 'Hz',
];
