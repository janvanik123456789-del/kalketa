/**
 * Plain-text report of an evaluated sheet, for the terminal.
 */

import {
  defaultRegistry,
  toDisplay,
  type CheckResult,
  type Quantity,
  type SheetResult,
  type Statement,
  type StatementResult,
  type TraceNode,
} from '@calccanvas/core';
import { formatDiagnostic, formatNumber, t, type Catalog } from '@calccanvas/i18n';

export interface ReportOptions {
  readonly catalog: Catalog;
  readonly digits?: number;
}

const OPERATOR_SYMBOLS: Readonly<Record<string, string>> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

export function formatReport(result: SheetResult, options: ReportOptions): string {
  const { catalog } = options;
  const lines: string[] = [];

  for (const r of result.statements) {
    const text = formatStatement(r, result, options);
    if (text !== undefined) lines.push(`${String(r.statement.span.line).padStart(4)} │ ${text}`);
    for (const d of r.diagnostics) {
      lines.push(`     │   ${catalog.severity[d.severity]} ${d.span.line}:${d.span.column}: ${formatDiagnostic(d, catalog)}`);
    }
  }

  if (result.checks.length > 0) lines.push('', ...formatCheckSummary(result, options));

  const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning').length;
  lines.push('', `${catalog.severity.error}: ${errors}, ${catalog.severity.warning}: ${warnings}`);
  return lines.join('\n');
}

function formatStatement(r: StatementResult, result: SheetResult, options: ReportOptions): string | undefined {
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
    case 'check': {
      const condition = result.source.slice(s.expr.span.offset, s.expr.span.offset + s.expr.span.length);
      const head = s.label ? `${s.label}: ${condition}` : condition;
      if (!r.check) return `${head}   ${t(options.catalog, 'checks.notEvaluated')}`;
      return `${head}   ${formatCheckValues(r.check, options)}`;
    }
    case 'invalid':
      return '?';
    default:
      return undefined;
  }
}

function formatCheckValues(check: CheckResult, options: ReportOptions): string {
  const parts: string[] = [];
  if (check.left && check.right && check.operator) {
    parts.push(`→ ${formatQuantity(check.left, options)} ${OPERATOR_SYMBOLS[check.operator]} ${formatQuantity(check.right, options)}`);
  }
  if (check.utilization !== undefined) parts.push(formatPercent(check.utilization, options));
  parts.push(t(options.catalog, check.passed ? 'checks.passed' : 'checks.failed'));
  if (check.source) parts.push(`[${check.source}]`);
  return parts.join('   ');
}

function formatCheckSummary(result: SheetResult, options: ReportOptions): string[] {
  const { catalog } = options;
  const rows = result.checks.map((c) => {
    const statement = result.statements[c.statement]!;
    const name = c.label ?? `${t(catalog, 'checks.check')} ${statement.statement.span.line}`;
    const evaluated = statement.check !== undefined;
    return [
      name,
      c.utilization !== undefined ? formatPercent(c.utilization, options) : '',
      evaluated ? t(catalog, c.passed ? 'checks.passed' : 'checks.failed') : t(catalog, 'checks.notEvaluated'),
      c.source ?? '',
    ];
  });
  const header = [t(catalog, 'checks.check'), t(catalog, 'checks.utilization'), '', t(catalog, 'checks.source')];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === 1 ? c.padStart(widths[i]!) : c.padEnd(widths[i]!))).join('   ').trimEnd();

  const failed = result.checks.filter((c) => !c.passed).length;
  return [
    `${t(catalog, 'checks.title')}:`,
    line(header),
    ...rows.map(line),
    failed === 0 ? t(catalog, 'checks.allPassed') : t(catalog, 'checks.someFailed', { count: failed, total: result.checks.length }),
  ];
}

/** Provenance tree of one result. */
export function formatTrace(node: TraceNode, options: ReportOptions): string {
  const { catalog } = options;
  const lines: string[] = [];
  const visit = (n: TraceNode, prefix: string, childPrefix: string): void => {
    const value = n.display ? ` = ${formatDisplay(n.display.value, n.display.unit, options)}` : n.value?.type === 'row' ? ` = ${n.value.label}` : '';
    // Plain inputs ("q := 12 kN/m") need no formula; computed values show theirs.
    const computed = n.inputs.length > 0 || n.tables.length > 0;
    const formula = n.expression && computed ? `   ← ${n.expression}` : '';
    const where = n.line !== undefined ? `   (${n.line})` : '';
    lines.push(`${prefix}${n.name}${value}${formula}${where}${n.comment ? `   ' ${n.comment}` : ''}`);

    const tableLines = n.tables.map((ref) => {
      const rows = ref.rowLabels.join(' – ');
      const rowWord = t(catalog, ref.rows.length > 1 ? 'trace.rows' : 'trace.row');
      const column = ref.column ? `, ${t(catalog, 'trace.column')} ${ref.column}` : '';
      const interpolated = ref.weight !== undefined ? `, ${t(catalog, 'trace.interpolated')}` : '';
      const source = ref.source ? ` — ${t(catalog, 'trace.source')}: ${ref.source.title}${ref.source.retrieved ? ` (${ref.source.retrieved})` : ''}` : '';
      return `${t(catalog, 'trace.table')} ${ref.table}, ${rowWord} ${rows}${column}${interpolated}${source}`;
    });
    const items: (string | TraceNode)[] = [...tableLines, ...n.inputs];
    items.forEach((item, i) => {
      const last = i === items.length - 1;
      const branch = childPrefix + (last ? '└── ' : '├── ');
      const next = childPrefix + (last ? '    ' : '│   ');
      if (typeof item === 'string') lines.push(branch + item);
      else visit(item, branch, next);
    });
  };
  visit(node, '', '');
  return lines.join('\n');
}

function formatValue(r: StatementResult, options: ReportOptions): string {
  if (r.display) return formatDisplay(r.display.value, r.display.unit, options);
  if (r.value?.type === 'boolean') return options.catalog.terms[String(r.value.value)] ?? String(r.value.value);
  if (r.value?.type === 'text') return JSON.stringify(r.value.value);
  if (r.value?.type === 'row') return `${r.value.label}   (${r.value.table.name})`;
  if (r.value?.type === 'table') return r.value.table.name;
  return '?';
}

function formatQuantity(q: Quantity, options: ReportOptions): string {
  const shown = toDisplay(q, defaultRegistry);
  return formatDisplay(shown.value, shown.unit, options);
}

function formatDisplay(value: number, unit: string, options: ReportOptions): string {
  const number = formatNumber(value, options.catalog, options.digits !== undefined ? { digits: options.digits } : {});
  return unit ? `${number} ${unit}` : number;
}

function formatPercent(ratio: number, options: ReportOptions): string {
  return `${formatNumber(ratio * 100, options.catalog, { digits: 4 })} %`;
}
