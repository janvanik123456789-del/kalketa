/**
 * What changed between two calculations (docs/01-filozofie.md, ch. 7): the
 * lines written differently, the values that came out differently and the
 * checks, e.g. "IPE 200 → IPE 220, bending 94 % → 76 %". Used to compare
 * revisions of a sheet, later also open calculations side by side.
 *
 * The core gives values and codes; the UI writes them in its language.
 */

import { sameDim } from '../units/dimension.js';
import { toDisplay, type DisplayValue } from '../units/display.js';
import type { UnitRegistry } from '../units/registry.js';
import { fingerprint, type Quantity, type Value } from '../values/value.js';
import type { SheetResult } from './session.js';

export type ComparedValue =
  | { readonly kind: 'quantity'; readonly display: DisplayValue }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  /** A series or matrix: its number of items. */
  | { readonly kind: 'items'; readonly count: number };

export interface FormulaChange {
  readonly name: string;
  /** The line as written; absent when the name is new. */
  readonly before?: string;
  /** Absent when the name is gone. */
  readonly after?: string;
}

export interface ValueChange {
  readonly name: string;
  readonly before?: ComparedValue;
  readonly after?: ComparedValue;
  /** after / before for two numbers of one dimension (1.1 = 10 % more). */
  readonly ratio?: number;
  /** Its own line changed too (an input); otherwise only what it reads changed (an impact). */
  readonly written: boolean;
}

export interface CheckState {
  readonly passed: boolean;
  readonly utilization?: number;
}

export interface CheckChange {
  /** The label of the check; unlabelled checks are numbered: "#2". */
  readonly label: string;
  readonly before?: CheckState;
  readonly after?: CheckState;
}

export interface TableChange {
  readonly name: string;
  readonly change: 'added' | 'removed' | 'changed';
}

export interface SheetComparison {
  readonly formulas: readonly FormulaChange[];
  readonly values: readonly ValueChange[];
  readonly checks: readonly CheckChange[];
  readonly tables: readonly TableChange[];
  /** Nothing differs. */
  readonly same: boolean;
}

/** Compares two evaluated sheets: before (a revision) and after (the current state or a later revision). */
export function compareSheets(before: SheetResult, after: SheetResult, registry: UnitRegistry): SheetComparison {
  const linesBefore = definitionLines(before);
  const linesAfter = definitionLines(after);
  const formulas: FormulaChange[] = [];
  for (const name of union(linesBefore.keys(), linesAfter.keys())) {
    const a = linesBefore.get(name);
    const b = linesAfter.get(name);
    if (a !== b) formulas.push({ name, ...(a !== undefined ? { before: a } : {}), ...(b !== undefined ? { after: b } : {}) });
  }
  const written = new Set(formulas.map((f) => f.name));

  const values: ValueChange[] = [];
  for (const name of union(before.values.keys(), after.values.keys())) {
    const a = before.values.get(name);
    const b = after.values.get(name);
    if (a && b && sameValue(a, b)) continue;
    const shownA = a && shown(a, registry);
    const shownB = b && shown(b, registry);
    // Functions and blocks show through the values they give.
    if (!shownA && !shownB) continue;
    const ratio = a?.type === 'quantity' && b?.type === 'quantity' && sameDim(a.dim, b.dim) && a.si !== 0 && !a.im && !b.im ? b.si / a.si : undefined;
    values.push({ name, ...(shownA ? { before: shownA } : {}), ...(shownB ? { after: shownB } : {}), ...(ratio !== undefined ? { ratio } : {}), written: written.has(name) });
  }

  const checksBefore = checkStates(before);
  const checksAfter = checkStates(after);
  const checks: CheckChange[] = [];
  for (const label of union(checksBefore.keys(), checksAfter.keys())) {
    const a = checksBefore.get(label);
    const b = checksAfter.get(label);
    if (a && b && a.passed === b.passed && closeTo(a.utilization, b.utilization)) continue;
    checks.push({ label, ...(a ? { before: a } : {}), ...(b ? { after: b } : {}) });
  }

  const tables: TableChange[] = [];
  for (const name of union(before.tables.keys(), after.tables.keys())) {
    const a = before.tables.get(name);
    const b = after.tables.get(name);
    if (!a) tables.push({ name, change: 'added' });
    else if (!b) tables.push({ name, change: 'removed' });
    else if (a.fingerprint !== b.fingerprint) tables.push({ name, change: 'changed' });
  }

  return { formulas, values, checks, tables, same: formulas.length + values.length + checks.length + tables.length === 0 };
}

function union(a: Iterable<string>, b: Iterable<string>): string[] {
  return [...new Set([...a, ...b])];
}

/** Every definition as written, by name, with spaces evened out. */
function definitionLines(result: SheetResult): Map<string, string> {
  const lines = new Map<string, string>();
  for (const r of result.statements) {
    const s = r.statement;
    if (s.kind !== 'definition') continue;
    lines.set(s.name, result.source.slice(s.span.offset, s.span.offset + s.span.length).replace(/\s+/g, ' ').trim());
  }
  return lines;
}

function checkStates(result: SheetResult): Map<string, CheckState> {
  const states = new Map<string, CheckState>();
  let unlabelled = 0;
  for (const c of result.checks) {
    const label = c.label ?? `#${++unlabelled}`;
    states.set(label, { passed: c.passed, ...(c.utilization !== undefined ? { utilization: c.utilization } : {}) });
  }
  return states;
}

const TOLERANCE = 1e-12;

function closeTo(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) <= TOLERANCE * Math.max(Math.abs(a), Math.abs(b), 1e-300);
}

function sameQuantity(a: Quantity, b: Quantity): boolean {
  return sameDim(a.dim, b.dim) && !!a.absolute === !!b.absolute && closeTo(a.si, b.si) && closeTo(a.im ?? 0, b.im ?? 0);
}

/** The same value; a quantity only by its size (another unit to show it in is no change). */
function sameValue(a: Value, b: Value): boolean {
  if (a.type === 'quantity' && b.type === 'quantity') return sameQuantity(a, b);
  if ((a.type === 'vector' && b.type === 'vector') || (a.type === 'matrix' && b.type === 'matrix')) {
    return a.items.length === b.items.length && a.items.every((q, i) => sameQuantity(q, b.items[i]!));
  }
  return fingerprint(a) === fingerprint(b);
}

function shown(value: Value, registry: UnitRegistry): ComparedValue | undefined {
  switch (value.type) {
    case 'quantity':
      return { kind: 'quantity', display: toDisplay(value, registry) };
    case 'row':
      return { kind: 'text', text: value.label };
    case 'text':
      return { kind: 'text', text: value.value };
    case 'boolean':
      return { kind: 'boolean', value: value.value };
    case 'vector':
    case 'matrix':
      return { kind: 'items', count: value.items.length };
    default:
      return undefined;
  }
}
