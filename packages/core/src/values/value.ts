/**
 * Runtime values.
 *
 * A quantity is stored in coherent SI units (postgresql-unit, Calcpad):
 * 20 °C is stored as 293.15 with dimension Θ. Units only matter for input and
 * display.
 */

import type { FitInfo } from '../eval/fit.js';
import type { SheetResult } from '../graph/session.js';
import type { Span } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import type { Cell, Table } from '../tables/table.js';
import { DIMENSIONLESS, dimKey, type Dimension } from '../units/dimension.js';
import type { ResolvedUnit } from '../units/unitExpr.js';

export interface Quantity {
  readonly type: 'quantity';
  /** Magnitude in coherent SI units. */
  readonly si: number;
  readonly dim: Dimension;
  /** True for absolute temperatures entered in °C or °F. */
  readonly absolute?: boolean;
  /** Unit the value came with; used for display when no target unit is given. */
  readonly hint?: ResolvedUnit;
  /** Imaginary part in coherent SI units, for complex values (impedance 3 + 4j Ω). */
  readonly im?: number;
}

export interface BooleanValue {
  readonly type: 'boolean';
  readonly value: boolean;
}

export interface TextValue {
  readonly type: 'text';
  readonly value: string;
}

export interface TableValue {
  readonly type: 'table';
  readonly table: Table;
}

/** Where a row came from: one table row, or an interpolation between two. */
export interface RowOrigin {
  readonly rows: readonly number[];
  /** Interpolation weight of the second row (0..1; outside when extrapolated). */
  readonly weight?: number;
  /** Column the interpolation ran on. */
  readonly column?: string;
  /** Second axis of a 2D interpolation: its weight and column. */
  readonly weight2?: number;
  readonly column2?: string;
}

export interface RowValue {
  readonly type: 'row';
  readonly table: Table;
  readonly cells: readonly Cell[];
  /** Text shown for the row, e.g. "IPE 200". */
  readonly label: string;
  readonly origin: RowOrigin;
}

/** A user function (A_kruh(d) := π·d²/4) with the values its body reads from above. */
export interface FunctionValue {
  readonly type: 'function';
  readonly name: string;
  readonly params: readonly string[];
  readonly body: Expr;
  readonly captured: ReadonlyMap<string, Value>;
  /** A curve fitted through points (fit(…)): its kind, coefficients and R², for print. */
  readonly fit?: FitInfo;
  /** Calculated by the program, not by its body: the solution of a differential equation. */
  readonly native?: (args: readonly Value[], span: Span) => Value;
  /** Its derivatives at a point (w′(0 m)), where the program has them. */
  readonly derivative?: (order: number, arg: Value, span: Span) => Value;
}

/** Result of a block (N1 := Prosty_nosnik(L: 6 m)): its values, read as N1.M_max. */
export interface RecordValue {
  readonly type: 'record';
  readonly block: string;
  readonly version: string;
  /** The inputs given at the call. */
  readonly inputs: ReadonlyMap<string, Value>;
  /** All values of the block, inputs included. */
  readonly values: ReadonlyMap<string, Value>;
  /** The block calculated with these inputs, for print and provenance (none for a position of the sheet). */
  readonly result?: SheetResult;
  /** A position of the sheet (Pos. 1): its label, its values read as Pos1.A. */
  readonly position?: string;
}

/** A series of numbers of one dimension: cash flows by year, measurements. */
export interface VectorValue {
  readonly type: 'vector';
  readonly items: readonly Quantity[];
}

/**
 * A matrix, row by row: [4, -2 | -2, 4] kN/m. Each item has its own unit, as
 * a stiffness matrix with kN/m, kN and kN·m has.
 */
export interface MatrixValue {
  readonly type: 'matrix';
  readonly rows: number;
  readonly cols: number;
  /** Row by row: the item in row i, column j (from 0) is items[i·cols + j]. */
  readonly items: readonly Quantity[];
}

export type Value = Quantity | BooleanValue | TextValue | TableValue | RowValue | FunctionValue | RecordValue | VectorValue | MatrixValue;

export function quantity(si: number, dim: Dimension = DIMENSIONLESS, extra: Partial<Pick<Quantity, 'absolute' | 'hint' | 'im'>> = {}): Quantity {
  return {
    type: 'quantity',
    si,
    dim,
    ...(extra.absolute ? { absolute: true } : {}),
    ...(extra.hint ? { hint: extra.hint } : {}),
    ...(extra.im ? { im: extra.im } : {}),
  };
}

/** Stable fingerprint used by the incremental evaluator. */
export function fingerprint(value: Value): string {
  switch (value.type) {
    case 'quantity':
      return `q:${value.si}:${dimKey(value.dim)}:${value.absolute ? 'a' : ''}:${value.hint?.symbol ?? ''}${value.im ? `:i${value.im}` : ''}`;
    case 'boolean':
      return `b:${value.value}`;
    case 'text':
      return `t:${value.value}`;
    case 'table':
      return `T:${value.table.fingerprint}`;
    case 'row':
      return `r:${value.table.fingerprint}:${value.origin.rows.join(',')}:${value.origin.weight ?? ''}:${value.origin.weight2 ?? ''}`;
    case 'function': {
      // The body without source positions, and the values it reads.
      const body = JSON.stringify(value.body, (key, v: unknown) => (key === 'span' || key === 'nameSpan' ? undefined : v));
      const captured = [...value.captured].map(([name, v]) => `${name}=${fingerprint(v)}`).join(';');
      return `f:${value.name}(${value.params.join(',')}):${body}:${captured}`;
    }
    case 'vector':
      return `v:${value.items.map(fingerprint).join('|')}`;
    case 'matrix':
      return `m${value.rows}x${value.cols}:${value.items.map(fingerprint).join('|')}`;
    case 'record':
      return `B:${value.block}:${value.version}:${[...value.values].map(([name, v]) => `${name}=${fingerprint(v)}`).join(';')}`;
  }
}

export function typeName(value: Value): string {
  return value.type === 'quantity' ? 'number' : value.type;
}
