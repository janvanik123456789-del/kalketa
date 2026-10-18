/**
 * A calculation checked in Python: a script (written by a person or by the AI into the sources
 * layer) reports its results by the names of the sheet, and they are set beside the values the
 * core calculated. Two engines that agree on a number make a mistake of either unlikely.
 *
 *   ```python
 *   from math import sqrt
 *   g, h_1, h_2 = 9.81, 3.0, 6.0
 *   result("v_A", sqrt(2*g*(h_1 + h_2)), "m/s")
 *   ```
 *
 * The script runs without access to files or the network; `result(name, value, unit)` is defined
 * before it. Its results travel in the output on lines of their own, which are taken out of the
 * text shown.
 */

import { evaluateSheet, toDisplay, defaultRegistry, sameDim, type Quantity, type SheetResult } from '@kalketa/core';

/** Lines of the output that carry a result: the mark, then JSON. */
export const RESULT_MARK = '@@kalketa ';

/** Defined before the script: result(name, value, unit="", rel=1e-6). */
export const PYTHON_PRELUDE = `def result(name, value, unit="", rel=1e-6):
    """Report a result of the check by its name in the sheet, with its unit as Kalketa writes it."""
    import json as _json
    print("${RESULT_MARK}" + _json.dumps({"name": str(name), "value": float(value), "unit": str(unit), "rel": float(rel)}), flush=True)
`;

/** A result the script reported. */
export interface PythonResult {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  /** Relative difference still taken as agreement. */
  readonly rel: number;
}

/** What a run of a script gave. */
export interface PythonRun {
  readonly ok: boolean;
  /** The output without the lines of results. */
  readonly output: string;
  /** The error (a Python traceback, a timeout), if it failed. */
  readonly error?: string;
  readonly results: readonly PythonResult[];
  /** Which engine ran it: the built-in one (Pyodide) or Python of the computer. */
  readonly engine: 'pyodide' | 'system';
  readonly ms: number;
}

/** The results in an output and the output without them. */
export function readOutput(stdout: string): { output: string; results: PythonResult[] } {
  const results: PythonResult[] = [];
  const kept: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(RESULT_MARK)) {
      kept.push(line);
      continue;
    }
    try {
      const r = JSON.parse(line.slice(RESULT_MARK.length)) as Partial<PythonResult>;
      if (typeof r.name === 'string' && typeof r.value === 'number') results.push({ name: r.name, value: r.value, unit: typeof r.unit === 'string' ? r.unit : '', rel: typeof r.rel === 'number' && r.rel > 0 ? r.rel : 1e-6 });
    } catch {
      kept.push(line);
    }
  }
  return { output: kept.join('\n').replace(/\n+$/, ''), results };
}

/** One result set beside the sheet. */
export interface PythonComparison {
  readonly name: string;
  /** As Python gave it, in its unit. */
  readonly python: { readonly value: number; readonly unit: string };
  /** The sheet's value shown in the unit Python used; undefined when the sheet has no such name. */
  readonly kalketa?: { readonly value: number; readonly unit: string };
  /** Relative difference |K − P| / max(|K|, |P|). */
  readonly difference?: number;
  /** agree: within the tolerance; differ: not; missing: no such value in the sheet; units: the units do not match; unit: Python's unit is unknown. */
  readonly state: 'agree' | 'differ' | 'missing' | 'units' | 'unit';
}

/** The value of a name in the sheet: defined, found by a solve, or a value of the sheet. */
function sheetValue(sheet: SheetResult, name: string): Quantity | undefined {
  const solved = sheet.statements.flatMap((s) => s.solutions ?? []).find((s) => s.name === name)?.value;
  if (solved?.type === 'quantity') return solved;
  const value = sheet.values.get(name);
  return value?.type === 'quantity' ? value : undefined;
}

/** A number in a unit as Kalketa reads it ("m/s", "kN·m", "°C", "" for a plain number). */
function quantityOf(value: number, unit: string): Quantity | undefined {
  const written = `${Number.isFinite(value) ? value : 0}${unit.trim() ? ` ${unit.trim()}` : ''}`;
  const parsed = evaluateSheet(`__python := ${written}`);
  const q = parsed.statements[0]?.value;
  return parsed.diagnostics.length === 0 && q?.type === 'quantity' ? q : undefined;
}

/** The results of a script set beside the values of the sheet, in the order the script gave them. */
export function compareWithSheet(results: readonly PythonResult[], sheet: SheetResult): PythonComparison[] {
  return results.map((r): PythonComparison => {
    const python = { value: r.value, unit: r.unit };
    const own = sheetValue(sheet, r.name);
    if (!own) return { name: r.name, python, state: 'missing' };
    const theirs = quantityOf(r.value, r.unit);
    if (!theirs) return { name: r.name, python, state: 'unit' };
    if (!sameDim(own.dim, theirs.dim)) return { name: r.name, python, kalketa: { value: own.si, unit: '' }, state: 'units' };
    // The sheet's value in Python's unit, so both read alike.
    const shown = r.unit.trim() ? toDisplay(own, defaultRegistry, theirs.hint) : { value: own.si, unit: '' };
    // Python's unit as Kalketa writes it (m^2 as m²).
    const unit = theirs.hint?.symbol ?? r.unit;
    const scale = Math.max(Math.abs(own.si), Math.abs(theirs.si));
    const difference = scale === 0 ? 0 : Math.abs(own.si - theirs.si) / scale;
    return { name: r.name, python: { value: r.value, unit }, kalketa: { value: shown.value, unit: shown.unit }, difference, state: difference <= r.rel ? 'agree' : 'differ' };
  });
}
