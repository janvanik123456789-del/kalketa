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
  /** The prefixes it takes, where not all of them make sense. */
  readonly prefixes?: readonly string[];
  /** A currency: a sheet may define it anew by its rate ("unit EUR := 24.7 CZK"). */
  readonly currency?: boolean;
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

/** A currency with its ISO code and local symbols (Kč, €, $): all of one dimension. */
function currency(code: string, symbols: readonly string[] = []): UnitDef[] {
  const dimension = dim({ [code]: 1 });
  return [code, ...symbols].map((symbol) => ({ symbol, factor: 1, dim: dimension, prefixable: symbol === code, currency: true }));
}

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
  // Rankine: the Fahrenheit degree from absolute zero, as American handbooks give thermodynamic temperatures.
  { symbol: '°R', factor: 5 / 9, dim: K },

  // Length, area, volume, mass, time
  { symbol: 'in', factor: 0.0254, dim: L },
  { symbol: 'Å', factor: 1e-10, dim: L },
  { symbol: 'ft', factor: 0.3048, dim: L },
  { symbol: 'ha', factor: 1e4, dim: AREA },
  { symbol: 'L', factor: 1e-3, dim: VOLUME, prefixable: true },
  { symbol: 'l', factor: 1e-3, dim: VOLUME, prefixable: true },
  // Only upwards: a centitonne is nobody's unit, and ct is a carat.
  { symbol: 't', factor: 1e3, dim: M, prefixable: true, prefixes: ['k', 'M', 'G'] },
  { symbol: 'lb', factor: 0.45359237, dim: M },
  { symbol: 'dkg', factor: 0.01, dim: M },
  { symbol: 'Da', factor: 1.6605390666e-27, dim: M, prefixable: true },
  // US customary units of old textbooks and American handbooks, to be converted to SI.
  { symbol: 'lbm', factor: 0.45359237, dim: M },
  { symbol: 'oz', factor: 0.028349523125, dim: M },
  { symbol: 'yd', factor: 0.9144, dim: L },
  { symbol: 'mi', factor: 1609.344, dim: L },
  { symbol: 'gal', factor: 3.785411784e-3, dim: VOLUME },
  { symbol: 'min', factor: 60, dim: T },
  { symbol: 'h', factor: 3600, dim: T },
  // The hour as American handbooks write it (Btu/hr-ft-°F).
  { symbol: 'hr', factor: 3600, dim: T },
  { symbol: 'd', factor: 86400, dim: T },
  { symbol: 'wk', factor: 7 * 86400, dim: T },
  // Year: 365.25 days (the Julian year). Not "a": that is too common a name (side, acceleration).
  { symbol: 'yr', factor: 365.25 * 86400, dim: T },
  // Month: a twelfth of that year (30.4375 d), for periods as finance writes them (5 yr + 7 mo); a date plus a calendar month is not this.
  { symbol: 'mo', factor: (365.25 * 86400) / 12, dim: T },

  // Mechanics
  { symbol: 'N', factor: 1, dim: FORCE, prefixable: true },
  { symbol: 'lbf', factor: 4.4482216152605, dim: FORCE },
  { symbol: 'Nm', factor: 1, dim: ENERGY, prefixable: true },
  { symbol: 'Pa', factor: 1, dim: PRESSURE, prefixable: true },
  { symbol: 'bar', factor: 1e5, dim: PRESSURE, prefixable: true },
  { symbol: 'atm', factor: 101325, dim: PRESSURE },
  { symbol: 'psi', factor: 6894.757293168, dim: PRESSURE },
  // Absolute and gauge pressure of American tables: the same size, the reference is the reader's.
  { symbol: 'psia', factor: 6894.757293168, dim: PRESSURE },
  { symbol: 'psig', factor: 6894.757293168, dim: PRESSURE },
  { symbol: 'torr', factor: 101325 / 760, dim: PRESSURE },
  // Viscosity as tables give it: centipoise = mPa·s, centistokes = mm²/s.
  { symbol: 'cP', factor: 1e-3, dim: dim({ M: 1, L: -1, T: -1 }) },
  { symbol: 'cSt', factor: 1e-6, dim: dim({ L: 2, T: -1 }) },
  { symbol: 'ksi', factor: 6894757.293168, dim: PRESSURE },
  { symbol: 'kip', factor: 4448.2216152605, dim: FORCE },
  { symbol: 'inHg', factor: 3386.388666, dim: PRESSURE },
  { symbol: 'mmHg', factor: 133.322387415, dim: PRESSURE },
  { symbol: 'J', factor: 1, dim: ENERGY, prefixable: true },
  { symbol: 'Wh', factor: 3600, dim: ENERGY, prefixable: true },
  { symbol: 'cal', factor: 4.184, dim: ENERGY, prefixable: true },
  { symbol: 'Btu', factor: 1055.05585262, dim: ENERGY },
  { symbol: 'hp', factor: 745.69987158227, dim: POWER },
  { symbol: 'eV', factor: 1.602176634e-19, dim: ENERGY, prefixable: true },
  { symbol: 'W', factor: 1, dim: POWER, prefixable: true },
  { symbol: 'Hz', factor: 1, dim: FREQUENCY, prefixable: true },
  { symbol: 'rpm', factor: 1 / 60, dim: FREQUENCY },

  // Electrical
  { symbol: 'C', factor: 1, dim: CHARGE, prefixable: true },
  { symbol: 'Ah', factor: 3600, dim: CHARGE, prefixable: true },
  { symbol: 'V', factor: 1, dim: VOLTAGE, prefixable: true },
  { symbol: 'VA', factor: 1, dim: POWER, prefixable: true },
  // Peak power of solar panels (kWp): a power, named for the rated output.
  { symbol: 'Wp', factor: 1, dim: POWER, prefixable: true },
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
  // Molarity of chemistry and biochemistry: 1 M = 1 mol/l (0,1 mM, 5 μM). A name M defined by the sheet (a moment) stays its own.
  { symbol: 'M', factor: 1e3, dim: dim({ N: 1, L: -3 }), prefixable: true },

  // Currencies: each is a dimension of its own, so 5 CZK + 2 EUR is an error
  // until the sheet gives a rate ("unit EUR := 24.7 CZK" or a rate from a table).
  ...currency('CZK', ['Kč']),
  ...currency('EUR', ['€']),
  ...currency('USD', ['$']),
  ...currency('GBP', ['£']),
  ...currency('CHF'),
  ...currency('PLN', ['zł']),
  ...currency('HUF', ['Ft']),
  ...currency('JPY', ['¥']),

  // Of old textbooks and of other programs: the same quantities by other names.
  { symbol: 'kgf', factor: 9.80665, dim: FORCE },
  // The kilopond of Czech and German textbooks is the same kilogram-force, the megapond a thousand of them.
  { symbol: 'kp', factor: 9.80665, dim: FORCE },
  { symbol: 'Mp', factor: 9806.65, dim: FORCE },
  { symbol: 'gf', factor: 9.80665e-3, dim: FORCE },
  { symbol: 'tf', factor: 9806.65, dim: FORCE },
  { symbol: 'dyn', factor: 1e-5, dim: FORCE },
  { symbol: 'dyne', factor: 1e-5, dim: FORCE },
  { symbol: 'pdl', factor: 0.138254954376, dim: FORCE },
  { symbol: 'ozf', factor: 0.27801385095378125, dim: FORCE },
  { symbol: 'tonf', factor: 8896.443230521, dim: FORCE },
  { symbol: 'Torr', factor: 101325 / 760, dim: PRESSURE },
  { symbol: 'at', factor: 98066.5, dim: PRESSURE },
  { symbol: 'psf', factor: 47.88025898033584, dim: PRESSURE },
  { symbol: 'ksf', factor: 47880.25898033584, dim: PRESSURE },
  { symbol: 'kpsi', factor: 6894757.293168, dim: PRESSURE },
  { symbol: 'erg', factor: 1e-7, dim: ENERGY },
  { symbol: 'BTU', factor: 1055.05585262, dim: ENERGY },
  { symbol: 'therm', factor: 105505585.262, dim: ENERGY },
  { symbol: 'hp_M', factor: 735.49875, dim: POWER },
  { symbol: 'VAh', factor: 3600, dim: ENERGY, prefixable: true },
  { symbol: 'poise', factor: 0.1, dim: dim({ M: 1, L: -1, T: -1 }) },
  { symbol: 'St', factor: 1e-4, dim: dim({ L: 2, T: -1 }) },
  { symbol: 'stokes', factor: 1e-4, dim: dim({ L: 2, T: -1 }) },
  { symbol: 'slug', factor: 14.59390293720636, dim: M },
  { symbol: 'klb', factor: 453.59237, dim: M },
  { symbol: 'gr', factor: 6.479891e-5, dim: M },
  { symbol: 'st', factor: 6.35029318, dim: M },
  { symbol: 'tonne', factor: 1000, dim: M },
  { symbol: 'ton_US', factor: 907.18474, dim: M },
  { symbol: 'ton_UK', factor: 1016.0469088, dim: M },
  { symbol: 'gram', factor: 1e-3, dim: M },
  { symbol: 'ounce', factor: 0.028349523125, dim: M },
  { symbol: 'pound', factor: 0.45359237, dim: M },
  { symbol: 'mile', factor: 1609.344, dim: L },
  { symbol: 'nmi', factor: 1852, dim: L },
  { symbol: 'micron', factor: 1e-6, dim: L },
  { symbol: 'Angstrom', factor: 1e-10, dim: L },
  { symbol: 'fur', factor: 201.168, dim: L },
  { symbol: 'furlong', factor: 201.168, dim: L },
  { symbol: 'ftm', factor: 1.8288, dim: L },
  { symbol: 'rod', factor: 5.0292, dim: L },
  { symbol: 'AU', factor: 149597870700, dim: L },
  { symbol: 'au', factor: 149597870700, dim: L },
  { symbol: 'ly', factor: 9460730472580800, dim: L },
  { symbol: 'pc', factor: 3.0856775814913673e16, dim: L },
  { symbol: 'acre', factor: 4046.8564224, dim: AREA },
  { symbol: 'ac', factor: 4046.8564224, dim: AREA },
  { symbol: 'barn', factor: 1e-28, dim: AREA },
  { symbol: 'gal_US', factor: 3.785411784e-3, dim: VOLUME },
  { symbol: 'gal_UK', factor: 4.54609e-3, dim: VOLUME },
  { symbol: 'qt_US', factor: 9.46352946e-4, dim: VOLUME },
  { symbol: 'qt_UK', factor: 1.1365225e-3, dim: VOLUME },
  { symbol: 'pt_US', factor: 4.73176473e-4, dim: VOLUME },
  { symbol: 'pt_UK', factor: 5.6826125e-4, dim: VOLUME },
  { symbol: 'fl_oz_US', factor: 2.95735295625e-5, dim: VOLUME },
  { symbol: 'fl_oz_UK', factor: 2.84130625e-5, dim: VOLUME },
  { symbol: 'day', factor: 86400, dim: T },
  { symbol: 'week', factor: 7 * 86400, dim: T },
  { symbol: 'month', factor: (365.25 * 86400) / 12, dim: T },
  { symbol: 'sec', factor: 1, dim: T },
  { symbol: 'mph', factor: 0.44704, dim: dim({ L: 1, T: -1 }) },
  { symbol: 'kmh', factor: 1 / 3.6, dim: dim({ L: 1, T: -1 }) },
  { symbol: 'kph', factor: 1 / 3.6, dim: dim({ L: 1, T: -1 }) },
  { symbol: 'knot', factor: 1852 / 3600, dim: dim({ L: 1, T: -1 }) },
  { symbol: 'volt', factor: 1, dim: VOLTAGE },
  { symbol: 'watt', factor: 1, dim: POWER },
  { symbol: 'joule', factor: 1, dim: ENERGY },
  { symbol: 'farad', factor: 1, dim: CAPACITANCE },
  { symbol: 'henry', factor: 1, dim: INDUCTANCE },
  { symbol: 'tesla', factor: 1, dim: MAG_FLUX_DENSITY },
  { symbol: 'gauss', factor: 1e-4, dim: MAG_FLUX_DENSITY },
  { symbol: 'Mx', factor: 1e-8, dim: MAG_FLUX },
  { symbol: 'katal', factor: 1, dim: CATALYTIC },
  { symbol: 'Ci', factor: 3.7e10, dim: FREQUENCY, prefixable: true },
  { symbol: 'Rd', factor: 1e6, dim: FREQUENCY },
  { symbol: 'lbmol', factor: 453.59237, dim: N },
  { symbol: 'rev', factor: 2 * Math.PI, dim: DIMENSIONLESS },
  { symbol: 'grad', factor: Math.PI / 200, dim: DIMENSIONLESS },
  { symbol: 'deg', factor: Math.PI / 180, dim: DIMENSIONLESS },
  { symbol: 'arcmin', factor: Math.PI / 10800, dim: DIMENSIONLESS },
  { symbol: 'arcsec', factor: Math.PI / 648000, dim: DIMENSIONLESS },
  { symbol: 'sr', factor: 1, dim: DIMENSIONLESS },
  { symbol: 'ppb', factor: 1e-9, dim: DIMENSIONLESS },

  // Dimensionless
  { symbol: 'rad', factor: 1, dim: DIMENSIONLESS, prefixable: true },
  { symbol: '°', factor: Math.PI / 180, dim: DIMENSIONLESS },
  // Grads of geodesy: a right angle is 100 gon (the S-JTSK bearings).
  { symbol: 'gon', factor: Math.PI / 200, dim: DIMENSIONLESS },
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

/** Keyboard spellings of symbols: u and µ for μ before a built-in unit that takes prefixes. */
const MICRO_SPELLINGS = /^[uµ](?=.)/;
const PREFIXABLE_SYMBOLS: ReadonlySet<string> = new Set(BUILT_IN.filter((u) => u.prefixable).map((u) => u.symbol));
const ALIASES: Readonly<Record<string, string>> = { ohm: 'Ω' };

/** The canonical way to write a unit symbol: uF -> μF, µm -> μm, kohm -> kΩ. */
export function canonicalUnitSymbol(symbol: string): string {
  // A sheet's own unit "usd" stays "usd"; only uF, um, … mean micro.
  const rest = symbol.slice(1);
  const micro = MICRO_SPELLINGS.test(symbol) && (PREFIXABLE_SYMBOLS.has(rest) || rest.endsWith('ohm')) ? `μ${rest}` : symbol;
  const alias = Object.keys(ALIASES).find((a) => micro.endsWith(a));
  return alias ? micro.slice(0, -alias.length) + ALIASES[alias] : micro;
}

export class UnitRegistry {
  private readonly units = new Map<string, UnitDef>();
  /** Base units of a sheet's own dimensions: Mena -> CZK. */
  private readonly baseUnits = new Map<string, string>();

  constructor(defs: readonly UnitDef[] = BUILT_IN) {
    for (const def of defs) this.units.set(def.symbol, def);
  }

  /** A copy to which a sheet adds its own units. */
  extend(): UnitRegistry {
    const copy = new UnitRegistry([...this.units.values()]);
    for (const [dimension, symbol] of this.baseUnits) copy.baseUnits.set(dimension, symbol);
    return copy;
  }

  /** Adds a unit; a base unit of a new dimension also names it in displays. */
  define(def: UnitDef, baseOf?: string): void {
    this.units.set(def.symbol, def);
    if (baseOf !== undefined && !this.baseUnits.has(baseOf)) this.baseUnits.set(baseOf, def.symbol);
  }

  /** What can be written as a unit: every symbol, and the prefixed ones engineers use. */
  writableSymbols(): string[] {
    const common = ['k', 'M', 'G', 'm', 'μ', 'n'];
    const all = [...this.units.values()];
    return [...all.map((u) => u.symbol), ...all.filter((u) => u.prefixable).flatMap((u) => common.filter((p) => !u.prefixes || u.prefixes.includes(p)).map((p) => p + u.symbol))];
  }

  /** Whether the exact symbol is a unit (no prefixes, no spellings). */
  has(symbol: string): boolean {
    return this.units.has(symbol);
  }

  /** Whether a sheet may define this unit anew: a currency, given by its rate. */
  isRedefinable(symbol: string): boolean {
    return this.units.get(symbol)?.currency === true;
  }

  /** Symbols of the sheet's own base dimensions, for "CZK/os" instead of "Mena/Osoby". */
  baseSymbols(): ReadonlyMap<string, string> {
    return this.baseUnits;
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
      if (base?.prefixable && (!base.prefixes || base.prefixes.includes(prefix))) {
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
