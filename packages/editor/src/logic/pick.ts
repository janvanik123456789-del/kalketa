/**
 * `name := pick(Table, "key")` is shown in the editor as a drop-down of the
 * table's rows; choosing a row rewrites the key in the source.
 */

import type { Statement } from '@calccanvas/core';

export interface PickInfo {
  readonly table: string;
  readonly key: string;
  /** Position of the key's string literal (quotes included) in the source. */
  readonly offset: number;
  readonly length: number;
}

export function pickOf(statement: Statement | undefined): PickInfo | undefined {
  if (statement?.kind !== 'definition') return undefined;
  const e = statement.expr;
  if (e.kind !== 'call' || e.name !== 'pick' || e.named.length > 0 || e.args.length !== 2) return undefined;
  const [table, key] = e.args;
  if (table?.kind !== 'variable' || key?.kind !== 'string') return undefined;
  return { table: table.name, key: key.value, offset: key.span.offset, length: key.span.length };
}

/** Source with the pick key replaced. Keys containing a quote cannot be written and are refused. */
export function replacePickKey(source: string, pick: PickInfo, key: string): string | undefined {
  if (key.includes('"') || key.includes('\n')) return undefined;
  return source.slice(0, pick.offset) + `"${key}"` + source.slice(pick.offset + pick.length);
}
