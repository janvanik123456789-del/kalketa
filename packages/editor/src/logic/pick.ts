/**
 * `name := pick(Table, "key")` is shown in the editor as a drop-down of the
 * table's rows; choosing a row rewrites the key in the source. A number of the
 * row chosen takes that column too: `pick(Table, "key").d`, a value with its unit.
 */

import type { Statement } from '@kalketa/core';

export interface PickInfo {
  readonly table: string;
  readonly key: string;
  /** Position of the key's string literal (quotes included) in the source. */
  readonly offset: number;
  readonly length: number;
  /** The column taken from the row (pick(…).d), if any. */
  readonly column?: string;
  /** Where the call ends in the source: a column goes right after it. */
  readonly callEnd: number;
  /** Where the column taken ends, when there is one: `.d` spans callEnd .. columnEnd. */
  readonly columnEnd?: number;
}

export function pickOf(statement: Statement | undefined): PickInfo | undefined {
  if (statement?.kind !== 'definition') return undefined;
  const member = statement.expr.kind === 'member' ? statement.expr : undefined;
  const e = member ? member.object : statement.expr;
  if (e.kind !== 'call' || e.name !== 'pick' || e.named.length > 0 || e.args.length !== 2) return undefined;
  const [table, key] = e.args;
  if (table?.kind !== 'variable' || key?.kind !== 'string') return undefined;
  const callEnd = e.span.offset + e.span.length;
  return {
    table: table.name,
    key: key.value,
    offset: key.span.offset,
    length: key.span.length,
    callEnd,
    ...(member ? { column: member.name, columnEnd: member.span.offset + member.span.length } : {}),
  };
}

/**
 * Source with the pick key replaced, and with `column` the column taken from the row set
 * (added after the call, or in place of the one there). Keys containing a quote cannot be
 * written and are refused.
 */
export function replacePickKey(source: string, pick: PickInfo, key: string, column?: string): string | undefined {
  if (key.includes('"') || key.includes('\n')) return undefined;
  const keyed = (text: string) => text.slice(0, pick.offset) + `"${key}"` + text.slice(pick.offset + pick.length);
  if (column === undefined) return keyed(source);
  // The column first: it stands after the key, so the key's position stays valid.
  const end = pick.columnEnd ?? pick.callEnd;
  return keyed(source.slice(0, pick.callEnd) + `.${column}` + source.slice(end));
}
