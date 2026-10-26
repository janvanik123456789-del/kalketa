/**
 * Units of a product or quotient composed from the units of its operands:
 * kN/m · m² = kN·m, kN·m / m = kN. Without this a moment from q in kN/m and
 * L in m came out in SI as joules (the dimension of energy and of a moment
 * is the same).
 */

import { divideDims, isDimensionless, multiplyDims, powerDim, sameDim, superscript, type Dimension } from './dimension.js';
import type { ResolvedUnit } from './unitExpr.js';

const SUPER: Readonly<Record<string, string>> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const TO_SUPER: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(SUPER).map(([k, v]) => [v, k]));

/** "kN·m²/s" -> {kN: 1, m: 2, s: -1}; undefined for what it does not read (offsets, odd spellings). */
export function unitTerms(symbol: string): Map<string, number> | undefined {
  const terms = new Map<string, number>();
  let pos = 0;
  const add = (name: string, exponent: number) => terms.set(name, (terms.get(name) ?? 0) + exponent);
  const exponent = (): number => {
    let text = '';
    while (pos < symbol.length && SUPER[symbol[pos]!] !== undefined) text += SUPER[symbol[pos++]!];
    return text === '' ? 1 : Number(text);
  };
  const group = (sign: number): boolean => {
    if (symbol[pos] === '(') {
      // (kN/m)²: the terms inside, each times the power.
      const close = symbol.indexOf(')', pos);
      if (close < 0) return false;
      const inner = unitTerms(symbol.slice(pos + 1, close));
      pos = close + 1;
      if (!inner) return false;
      const power = exponent();
      for (const [name, e] of inner) add(name, sign * power * e);
      return true;
    }
    const match = /^[^\s·/()⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/.exec(symbol.slice(pos));
    if (!match) return false;
    pos += match[0].length;
    add(match[0], sign * exponent());
    return true;
  };
  let sign = 1;
  if (!group(sign)) return undefined;
  while (pos < symbol.length) {
    const op = symbol[pos++];
    if (op === '·') sign = sign > 0 ? 1 : -1;
    else if (op === '/') sign = -1;
    else return undefined;
    if (!group(sign)) return undefined;
  }
  return terms;
}

/** {kN: 1, m: 1} -> "kN·m"; {kN: 1, m: -1} -> "kN/m"; {N: 1, mm: -2} -> "N/mm²". */
export function formatTerms(terms: ReadonlyMap<string, number>): string {
  const power = (name: string, e: number) => (e === 1 ? name : `${name}${String(e).split('').map((c) => TO_SUPER[c] ?? c).join('')}`);
  const up = [...terms].filter(([, e]) => e > 0).map(([n, e]) => power(n, e));
  const down = [...terms].filter(([, e]) => e < 0).map(([n, e]) => power(n, -e));
  const top = up.length ? up.join('·') : '1';
  if (!down.length) return top;
  return `${top}/${down.length > 1 ? `(${down.join('·')})` : down[0]}`;
}

/**
 * The unit of a · b or a / b from the units the operands carry, in the scale
 * the calculation is written in (docs/03-jazyk.md, ch. 4.2a):
 * - a single unit stays (kN·m / m = kN);
 * - a dimension with a name of its own takes it with the prefix of the same
 *   size: N·mm / mm³ = MPa, kN/m² = kPa, MPa·mm² = N, kN·m/s = kW (energy
 *   excepted: a moment stays kN·m);
 * - a mix of kinds that is a power of a length takes it: N/MPa = mm²
 *   (two units of one kind, mm²·m, stay apart only in SI: m³);
 * - where units of one kind mix, a named unit that would show less than 1
 *   takes the next smaller prefix: kN·m / cm³ is 0,193 GPa, shown as 193 MPa
 *   (N/mm² stays MPa, also for 0,8 MPa);
 * - else the composed unit when it reads well (kN/m, kg/m³), or SI.
 * Undefined for no dimension, temperatures and what does not compose readably.
 */
export function composedHint(op: '*' | '/', a: ResolvedUnit, b: ResolvedUnit, units: UnitNames, value?: number): ResolvedUnit | undefined {
  if (a.offset !== undefined || b.offset !== undefined) return undefined;
  // The same units meet again and again (inside an integral, a chart): composed once, unless the value decides.
  let known = composed.get(units);
  if (!known) composed.set(units, (known = new Map()));
  const key = `${op}\u0000${a.symbol}\u0000${a.factor}\u0000${b.symbol}\u0000${b.factor}`;
  const kept = known.get(key);
  if (kept) return kept.unit;
  const { unit, byValue } = composeUnit(op, a, b, units, value);
  if (!byValue && known.size < 2000) known.set(key, { unit });
  return unit;
}

const composed = new WeakMap<UnitNames, Map<string, { readonly unit: ResolvedUnit | undefined }>>();

function composeUnit(op: '*' | '/', a: ResolvedUnit, b: ResolvedUnit, units: UnitNames, value?: number): { unit: ResolvedUnit | undefined; byValue: boolean } {
  const none = { unit: undefined, byValue: false };
  const ta = unitTerms(a.symbol);
  const tb = unitTerms(b.symbol);
  if (!ta || !tb) return none;
  const terms = new Map(ta);
  for (const [name, e] of tb) terms.set(name, (terms.get(name) ?? 0) + (op === '*' ? e : -e));
  for (const [name, e] of terms) if (e === 0) terms.delete(name);
  const dim = op === '*' ? multiplyDims(a.dim, b.dim) : divideDims(a.dim, b.dim);
  if (terms.size === 0 || isDimensionless(dim)) return none;
  const factor = op === '*' ? a.factor * b.factor : a.factor / b.factor;
  const dims = [...terms.keys()].map((name) => units.dimOf(name));
  // Two units of one kind (m and cm in kN·m/cm³): no scale of the calculation to keep.
  const mixed = dims.some((d, i) => !d || dims.some((e, j) => j > i && e && sameDim(d, e)));
  if (terms.size > 1) {
    const named = units.ownUnit(dim, factor, mixed ? value : undefined);
    if (named) return { unit: named, byValue: mixed };
  }
  // mm² · m is not a unit to show: two units of one dimension stay apart only in SI (m³).
  // Mixed units: what shows depends on the value (193 MPa, not 0,193 GPa).
  if (mixed) return { unit: undefined, byValue: true };
  if (terms.size > 1) {
    const length = units.lengthPower(dim, factor);
    if (length) return { unit: length, byValue: false };
  }
  if (terms.size > 3) return none;
  // As engineers write them: a length or a time last (L·F in kN·m, F·t in N·s, P·t in kW·h), whatever the order of the factors.
  const length = units.dimOf('m');
  const time = units.dimOf('s');
  const last = (name: string) => {
    const d = units.dimOf(name);
    return d !== undefined && ((length !== undefined && sameDim(d, length)) || (time !== undefined && sameDim(d, time))) ? 1 : 0;
  };
  const ordered = new Map([...terms].sort(([x], [y]) => last(x) - last(y)));
  return { unit: { symbol: formatTerms(ordered), factor, dim }, byValue: false };
}

/**
 * The unit of √x or ∛x (n = 2, 3) from the unit of x: √mm² = mm, ∛cm³ = cm,
 * √(m²/s²) = m/s. Undefined where the root of the unit is no unit (√mm).
 */
export function rootHint(hint: ResolvedUnit | undefined, n: number): ResolvedUnit | undefined {
  if (!hint || hint.offset !== undefined) return undefined;
  const power = hint.power;
  if (power && power.exponent % n === 0) {
    const e = power.exponent / n;
    return { symbol: e === 1 ? power.symbol : `${power.symbol}${superscript(e)}`, factor: power.factor ** e, dim: powerDim(power.dim, e), power: { ...power, exponent: e } };
  }
  const terms = unitTerms(hint.symbol);
  if (!terms || [...terms.values()].some((e) => e % n !== 0)) return undefined;
  return { symbol: formatTerms(new Map([...terms].map(([name, e]) => [name, e / n]))), factor: hint.factor ** (1 / n), dim: powerDim(hint.dim, 1 / n) };
}

export interface UnitNames {
  /** Whether the dimension has a unit name of its own (N, Pa, W…). */
  hasOwnName(dim: Dimension): boolean;
  /** The dimension of a unit symbol, if it is one. */
  dimOf(symbol: string): Dimension | undefined;
  /**
   * The unit of a named dimension in the size closest to `factor` from below,
   * by the usual prefixes: 1e6 Pa -> MPa, 1e7 Pa -> MPa, 1 N -> N; smaller
   * while `value` (SI) would show below 1 in it: 1.93e8 Pa in GPa -> MPa.
   */
  ownUnit(dim: Dimension, factor: number, value?: number): ResolvedUnit | undefined;
  /** A power of a length unit of exactly this size: 1e-6 m² -> mm², 1e-6 m³ -> cm³. */
  lengthPower(dim: Dimension, factor: number): ResolvedUnit | undefined;
}

/** Prefixes for the sizes of named units: an engineering choice (no hecto, deca, centi). */
const PREFIXES = ['G', 'M', 'k', '', 'm', 'µ', 'n'];
const LENGTHS = ['mm', 'cm', 'dm', 'm', 'km'];
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/** For composedHint: named dimensions except energy (a moment is N·m, not J), and the units of a registry. */
export function unitNames(resolve: (symbol: string) => { dim: Dimension; factor: number } | undefined, preferred: readonly string[]): UnitNames {
  const named = preferred.filter((s) => s !== 'J').flatMap((s) => {
    const unit = resolve(s);
    return unit ? [{ symbol: s, dim: unit.dim }] : [];
  });
  return {
    hasOwnName: (dim) => named.some((n) => sameDim(n.dim, dim)),
    dimOf: (symbol) => resolve(symbol)?.dim,
    ownUnit: (dim, factor, value) => {
      const base = named.find((n) => sameDim(n.dim, dim));
      if (!base) return undefined;
      const sizes = PREFIXES.flatMap((p) => {
        const unit = resolve(p + base.symbol);
        return unit && sameDim(unit.dim, dim) ? [{ symbol: p + base.symbol, factor: unit.factor }] : [];
      });
      const down = [...sizes].sort((a, b) => b.factor - a.factor);
      let fits = down.find((s) => s.factor <= factor * (1 + 1e-9)) ?? down.at(-1);
      // 0,193 GPa reads as 193 MPa.
      while (fits && value !== undefined && value !== 0 && Math.abs(value) / fits.factor < 1) {
        const smaller = down[down.indexOf(fits) + 1];
        if (!smaller) break;
        fits = smaller;
      }
      return fits ? { symbol: fits.symbol, factor: fits.factor, dim } : undefined;
    },
    lengthPower: (dim, factor) => {
      for (const symbol of LENGTHS) {
        const unit = resolve(symbol);
        if (!unit) continue;
        for (const e of [2, 3, 4]) {
          if (sameDim(powerDim(unit.dim, e), dim) && same(unit.factor ** e, factor)) {
            return { symbol: `${symbol}${superscript(e)}`, factor, dim, power: { symbol, exponent: e, factor: unit.factor, dim: unit.dim } };
          }
        }
      }
      return undefined;
    },
  };
}
