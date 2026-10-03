/**
 * What the model gets to see of a sheet (docs/01-filozofie.md, ch. 9.2): the
 * calculation text, what the program found (errors, warnings, checks) and the
 * computed results, line by line. All in English, which costs fewer tokens;
 * the overview of the language is generated from the core, so it never goes stale.
 */
import { builtinFunctions, signature, type SheetResult } from '@kalketa/core';
import { CATALOGS, formatDiagnostic } from '@kalketa/i18n';

export interface AiSheetContext {
  readonly title: string;
  readonly source: string;
  readonly findings: readonly string[];
}

/** Results are many; the model needs the gist, not every digit. */
const MAX_RESULTS = 400;

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5)));
}

export function sheetContext(title: string, result: SheetResult): AiSheetContext {
  const en = CATALOGS['en']!;
  const lineOf = (statement: number) => result.statements[statement]?.statement.span.line;
  const diagnostics = result.diagnostics.map((d) => `line ${d.span.line}: ${d.severity} ${d.code}: ${formatDiagnostic(d, en)}`);
  const checks = result.checks.map((c) => {
    const utilization = c.utilization !== undefined ? `, utilization ${Math.round(c.utilization * 100)} %` : '';
    return `line ${lineOf(c.statement)}: check ${c.passed ? 'passed' : 'FAILED'}${c.label ? ` (${c.label})` : ''}${utilization}`;
  });
  const results = result.statements
    .filter((s) => s.display)
    .slice(0, MAX_RESULTS)
    .map((s) => `line ${s.statement.span.line} = ${number(s.display!.value)}${s.display!.im ? ` ${s.display!.im >= 0 ? '+' : '-'} ${number(Math.abs(s.display!.im))}j` : ''}${s.display!.unit ? ` ${s.display!.unit}` : ''}`);
  return {
    title,
    source: result.source,
    findings: [...diagnostics, ...checks, ...(results.length > 0 ? ['Computed results:', ...results] : [])],
  };
}

/** Built-in functions as signatures, one line: enough for the model to write valid lines. */
export function languageGuide(): string {
  const functions = builtinFunctions
    .all()
    .map((def) => signature(def))
    .join(', ');
  return [
    'Definition: name := expression, with units (L := 6 m, q := 10 kN/m); a name must be defined above its use and only once.',
    '"a =" shows a result. "expr | kN·m" sets the unit it is shown in. "x² + 2·x == 8" is an equation for the solver.',
    'check "Bending": σ ≤ f_y  source "EN 1993-1-1, 6.2.5"  is a check (label and source optional); utilization = left / right.',
    '#, ##, ### are headings; \' starts a comment; a line in "quotes" is printed text.',
    `Built-in functions: ${functions}.`,
  ].join('\n');
}
