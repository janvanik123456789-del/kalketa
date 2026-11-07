/**
 * The lines an entry puts into a sheet: the formula rearranged for the quantity sought, and inputs for what the
 * sheet does not have yet, each with the example value of the entry marked {example}. The core does the
 * rearranging (solve gives a formula where it can), so a formula of the library is no special case of it.
 */

import { evaluateSheet, formatExpr, sameDim, tokenize, type Dimension, type SheetResult } from '@kalketa/core';
import { sides, text, type Entry, type Language } from './entry.js';

/** What the sheet has where the lines go: names defined above, with their dimension, and every name it defines. */
export interface SheetNames {
  /** Names defined above the place of insertion, with the dimension of their value (undefined: not a number). */
  readonly above: ReadonlyMap<string, Dimension | undefined>;
  /** Every name the sheet defines, above or below; a new line must not define one of them again. */
  readonly taken: ReadonlySet<string>;
}

export const EMPTY_SHEET: SheetNames = { above: new Map(), taken: new Set() };

export interface Insertion {
  /** Lines of the calculation language, inputs first, the formula last. */
  readonly lines: readonly string[];
  /** The name the result got (σ, or σ_2 when the sheet has σ already). */
  readonly target: string;
  /** Quantities taken from the sheet as they are. */
  readonly reused: readonly string[];
  /** Quantities that got another name, because the sheet has the name for something else. */
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  /** Inputs inserted with an example value. */
  readonly inputs: readonly string[];
  /** No formula for it: the value is found by solve from a first guess. */
  readonly numeric: boolean;
}

/** The dimension a unit written in the entry has (kN*m → force × length). */
export function unitDimension(unit: string): Dimension | undefined {
  const value = evaluateSheet(`x := 1 ${unit}`).values.get('x');
  return value?.type === 'quantity' ? value.dim : undefined;
}

/** The formula with names replaced, token by token, so σ_x stays when σ is renamed. */
export function renameIn(formula: string, names: ReadonlyMap<string, string>): string {
  if (names.size === 0) return formula;
  const tokens = tokenize(formula).tokens.filter((t) => t.type === 'ident' && names.has(t.text));
  let out = formula;
  for (const token of [...tokens].reverse()) {
    out = out.slice(0, token.span.offset) + names.get(token.text)! + out.slice(token.span.offset + token.span.length);
  }
  return out;
}

/** A name like the one given that the sheet does not use: σ_2, σ_x2. */
function freeName(name: string, taken: ReadonlySet<string>, own: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const candidate = name.includes('_') ? `${name}${n}` : `${name}_${n}`;
    if (!taken.has(candidate) && !own.has(candidate)) return candidate;
  }
}

/**
 * The formula for the quantity sought, from the core: "M/W" for σ of σ == M/W, "M/σ" for W. Undefined when it
 * cannot be written as a formula (the unknown twice, a power of it that is no whole number); then solve finds it.
 */
export function rearranged(entry: Entry, target: string, formula = entry.formula, names: ReadonlyMap<string, string> = new Map()): string | undefined {
  const name = (q: string) => names.get(q) ?? q;
  const inputs = Object.entries(entry.quantities).filter(([q]) => q !== target).map(([q, info]) => `${name(q)} := ${info.example}`);
  const result: SheetResult = evaluateSheet([...inputs, `solve ${name(target)}: ${formula}`].join('\n'));
  const solve = result.statements.find((s) => s.statement.kind === 'solve');
  const found = solve?.solutions?.length === 1 ? solve.solutions[0]?.formula : undefined;
  return found ? formatExpr(found) : undefined;
}

/** The lines that put the entry into the sheet, rearranged for the target. */
export function insertion(entry: Entry, target: string, sheet: SheetNames, language: Language): Insertion {
  if (!(target in entry.quantities)) throw new RangeError(`${entry.id} has no quantity ${target}`);
  const renames = new Map<string, string>();
  const own = new Set(Object.keys(entry.quantities));
  const reused: string[] = [];
  const inputs: string[] = [];
  for (const [q, info] of Object.entries(entry.quantities)) {
    const there = sheet.above.has(q);
    const fits = there && q !== target && (() => {
      const dim = sheet.above.get(q);
      const wanted = unitDimension(info.unit);
      return dim !== undefined && wanted !== undefined && sameDim(dim, wanted);
    })();
    if (fits) reused.push(q);
    else if (there || sheet.taken.has(q)) {
      const to = freeName(q, sheet.taken, new Set([...own, ...renames.values()]));
      renames.set(q, to);
    }
  }
  const name = (q: string) => renames.get(q) ?? q;
  const formula = renameIn(entry.formula, renames);
  const lines: string[] = [];
  for (const [q, info] of Object.entries(entry.quantities)) {
    if (q === target || reused.includes(q)) continue;
    inputs.push(name(q));
    lines.push(`${name(q)} := ${info.example} {example}  ' ${text(info.name, language)}`);
  }
  const unit = entry.quantities[target]!.unit;
  const source = `source "${text(entry.source.text, language).replace(/"/g, '')}"`;
  const expr = rearranged(entry, target, formula, renames);
  const shown = unit ? ` | ${unit}` : '';
  if (expr !== undefined) lines.push(`${name(target)} := ${expr}${shown}  ${source}`);
  else lines.push(`${name(target)} := solve(${formula}, ${name(target)}: ${entry.quantities[target]!.example})${shown}  ${source}`);
  return {
    lines,
    target: name(target),
    reused,
    renamed: [...renames].map(([from, to]) => ({ from, to })),
    inputs,
    numeric: expr === undefined,
  };
}

/** What a sheet has above a line (0-based statement index or line number): names and their dimensions. */
export function sheetNames(result: SheetResult, beforeLine: number): SheetNames {
  const above = new Map<string, Dimension | undefined>();
  const taken = new Set<string>();
  for (const row of result.statements) {
    const statement = row.statement;
    const name = 'name' in statement && typeof statement.name === 'string' ? statement.name : undefined;
    if (!name) continue;
    taken.add(name);
    if (statement.span.line <= beforeLine) above.set(name, row.value?.type === 'quantity' ? row.value.dim : undefined);
  }
  for (const name of result.tables.keys()) taken.add(name);
  return { above, taken };
}
