/**
 * What a proposed change does to the calculation, before the user decides:
 * the sheet is evaluated as it is and with the change, and the errors and
 * checks of both are compared ("Průhyb 120 % → 84 %").
 */
import type { SheetResult } from '@kalketa/core';

export interface CheckEffect {
  readonly label: string;
  readonly before?: { readonly passed: boolean; readonly utilization?: number };
  readonly after?: { readonly passed: boolean; readonly utilization?: number };
}

export interface ProposalEffect {
  readonly errors: { readonly before: number; readonly after: number };
  /** Checks whose result or utilization changes, or that come or go. */
  readonly checks: readonly CheckEffect[];
}

function checksOf(result: SheetResult): Map<string, { passed: boolean; utilization?: number }> {
  const checks = new Map<string, { passed: boolean; utilization?: number }>();
  result.checks.forEach((c, i) => {
    const label = c.label ?? `#${i + 1}`;
    checks.set(label, { passed: c.passed, ...(c.utilization !== undefined ? { utilization: c.utilization } : {}) });
  });
  return checks;
}

export function proposalEffect(before: SheetResult, after: SheetResult): ProposalEffect {
  const errors = (r: SheetResult) => r.diagnostics.filter((d) => d.severity === 'error').length;
  const b = checksOf(before);
  const a = checksOf(after);
  const checks: CheckEffect[] = [];
  for (const label of new Set([...b.keys(), ...a.keys()])) {
    const x = b.get(label);
    const y = a.get(label);
    const same = x && y && x.passed === y.passed && Math.round((x.utilization ?? -1) * 1000) === Math.round((y.utilization ?? -1) * 1000);
    if (!same) checks.push({ label, ...(x ? { before: x } : {}), ...(y ? { after: y } : {}) });
  }
  return { errors: { before: errors(before), after: errors(after) }, checks };
}
