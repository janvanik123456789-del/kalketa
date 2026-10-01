/**
 * Units of a product or quotient composed from the units of its operands:
 * kN/m · m² = kN·m, kN·m / m = kN. Without this a moment from q in kN/m and
 * L in m came out in SI as joules (the dimension of energy and of a moment
 * is the same).
 */

import { divideDims, isDimensionless, multiplyDims, sameDim, type Dimension } from './dimension.js';
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
 * The unit of a · b or a / b from the units the operands carry. Undefined when
 * the result has a name of its own (force N, pressure Pa, power W…: shown
 * so, as before), when it has no dimension, or when the units do not compose
 * readably (more than three symbols, temperatures).
 */
export function composedHint(op: '*' | '/', a: ResolvedUnit, b: ResolvedUnit, units: UnitNames): ResolvedUnit | undefined {
  if (a.offset !== undefined || b.offset !== undefined) return undefined;
  const ta = unitTerms(a.symbol);
  const tb = unitTerms(b.symbol);
  if (!ta || !tb) return undefined;
  const terms = new Map(ta);
  for (const [name, e] of tb) terms.set(name, (terms.get(name) ?? 0) + (op === '*' ? e : -e));
  for (const [name, e] of terms) if (e === 0) terms.delete(name);
  const dim = op === '*' ? multiplyDims(a.dim, b.dim) : divideDims(a.dim, b.dim);
  // A single unit (kN) is kept; a compound one (MPa·mm²) gives way to a name of its own (N).
  if (terms.size === 0 || terms.size > 3 || isDimensionless(dim) || (terms.size > 1 && units.hasOwnName(dim))) return undefined;
  // mm² · m is not a unit to show: two units of one dimension stay apart only in SI (m³).
  const dims = [...terms.keys()].map((name) => units.dimOf(name));
  if (dims.some((d, i) => !d || dims.some((e, j) => j > i && e && sameDim(d, e)))) return undefined;
  const factor = op === '*' ? a.factor * b.factor : a.factor / b.factor;
  return { symbol: formatTerms(terms), factor, dim };
}

export interface UnitNames {
  /** Whether the dimension has a unit name of its own (N, Pa, W…). */
  hasOwnName(dim: Dimension): boolean;
  /** The dimension of a unit symbol, if it is one. */
  dimOf(symbol: string): Dimension | undefined;
}

/** For composedHint: named dimensions except energy (a moment is N·m, not J), and the units of a registry. */
export function unitNames(resolve: (symbol: string) => { dim: Dimension } | undefined, preferred: readonly string[]): UnitNames {
  const dims = preferred.filter((s) => s !== 'J').flatMap((s) => {
    const unit = resolve(s);
    return unit ? [unit.dim] : [];
  });
  return { hasOwnName: (dim) => dims.some((d) => sameDim(d, dim)), dimOf: (symbol) => resolve(symbol)?.dim };
}
