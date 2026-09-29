/**
 * Plain-text report of an evaluated sheet, for the terminal.
 */

import { type SheetResult, type Statement, type StatementResult } from '@calccanvas/core';
import { formatDiagnostic, formatNumber, type Catalog } from '@calccanvas/i18n';

export interface ReportOptions {
  readonly catalog: Catalog;
  readonly digits?: number;
}

export function formatReport(result: SheetResult, options: ReportOptions): string {
  const { catalog } = options;
  const lines: string[] = [];

  for (const r of result.statements) {
    const text = formatStatement(r, options);
    if (text !== undefined) lines.push(`${String(r.statement.span.line).padStart(4)} │ ${text}`);
    for (const d of r.diagnostics) {
      lines.push(`     │   ${catalog.severity[d.severity]} ${d.span.line}:${d.span.column}: ${formatDiagnostic(d, catalog)}`);
    }
  }

  const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning').length;
  lines.push('', `${catalog.severity.error}: ${errors}, ${catalog.severity.warning}: ${warnings}`);
  return lines.join('\n');
}

function formatStatement(r: StatementResult, options: ReportOptions): string | undefined {
  const s: Statement = r.statement;
  switch (s.kind) {
    case 'heading':
      return `${'#'.repeat(s.level)} ${s.text}`;
    case 'text':
      return s.text;
    case 'definition':
    case 'display': {
      const label = s.kind === 'definition' ? `${s.name} = ` : '';
      return label + formatValue(r, options) + (s.comment ? `   ' ${s.comment}` : '');
    }
    case 'invalid':
      return '?';
    default:
      return undefined;
  }
}

function formatValue(r: StatementResult, options: ReportOptions): string {
  if (r.display) {
    const number = formatNumber(r.display.value, options.catalog, options.digits !== undefined ? { digits: options.digits } : {});
    return r.display.unit ? `${number} ${r.display.unit}` : number;
  }
  if (r.value?.type === 'boolean') return options.catalog.terms[String(r.value.value)] ?? String(r.value.value);
  if (r.value?.type === 'text') return JSON.stringify(r.value.value);
  return '?';
}
