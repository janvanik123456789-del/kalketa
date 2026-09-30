/**
 * Print model: the semantic layout of the print layer (rendering doc, ch. 38).
 *
 * It turns an evaluated sheet into lines of a classical technical calculation
 *
 *   M_Ed = q·L²/8                   formula
 *        = 12 kN/m · (5 m)² / 8     substitution
 *        = 37,5 kN·m                result
 *
 * and knows nothing about HTML. Errors are always shown, never hidden behind
 * a value (rule R8).
 */

import {
  formatUnit,
  toDisplay,
  type Diagnostic,
  type Expr,
  type Quantity,
  type SheetResult,
  type StatementResult,
  type UnitRegistry,
  type Value,
} from '@calccanvas/core';
import { formatDate, formatDiagnostic, formatNumber, t, type Catalog } from '@calccanvas/i18n';
import { formulaNode, hasSubstitutableParts, THIN_SPACE, type FormulaOptions, type Substituted } from './formula.js';
import { mi, mn, mo, mtext, mu, nameNode, paren, row, sup, type MathNode } from './math.js';

export interface PrintOptions {
  readonly catalog: Catalog;
  readonly registry: UnitRegistry;
  /** Significant digits of printed results (layout.json, @digits). */
  readonly digits: number;
  readonly title: string;
  readonly subtitle?: string;
  /** Where the summary of checks goes. */
  readonly summary?: 'top' | 'bottom' | 'none';
  /** Resolves a path inside the sheet (images/...) to a URL, e.g. a data: URI. */
  readonly resolveFile?: (path: string) => string | undefined;
  /** The editor shows everything: @hide does not hide there. */
  readonly showHidden?: boolean;
  /** Where values from another layer are shown to come from, e.g. "Příloha A: Zatížení". */
  readonly importSource?: (layerId: string) => string | undefined;
}

export type LineRole = 'given' | 'formula' | 'substitution' | 'result';

export interface EquationLine {
  readonly role: LineRole;
  /** Left-hand side; only on the first line of a block. */
  readonly lhs?: MathNode;
  readonly rhs: MathNode;
  /** Sign between the sides when it is not the defining one: "=" in an equation. */
  readonly op?: string;
}

export interface Message {
  readonly severity: Diagnostic['severity'];
  readonly text: string;
}

export type PrintBlock =
  | { readonly kind: 'heading'; readonly line: number; readonly level: number; readonly text: string }
  | { readonly kind: 'paragraph'; readonly line: number; readonly text: string }
  | {
      readonly kind: 'equation';
      readonly line: number;
      readonly lines: readonly EquationLine[];
      readonly comment?: string;
      /** Values taken from auxiliary calculations, e.g. "q (Příloha A: Zatížení)". */
      readonly imported?: readonly string[];
      /** Appendix with the calculation of the block used on this line. */
      readonly blockCalc?: string;
      readonly messages: readonly Message[];
    }
  | {
      readonly kind: 'selection';
      readonly line: number;
      readonly name: MathNode;
      readonly label: string;
      readonly table: string;
      readonly source?: string;
      /** Condition of find_min/find_max, printed under the selection. */
      readonly condition?: MathNode;
      readonly image?: string;
      readonly comment?: string;
      readonly messages: readonly Message[];
    }
  | {
      readonly kind: 'check';
      readonly line: number;
      readonly label?: string;
      readonly lines: readonly EquationLine[];
      readonly passed: boolean;
      readonly evaluated: boolean;
      readonly utilization?: string;
      readonly source?: string;
      readonly messages: readonly Message[];
    }
  | { readonly kind: 'error'; readonly line: number; readonly source: string; readonly messages: readonly Message[] }
  | { readonly kind: 'page-break' };

export interface SummaryRow {
  readonly label: string;
  readonly utilization?: string;
  readonly passed: boolean;
  readonly evaluated: boolean;
  readonly source?: string;
}

export interface PrintDocument {
  readonly title: string;
  readonly subtitle?: string;
  readonly language: string;
  readonly summary?: { readonly position: 'top' | 'bottom'; readonly rows: readonly SummaryRow[]; readonly allPassed: boolean };
  readonly blocks: readonly PrintBlock[];
}

/** Presentation state changed by @directives; it lasts until changed again. */
interface Mode {
  substitution: boolean;
  resultOnly: boolean;
  hidden: boolean;
  digits: number;
}

export function buildPrintDocument(result: SheetResult, options: PrintOptions): PrintDocument {
  const { catalog } = options;
  const mode: Mode = { substitution: true, resultOnly: false, hidden: false, digits: options.digits };
  const blocks: PrintBlock[] = [];
  const decimalComma = formatNumber(1.5, catalog).includes(',');
  const numberFormat = (digits: number) => (value: number) => formatNumber(value, catalog, { digits });

  // Blocks used in the sheet: their names are words, not math symbols.
  const blockNames = new Set(result.statements.flatMap((r) => (r.value?.type === 'record' ? [r.value.block] : [])));
  const recordNames = new Set([...result.values].flatMap(([name, value]) => (value.type === 'record' ? [name] : [])));
  const dateFormat = (days: number) => formatDate(days, catalog);
  const formulaOptions = (substitute?: FormulaOptions['substitute']): FormulaOptions => ({
    date: dateFormat,
    ...(blockNames.size > 0 ? { textNames: blockNames } : {}),
    ...(recordNames.size > 0 ? { recordNames } : {}),
    literal: numberFormat(15),
    argumentSeparator: decimalComma ? ';' : ',',
    booleans: { true: catalog.terms['true'] ?? 'true', false: catalog.terms['false'] ?? 'false' },
    ...(substitute ? { substitute } : {}),
  });

  // The first level-1 heading is the document title; do not print it twice.
  const titleHeading = result.statements.find((r) => r.statement.kind === 'heading')?.statement;
  const skipTitle = titleHeading?.kind === 'heading' && titleHeading.level === 1 && titleHeading.text === options.title ? titleHeading : undefined;

  for (const r of result.statements) {
    const s = r.statement;
    if (s === skipTitle) continue;
    if (s.kind === 'directive') {
      applyDirective(s.name, s.args, mode, blocks);
      continue;
    }
    if (mode.hidden && !options.showHidden && s.kind !== 'heading') continue;
    const messages = r.diagnostics.map((d) => ({ severity: d.severity, text: formatDiagnostic(d, catalog) }));
    const digits = mode.digits;
    const quantityNode = (q: Quantity) => {
      const shown = toDisplay(q, options.registry);
      return valueNode(shown.value, shown.unit, numberFormat(digits), shown.im, dateFormat);
    };

    switch (s.kind) {
      case 'heading':
        blocks.push({ kind: 'heading', line: s.span.line, level: s.level, text: s.text });
        break;
      case 'text':
        blocks.push({ kind: 'paragraph', line: s.span.line, text: s.text });
        break;
      case 'invalid':
        blocks.push({ kind: 'error', line: s.span.line, source: sourceText(result, s.span), messages });
        break;
      case 'definition':
      case 'display': {
        if (r.value?.type === 'row') {
          blocks.push(selectionBlock(r, result, options, formulaOptions(), messages));
          break;
        }
        const substitute = substitution(result, quantityNode, formulaOptions());
        // A user function shows as "A_kruh(d) = π·d²/4": its parameters have no values to substitute.
        const params = s.kind === 'definition' ? s.params : undefined;
        const lhs = s.kind !== 'definition' ? undefined : params ? functionHead(s.name, params, formulaOptions().argumentSeparator) : nameNode(s.name);
        const lines = equationLines(r, s.expr, lhs, params ? { ...mode, substitution: false } : mode, formulaOptions, substitute, numberFormat(digits));
        if (r.status === 'error' && lines.length <= 1 && s.kind === 'display') {
          blocks.push({ kind: 'error', line: s.span.line, source: sourceText(result, s.span), messages });
          break;
        }
        const imported = importedValues(r, result, options);
        const blockCalc = s.kind === 'definition' && r.value?.type === 'record' ? options.importSource?.(`block:${s.name}`) : undefined;
        blocks.push({
          kind: 'equation',
          line: s.span.line,
          lines,
          ...(s.comment ? { comment: s.comment } : {}),
          ...(imported.length ? { imported } : {}),
          ...(blockCalc ? { blockCalc } : {}),
          messages,
        });
        break;
      }
      case 'solve': {
        // The equations as written, then the values found.
        const lines: EquationLine[] = s.equations.map((eq) => ({ role: 'formula', lhs: formulaNode(eq.left, formulaOptions()), op: '=', rhs: formulaNode(eq.right, formulaOptions()) }));
        // The interval decides which root is found: "0 ≤ x ≤ 10".
        if (s.range && s.unknowns[0]) {
          const range = row(formulaNode(s.range.low, formulaOptions()), mo('≤'), nameNode(s.unknowns[0].name), mo('≤'), formulaNode(s.range.high, formulaOptions()));
          lines.push({ role: 'formula', op: '', rhs: range });
        }
        for (const found of r.solutions ?? []) {
          lines.push({ role: 'result', lhs: nameNode(found.name), op: '=', rhs: valueNode(found.display.value, found.display.unit, numberFormat(digits), found.display.im, dateFormat) });
        }
        blocks.push({ kind: 'equation', line: s.span.line, lines, ...(s.comment ? { comment: s.comment } : {}), messages });
        break;
      }
      case 'check': {
        const check = r.check;
        const lines: EquationLine[] = [{ role: 'formula', rhs: formulaNode(s.expr, formulaOptions()) }];
        if (check?.left && check.right && check.operator) {
          const op = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' }[check.operator as '<' | '<=' | '>' | '>='];
          lines.push({ role: 'substitution', rhs: row(quantityNode(check.left), mo(op), quantityNode(check.right)) });
        }
        blocks.push({
          kind: 'check',
          line: s.span.line,
          ...(s.label !== undefined ? { label: s.label } : {}),
          lines,
          passed: check?.passed ?? false,
          evaluated: check !== undefined,
          ...(check?.utilization !== undefined ? { utilization: percent(check.utilization, catalog) } : {}),
          ...(s.source !== undefined ? { source: s.source } : {}),
          messages,
        });
        break;
      }
      case 'dimension':
      case 'unit': {
        if (r.status === 'error' || r.status === 'blocked') {
          blocks.push({ kind: 'error', line: s.span.line, source: sourceText(result, s.span), messages });
        } else if (s.kind === 'unit' && s.expr) {
          // A unit given by a value is an assumption of the calculation: "1 EUR = 25 CZK".
          const one = row(mn(formulaOptions().literal(1)), mo(' '), mu(s.name));
          blocks.push({ kind: 'equation', line: s.span.line, lines: [{ role: 'given', lhs: one, op: '=', rhs: formulaNode(s.expr, formulaOptions()) }], ...(s.comment ? { comment: s.comment } : {}), messages });
        }
        break;
      }
      default:
        break;
    }
  }

  const position = options.summary ?? 'top';
  const rows: SummaryRow[] = result.checks.map((c) => {
    const statement = result.statements[c.statement]!;
    return {
      label: c.label ?? `${t(catalog, 'checks.check')} ${statement.statement.span.line}`,
      ...(c.utilization !== undefined ? { utilization: percent(c.utilization, catalog) } : {}),
      passed: c.passed,
      evaluated: statement.check !== undefined,
      ...(c.source !== undefined ? { source: c.source } : {}),
    };
  });

  return {
    title: options.title,
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    language: catalog.locale,
    ...(position !== 'none' && rows.length > 0 ? { summary: { position, rows, allPassed: rows.every((r) => r.passed) } } : {}),
    blocks,
  };
}

/** Lines of one definition: given value, or formula / substitution / result. */
function equationLines(
  r: StatementResult,
  expr: Expr,
  lhs: MathNode | undefined,
  mode: Mode,
  formulaOptions: (s?: FormulaOptions['substitute']) => FormulaOptions,
  substitute: FormulaOptions['substitute'],
  format: (value: number) => string,
): EquationLine[] {
  const withLhs = (line: Omit<EquationLine, 'lhs'>, first: boolean): EquationLine => (first && lhs ? { ...line, lhs } : line);
  const result = resultNode(r, format, formulaOptions().booleans, formulaOptions().argumentSeparator, formulaOptions().date);
  const given = expr.kind === 'number' || (expr.kind === 'unary' && expr.operand.kind === 'number') || expr.kind === 'string' || expr.kind === 'boolean';

  // A conversion shows both units: "100 EUR = 2 500 CZK".
  const conversion = !lhs && expr.kind === 'number' && expr.unit !== undefined && r.display !== undefined && r.display.unit !== formatUnit(expr.unit);
  if (conversion && result) {
    return [{ role: 'formula', rhs: formulaNode(expr, formulaOptions()) }, { role: 'result', rhs: result }];
  }
  if (given || mode.resultOnly) {
    return [withLhs({ role: given ? 'given' : 'result', rhs: result ?? formulaNode(expr, formulaOptions()) }, true)];
  }

  const lines: EquationLine[] = [withLhs({ role: 'formula', rhs: formulaNode(expr, formulaOptions()) }, true)];
  // "a = b" or "G_min = G": the substitution would only repeat the result.
  const plainVariable = expr.kind === 'variable' || expr.kind === 'member';
  if (mode.substitution && !plainVariable && hasSubstitutableParts(expr) && r.status === 'ok') {
    lines.push({ role: 'substitution', rhs: formulaNode(expr, formulaOptions(substitute)) });
  }
  if (result) lines.push({ role: 'result', rhs: result });
  return lines;
}

function resultNode(
  r: StatementResult,
  format: (value: number) => string,
  booleans: FormulaOptions['booleans'],
  separator = ',',
  date?: (days: number) => string,
): MathNode | undefined {
  if (r.status !== 'ok' || !r.value) return undefined;
  if (r.display) return valueNode(r.display.value, r.display.unit, format, r.display.im, date);
  if (r.displayList) return seriesNode(r.displayList, format, separator);
  if (r.value.type === 'boolean') return mtext(r.value.value ? booleans.true : booleans.false);
  return otherValueNode(r.value);
}

/** Replaces variables and table columns by their values. */
function substitution(result: SheetResult, quantityNode: (q: Quantity) => MathNode, formulaOptions: FormulaOptions) {
  const wrap = (value: Value | undefined): Substituted | undefined => {
    if (!value) return undefined;
    if (value.type === 'quantity') {
      // A complex value is a sum: it needs parentheses like a negative one.
      return { node: quantityNode(value), negative: value.si < 0 || !!value.im, hasUnit: !!value.hint || Object.keys(value.dim).length > 0 };
    }
    if (value.type === 'text' || value.type === 'boolean') {
      const text = value.type === 'text' ? `"${value.value}"` : value.value ? formulaOptions.booleans.true : formulaOptions.booleans.false;
      return { node: mtext(text), negative: false, hasUnit: false };
    }
    return undefined;
  };
  return (expr: Expr): Substituted | undefined => {
    if (expr.kind === 'variable') return wrap(result.values.get(expr.name));
    if (expr.kind === 'member' && expr.object.kind === 'variable') {
      const object = result.values.get(expr.object.name);
      if (object?.type !== 'row') return undefined;
      const index = object.table.columns.findIndex((c) => c.name === expr.name);
      return wrap(object.cells[index] ?? undefined);
    }
    return undefined;
  };
}

/** Names this statement takes from auxiliary calculation layers, with their source. */
function importedValues(r: StatementResult, result: SheetResult, options: PrintOptions): string[] {
  return r.dependencies.flatMap((name) => {
    const imported = result.imports.get(name);
    if (!imported) return [];
    const source = options.importSource?.(imported.layer) ?? imported.layerName;
    return [`${name} (${source})`];
  });
}

function selectionBlock(r: StatementResult, result: SheetResult, options: PrintOptions, formulaOptions: FormulaOptions, messages: Message[]): PrintBlock {
  const s = r.statement as Extract<StatementResult['statement'], { kind: 'definition' | 'display' }>;
  const value = r.value as Extract<Value, { type: 'row' }>;
  const table = value.table;
  const where = s.expr.kind === 'call' ? s.expr.named.find((n) => n.name === 'where') : undefined;
  const image = rowImage(table, value.cells, options);
  return {
    kind: 'selection',
    line: s.span.line,
    name: s.kind === 'definition' ? nameNode(s.name) : mtext(''),
    label: value.label,
    table: table.name,
    ...(table.source ? { source: table.source.title } : {}),
    ...(where ? { condition: formulaNode(where.value, formulaOptions) } : {}),
    ...(image ? { image } : {}),
    ...(s.comment ? { comment: s.comment } : {}),
    messages,
  };
}

/** Fills the table's image pattern ("images/T/{oznaceni}.svg") with the row's cells. */
function rowImage(table: Extract<Value, { type: 'row' }>['table'], cells: Extract<Value, { type: 'row' }>['cells'], options: PrintOptions): string | undefined {
  if (!table.image || !options.resolveFile) return undefined;
  let missing = false;
  const path = table.image.replace(/\{([^}]+)\}/g, (_, column: string) => {
    const cell = cells[table.columns.findIndex((c) => c.name === column)];
    if (!cell || cell.type !== 'text' || cell.value === '') {
      missing = true;
      return '';
    }
    return cell.value;
  });
  return missing ? undefined : options.resolveFile(path);
}

function applyDirective(name: string, args: string, mode: Mode, blocks: PrintBlock[]): void {
  switch (name) {
    case 'sub':
      mode.substitution = true;
      mode.resultOnly = false;
      break;
    case 'nosub':
      mode.substitution = false;
      break;
    case 'result':
      mode.resultOnly = true;
      break;
    case 'hide':
      mode.hidden = true;
      break;
    case 'show':
      mode.hidden = false;
      break;
    case 'digits': {
      const n = Number(args.trim());
      if (Number.isInteger(n) && n >= 1 && n <= 15) mode.digits = n;
      break;
    }
    case 'page':
      blocks.push({ kind: 'page-break' });
      break;
  }
}

/** "37,5 kN·m"; scientific numbers become mantissa · 10^exponent. */
export function valueNode(value: number, unit: string, format: (value: number) => string, im?: number, date?: (days: number) => string): MathNode {
  // A date: "29. 9. 2026".
  if (unit === 'date') return mtext(date ? date(value) : isoDate(value));
  const numberNode = (x: number): MathNode => {
    const text = format(x);
    const e = /^(.*)E(-?\d+)$/.exec(text);
    return e ? row(mn(e[1]!), mo('·'), sup(mn('10'), mn(e[2]!.replace('-', '−')))) : mn(text.replace('-', '−'));
  };
  if (!im) return unit ? row(numberNode(value), THIN_SPACE, mu(unit)) : numberNode(value);
  // A complex value: "(3 + 4j) Ω"; the imaginary unit is j.
  const imaginary = row(numberNode(Math.abs(im)), mi('j'));
  const complex = value === 0 ? (im < 0 ? row(mo('−'), imaginary) : imaginary) : row(numberNode(value), mo(im < 0 ? '−' : '+'), imaginary);
  if (!unit) return complex;
  return row(value === 0 ? complex : paren(complex), THIN_SPACE, mu(unit));
}

function isoDate(days: number): string {
  return new Date(Math.round(days) * 86_400_000).toISOString().slice(0, 10);
}

/** "[100; 120; 150] CZK"; a long series shows its start and end: "[1; 2; 3; 4; 5; …; 24; 25] (25)". */
function seriesNode(items: readonly { value: number; unit: string }[], format: (value: number) => string, separator: string): MathNode {
  const shown = items.length > SERIES_SHOWN ? [...items.slice(0, 5), undefined, ...items.slice(-2)] : items;
  const parts: MathNode[] = [];
  shown.forEach((item, i) => {
    if (i > 0) parts.push(mo(separator));
    parts.push(item ? valueNode(item.value, '', format) : mo('…'));
  });
  const unit = items[0]?.unit ?? '';
  const count = items.length > SERIES_SHOWN ? [THIN_SPACE, mtext(`(${items.length})`)] : [];
  return row(mo('['), ...parts, mo(']'), ...(unit ? [THIN_SPACE, mu(unit)] : []), ...count);
}

const SERIES_SHOWN = 12;

/** "A_kruh(d)" or "σ(M; W)". */
function functionHead(name: string, params: readonly { readonly name: string }[], separator: string): MathNode {
  const inner = params.flatMap((p, i) => (i > 0 ? [mo(separator), nameNode(p.name)] : [nameNode(p.name)]));
  return row(nameNode(name), paren(row(...inner)));
}

function otherValueNode(value: Value): MathNode | undefined {
  if (value.type === 'text') return mtext(value.value);
  if (value.type === 'row') return mtext(value.label);
  if (value.type === 'record') return mtext(`${value.block.replaceAll('_', ' ')} ${value.version}`);
  return undefined;
}

function percent(ratio: number, catalog: Catalog): string {
  return `${formatNumber(ratio * 100, catalog, { digits: 4 })} %`;
}

function sourceText(result: SheetResult, span: { offset: number; length: number }): string {
  return result.source.slice(span.offset, span.offset + span.length);
}
