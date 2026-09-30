/**
 * Reusable blocks (docs/01-filozofie.md, ch. 6.2): a finished calculation
 * with clear inputs and outputs, stored in the sheet and used by name.
 *
 *   Block "Prosty_nosnik":          In the sheet:
 *     input L := 5 m                  N1 := Prosty_nosnik(L: 6 m, q: 10 kN/m)
 *     input q := 12 kN/m              M := N1.M_max
 *     M_max := q·L²/8
 *
 * Inputs are given by name; the ones left out keep the block's own value. The
 * block is calculated as a sheet of its own; its values are the outputs.
 */

import type { Span } from '../diagnostics.js';
import type { Value } from '../values/value.js';

/** A block as stored in the sheet. */
export interface BlockSource {
  readonly name: string;
  /** Calculation text; inputs are marked "input". */
  readonly source: string;
  readonly version: string;
}

/** Input given at a call: N1 := Prosty_nosnik(L: 6 m). */
export interface BlockInput {
  readonly value: Value;
  readonly nameSpan: Span;
}

/** How the evaluator reaches the blocks of the sheet. */
export interface BlockCaller {
  has(name: string): boolean;
  call(name: string, inputs: ReadonlyMap<string, BlockInput>, span: Span): Value;
}

/** Version written in a block's text: "@version 1.2"; "1" when there is none. */
export function blockVersion(source: string): string {
  return /^[ \t]*@version[ \t]+(\S+)/m.exec(source)?.[1] ?? '1';
}
