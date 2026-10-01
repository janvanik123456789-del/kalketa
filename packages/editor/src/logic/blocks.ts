/**
 * The line that uses a block, written from the block's "input" lines.
 */

import { defaultRegistry, parse } from '@kalketa/core';

/** Inputs of a block as "name: value" in the block's own notation. */
export function blockCall(name: string, source: string): string {
  const { sheet } = parse(source, { isUnit: (n) => defaultRegistry.isUnit(n) });
  const inputs = sheet.statements.flatMap((s) =>
    s.kind === 'definition' && s.input ? [`${s.name}: ${source.slice(s.expr.span.offset, s.expr.span.offset + s.expr.span.length)}`] : [],
  );
  return `${name}(${inputs.join(', ')})`;
}
