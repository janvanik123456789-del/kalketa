/**
 * What a canvas shows of a calculation (the canvas itself knows none): {L} as its line shows it (5 m), and for driving
 * dimensions its length in metres. For the program and for the command line alike, so a printout from either is the same.
 */

import type { SheetResult } from '@kalketa/core';
import { formatNumber, type Catalog } from '@kalketa/i18n';

export function canvasValues(result: SheetResult, catalog: Catalog): ((name: string) => string | undefined) & { readonly lengthOf: (name: string) => number | 'other' | undefined } {
  const shown = new Map<string, string>();
  const lengths = new Map<string, number | 'other'>();
  for (const r of result.statements) {
    if (r.statement.kind !== 'definition' || !r.display) continue;
    const name = r.statement.name;
    shown.set(name, `${formatNumber(r.display.value, catalog, { digits: 4 })}${r.display.unit ? ` ${r.display.unit}` : ''}`.replace('-', '−'));
    const value = r.value;
    const isLength = value?.type === 'quantity' && Object.keys(value.dim).length === 1 && value.dim['L'] === 1 && !value.im;
    lengths.set(name, isLength ? value.si : 'other');
  }
  return Object.assign((name: string) => shown.get(name), { lengthOf: (name: string) => lengths.get(name) });
}
