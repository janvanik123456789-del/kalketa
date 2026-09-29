/**
 * Runtime values.
 *
 * A quantity is stored in coherent SI units (postgresql-unit, Calcpad):
 * 20 °C is stored as 293.15 with dimension Θ. Units only matter for input and
 * display.
 */

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
}

export interface RowValue {
  readonly type: 'row';
  readonly table: Table;
  readonly cells: readonly Cell[];
  /** Text shown for the row, e.g. "IPE 200". */
  readonly label: string;
  readonly origin: RowOrigin;
}

export type Value = Quantity | BooleanValue | TextValue | TableValue | RowValue;

export function quantity(si: number, dim: Dimension = DIMENSIONLESS, extra: Partial<Pick<Quantity, 'absolute' | 'hint'>> = {}): Quantity {
  return {
    type: 'quantity',
    si,
    dim,
    ...(extra.absolute ? { absolute: true } : {}),
    ...(extra.hint ? { hint: extra.hint } : {}),
  };
}

/** Stable fingerprint used by the incremental evaluator. */
export function fingerprint(value: Value): string {
  switch (value.type) {
    case 'quantity':
      return `q:${value.si}:${dimKey(value.dim)}:${value.absolute ? 'a' : ''}:${value.hint?.symbol ?? ''}`;
    case 'boolean':
      return `b:${value.value}`;
    case 'text':
      return `t:${value.value}`;
    case 'table':
      return `T:${value.table.fingerprint}`;
    case 'row':
      return `r:${value.table.fingerprint}:${value.origin.rows.join(',')}:${value.origin.weight ?? ''}`;
  }
}

export function typeName(value: Value): string {
  return value.type === 'quantity' ? 'number' : value.type;
}
