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
  DOMAIN_SPELLINGS,
  formatUnit,
  TABLE_TOTAL,
  toDisplay,
  type Diagnostic,
  type Expr,
  type LineFormat,
  type TextFont,
  type TextColor,
  type PlotResult,
  type Quantity,
  type RootsFound,
  type Statement,
  type SheetResult,
  type StatementResult,
  type UnitRegistry,
  type Value,
} from '@kalketa/core';
import { chartLayout, chartSvg, cutChart, parseChartLook, withLook, type ChartLayout, type ChartLook, type ChartSpec } from '@kalketa/chart';
import { formatDate, formatDiagnostic, formatNumber, t, type Catalog, type NumberFormatOptions } from '@kalketa/i18n';
import { formulaNode, hasSubstitutableParts, THIN_SPACE, type FormulaOptions, type Substituted } from './formula.js';
import { mi, mn, mo, mtext, mu, nameNode, paren, row, sup, toText, type MathNode, table } from './math.js';

export interface PrintOptions {
  readonly catalog: Catalog;
  readonly registry: UnitRegistry;
  /** Significant digits of printed results (layout.json, @digits). */
  readonly digits: number;
  readonly title: string;
  readonly subtitle?: string;
  /** Where the summary of checks goes. */
  readonly summary?: 'top' | 'bottom' | 'none';
  /** Which equations get a number at the right: none, those with a formula, every one with a result. */
  readonly equations?: EquationNumbers;
  /** How a check says its result: VYHOVUJE (default), VYHOVÍ, or a sign only. */
  readonly verdict?: VerdictForm;
  /** Resolves a path inside the sheet (images/...) to a URL, e.g. a data: URI. */
  readonly resolveFile?: (path: string) => string | undefined;
  /** The editor shows everything: @hide does not hide there. */
  readonly showHidden?: boolean;
  /** Where values from another layer are shown to come from, e.g. "Příloha A: Zatížení". */
  readonly importSource?: (layerId: string) => string | undefined;
  /** The style of charts of the calculation ("line=2.5 grid=y"); a chart's own style: "…" goes over it. */
  readonly chartStyle?: string;
}

export type LineRole = 'given' | 'formula' | 'substitution' | 'result';

export interface EquationLine {
  readonly role: LineRole;
  /** Left-hand side; only on the first line of a block. */
  readonly lhs?: MathNode;
  readonly rhs: MathNode;
  /** Sign between the sides when it is not the defining one: "=" in an equation. */
  readonly op?: string;
  /** Before the left side: "⇒" where an inequality gives the unknown. */
  readonly lead?: string;
}

export interface Message {
  readonly severity: Diagnostic['severity'];
  readonly text: string;
}

/** Columns and cells of a table as printed. */
export interface TableRows {
  readonly columns: readonly { readonly name: string; readonly unit?: string; readonly numeric: boolean; /** A calculated column: its formula. */ readonly formula?: MathNode }[];
  readonly rows: readonly (readonly string[])[];
}

export type PrintBlock =
  | {
      readonly kind: 'heading';
      readonly line: number;
      readonly level: number;
      readonly text: string;
      readonly style?: TextStyle;
      /** "Pos. 1" before the title of a position. */
      readonly position?: string;
      /** The label of the position as the sheet numbers it (1, 3a): its section of pages. */
      readonly positionLabel?: string;
    }
  | { readonly kind: 'paragraph'; readonly line: number; readonly text: string; readonly cites?: readonly string[]; readonly style?: TextStyle }
  | {
      readonly kind: 'picture';
      readonly line: number;
      readonly path: string;
      /** URL of the picture; absent when the file is not in the sheet. */
      readonly src?: string;
      readonly caption: string;
      /** "Obr. 3" for a picture with a caption. */
      readonly label?: string;
      /** Share of the text width in percent. */
      readonly width?: number;
      /** Beside the lines that follow: the picture on this side, the lines next to it. */
      readonly side?: 'left' | 'right';
      /** First lines of the statements set beside the picture. */
      readonly beside?: readonly number[];
      /** On this side with the following lines flowing around it. */
      readonly wrap?: 'left' | 'right';
      /** At this edge, alone on its lines. */
      readonly align?: 'left' | 'right';
      /** Wrapped, placed freely: from its edge (percent of the text width) and below its line (mm). */
      readonly dx?: number;
      readonly dy?: number;
    }
  | {
      readonly kind: 'equation';
      readonly line: number;
      readonly lines: readonly EquationLine[];
      /** Its number at the right, (5), when the sheet numbers equations. */
      readonly number?: number;
      readonly comment?: string;
      /** Values taken from auxiliary calculations, e.g. "q (Příloha A: Zatížení)". */
      readonly imported?: readonly string[];
      /** Appendix with the calculation of the block used on this line. */
      readonly blockCalc?: string;
      /** Lines [from, to) that stand one under another in every style: a system of equations. */
      readonly stacked?: readonly [number, number];
      /** A derivation whose every step was checked and holds. */
      readonly derived?: boolean;
      /**
       * Steps that hold where a relation above does (relation …), not in general: the relations, each
       * as its number "(3)" when numbered, else its name ({eq=Kruh}), else "" (a relation without a name).
       */
      readonly follows?: readonly string[];
      /** Where the formula comes from (source "EN 1990, 6.10"). */
      readonly source?: string;
      /** The rows of a table it works out (filter), printed under it. */
      readonly table?: TableRows;
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
      /** The result in words, in the form of the sheet: "✓ VYHOVUJE". */
      readonly verdict: string;
      readonly messages: readonly Message[];
    }
  | {
      readonly kind: 'chart';
      readonly line: number;
      /** The chart drawn as SVG. */
      readonly svg: string;
      /** How it is drawn: the style of the calculation with its own over it; and its own alone. */
      readonly look: ChartLook;
      readonly ownLook?: ChartLook;
      /** The cut of a surface: a chart of its own below it, with its caption ("Řez y = 0 m"). */
      readonly cut?: { readonly svg: string; readonly caption: string };
      /** What the SVG shows and where, for reading values under the pointer in the editor. */
      readonly spec: ChartSpec;
      readonly layout: ChartLayout;
      readonly xUnit: string;
      readonly yUnit: string;
      readonly xDates?: boolean;
      readonly caption: string;
      /** "Obr. 4" for a chart with a title. */
      readonly label?: string;
      readonly comment?: string;
      readonly messages: readonly Message[];
      /** Placed as a picture (place: "..."): share of the text width, flow, edge, offsets. */
      readonly width?: number;
      readonly wrap?: 'left' | 'right';
      readonly align?: 'left' | 'right';
      readonly dx?: number;
      readonly dy?: number;
    }
  | { readonly kind: 'error'; readonly line: number; readonly source: string; readonly messages: readonly Message[] }
  /** A table written in the sheet: its header (name and unit) and the cells as shown, numbers to the right. */
  | {
      readonly kind: 'datatable';
      readonly line: number;
      readonly name: string;
      readonly columns: readonly { readonly name: string; readonly unit?: string; readonly numeric: boolean; /** A calculated column: its formula. */ readonly formula?: MathNode }[];
      readonly rows: readonly (readonly string[])[];
      /** Which rows are totals (Σ), set apart. */
      readonly totals?: readonly number[];
      /** Set across ({across}): each column on a row, the values side by side. */
      readonly across?: boolean;
      readonly messages: readonly Message[];
    }
  | { readonly kind: 'page-break' }
  /** @clear: what follows goes below a wrapped picture. */
  | { readonly kind: 'clear' };

export interface SummaryRow {
  /** The line of the check in the sheet: a click on the row opens it. */
  readonly line?: number;
  readonly label: string;
  readonly utilization?: string;
  readonly passed: boolean;
  readonly evaluated: boolean;
  readonly source?: string;
  /** The result in words, in the form of the sheet. */
  readonly verdict: string;
}

export interface PrintDocument {
  /** Lines written beside the line above them ({beside}): cells of its row. */
  readonly beside?: ReadonlySet<number>;
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

/** How a text line looks, {size=12 italic font=serif}: only what the line sets. */
export interface TextStyle {
  readonly size?: number;
  readonly font?: TextFont;
  readonly italic?: boolean;
  readonly bold?: boolean;
  readonly align?: 'left' | 'center' | 'right' | 'justify';
  readonly color?: TextColor;
}

function textStyle(format: LineFormat | undefined): TextStyle | undefined {
  if (!format) return undefined;
  const style: TextStyle = {
    ...(format.size !== undefined ? { size: format.size } : {}),
    ...(format.font ? { font: format.font } : {}),
    ...(format.italic ? { italic: true } : {}),
    ...(format.bold ? { bold: true } : {}),
    ...(format.align ? { align: format.align } : {}),
    ...(format.color ? { color: format.color } : {}),
  };
  return Object.keys(style).length > 0 ? style : undefined;
}

export function buildPrintDocument(result: SheetResult, options: PrintOptions): PrintDocument {
  const { catalog } = options;
  const mode: Mode = { substitution: true, resultOnly: false, hidden: false, digits: options.digits };
  const blocks: PrintBlock[] = [];
  // Lines written beside the one above them: cells of its row.
  const beside = new Set(result.statements.flatMap((r) => (r.statement.format?.beside ? [r.statement.span.line] : [])));
  const decimalComma = formatNumber(1.5, catalog).includes(',');
  const numberFormat = (spec: NumberFormatOptions) => (value: number) => formatNumber(value, catalog, spec);
  // How each name was shown on its own line ({decimals=2}): so it is shown in every substitution below.
  const formats = new Map<string, NumberFormatOptions>();

  // Blocks used in the sheet: their names are words, not math symbols.
  const blockNames = new Set(result.statements.flatMap((r) => (r.value?.type === 'record' ? [r.value.block] : [])));
  const recordNames = new Set([...result.values].flatMap(([name, value]) => (value.type === 'record' ? [name] : [])));
  // Positions read in formulas (Pos1.A) print as A (Pos. 1).
  const positionLabels = new Map([...result.values].flatMap(([name, value]) => (value.type === 'record' && value.position !== undefined ? [[name, t(catalog, 'print.position', { n: value.position })] as const] : [])));
  const dateFormat = (days: number) => formatDate(days, catalog);
  const formulaOptions = (substitute?: FormulaOptions['substitute']): FormulaOptions => ({
    date: dateFormat,
    ...(blockNames.size > 0 ? { textNames: blockNames } : {}),
    ...(recordNames.size > 0 ? { recordNames } : {}),
    ...(positionLabels.size > 0 ? { positionLabels } : {}),
    literal: numberFormat({ digits: 15 }),
    argumentSeparator: decimalComma ? ';' : ',',
    booleans: { true: catalog.terms['true'] ?? 'true', false: catalog.terms['false'] ?? 'false' },
    ...(substitute ? { substitute } : {}),
  });

  // The first level-1 heading is the document title; do not print it twice.
  const titleHeading = result.statements.find((r) => r.statement.kind === 'heading')?.statement;
  const skipTitle = titleHeading?.kind === 'heading' && titleHeading.level === 1 && titleHeading.text === options.title ? titleHeading : undefined;

  let figures = 0;
  for (const r of result.statements) {
    const s = r.statement;
    if (s === skipTitle) continue;
    if (s.kind === 'directive') {
      applyDirective(s.name, s.args, mode, blocks);
      continue;
    }
    if (mode.hidden && !options.showHidden && s.kind !== 'heading') continue;
    const messages = r.diagnostics.map((d) => ({ severity: d.severity, text: formatDiagnostic(d, catalog) }));
    // The line's own format, else the significant digits of the sheet or of @digits above.
    const spec: NumberFormatOptions = s.format?.decimals !== undefined ? { decimals: s.format.decimals } : { digits: s.format?.digits ?? mode.digits };
    if (s.format && (s.kind === 'definition' || s.kind === 'invalid') && s.name) formats.set(s.name, spec);
    // The unknowns of a solve line are shown below as the line shows them.
    if (s.format && s.kind === 'solve') for (const u of s.unknowns) formats.set(u.name, spec);
    const quantityNode = (q: Quantity, name?: string) => {
      const shown = toDisplay(q, options.registry);
      return valueNode(shown.value, shown.unit, numberFormat((name && formats.get(name)) || spec), shown.im, dateFormat);
    };

    switch (s.kind) {
      case 'heading':
        blocks.push({
          kind: 'heading',
          line: s.span.line,
          level: s.level,
          text: s.text,
          ...(textStyle(s.format) ? { style: textStyle(s.format)! } : {}),
          ...(r.position !== undefined ? { position: t(catalog, 'print.position', { n: r.position }), positionLabel: r.position } : {}),
        });
        break;
      case 'text':
        blocks.push({ kind: 'paragraph', line: s.span.line, text: s.text, ...(s.cites ? { cites: s.cites } : {}), ...(textStyle(s.format) ? { style: textStyle(s.format)! } : {}) });
        break;
      case 'picture': {
        const src = options.resolveFile?.(s.path);
        const label = s.caption ? t(catalog, 'print.figure', { n: String(++figures) }) : undefined;
        blocks.push({
          kind: 'picture',
          line: s.span.line,
          path: s.path,
          caption: s.caption,
          ...(src ? { src } : {}),
          ...(label ? { label } : {}),
          ...(s.width !== undefined ? { width: s.width } : {}),
          ...(s.side ? { side: s.side, beside: besideLines(result, r) } : {}),
          ...(s.wrap ? { wrap: s.wrap } : {}),
          ...(s.align ? { align: s.align } : {}),
          ...(s.wrap && s.dx ? { dx: s.dx } : {}),
          ...(s.wrap && s.dy ? { dy: s.dy } : {}),
        });
        break;
      }
      case 'invalid':
        blocks.push({ kind: 'error', line: s.span.line, source: sourceText(result, s.span), messages });
        break;
      case 'table': {
        const table = r.value?.type === 'table' ? r.value.table : undefined;
        const decimalSign = formatNumber(1.5, catalog).includes(',') ? ',' : '.';
        const columns = s.columns.map((c, i) => ({
          name: c.name,
          ...(c.unit ? { unit: c.unit } : {}),
          numeric: table?.columns[i]?.type === 'quantity',
          ...(c.formula ? { formula: formulaNode(c.formula, formulaOptions()) } : {}),
        }));
        // A calculated cell or a total: its value in the unit of the column, as its format says.
        const shown = (value: Value | null | undefined, i: number): string | undefined => {
          if (value?.type !== 'quantity') return undefined;
          const number = value.hint ? (value.si - (value.hint.offset ?? 0)) / value.hint.factor : value.si;
          const decimals = s.columns[i]?.format ? (/[.,](0+)/.exec(s.columns[i]!.format!)?.[1]?.length ?? 0) : undefined;
          return (decimals === undefined ? numberFormat({ digits: 4 })(number) : number.toFixed(decimals).replace('.', decimalSign)).replace('-', '−');
        };
        const totals: number[] = [];
        let data = 0;
        let total = 0;
        const rows = s.rows.map((row, n) => {
          if (row.some((cell) => cell.trim() === TABLE_TOTAL)) {
            totals.push(n);
            const cells = table?.totals?.[total++]?.cells;
            return row.map((cell, i) => (cell.trim() === TABLE_TOTAL ? (shown(cells?.[i], i) ?? '') : cell.trim()));
          }
          const values = row.some((cell) => cell !== '') ? table?.rows[data++] : undefined;
          return row.map((cell, i) => (s.columns[i]?.formula && cell.trim() === '' ? (shown(values?.[i], i) ?? '') : cellText(cell, s.columns[i]?.format, columns[i]?.numeric ?? false, decimalSign)));
        });
        blocks.push({ kind: 'datatable', line: s.span.line, name: s.name, columns, rows, ...(totals.length > 0 ? { totals } : {}), ...(s.format?.across ? { across: true } : {}), messages });
        break;
      }
      case 'definition':
      case 'display': {
        if (r.plot && s.kind === 'display' && s.expr.kind === 'call') {
          const label = r.plot.title ? t(catalog, 'print.figure', { n: String(++figures) }) : undefined;
          blocks.push(chartBlock(r.plot, s.expr, s.span.line, formulaOptions(), (v) => numberFormat({ digits: 4 })(v).replace('-', '−'), dateFormat, label, s.comment, messages, options.chartStyle, (at) => t(options.catalog, 'print.cut', { at })));
          break;
        }
        // A fitted curve: the call, then its equation with the numbers found, and R².
        if (s.kind === 'definition' && r.value?.type === 'function' && r.value.fit) {
          const fitted = r.value;
          const fit = fitted.fit!;
          const values = new Map(fitted.captured);
          // A negative coefficient after the first is subtracted: 2,16 − 0,04143·x, not 2,16 + (−0,04143)·x.
          const subtract = (e: Expr): Expr => {
            if (e.kind !== 'binary' || e.operator !== '+') return e;
            const coefficient = e.right.kind === 'binary' && e.right.operator === '*' ? e.right.left : e.right;
            const q = coefficient.kind === 'variable' ? values.get(coefficient.name) : undefined;
            if (q?.type !== 'quantity' || q.si >= 0 || q.im) return { ...e, left: subtract(e.left) };
            values.set((coefficient as Extract<Expr, { kind: 'variable' }>).name, { ...q, si: -q.si });
            return { ...e, operator: '-', left: subtract(e.left) };
          };
          const body = subtract(fitted.body);
          const numbers: FormulaOptions['substitute'] = (e) => {
            const v = e.kind === 'variable' ? values.get(e.name) : undefined;
            return v?.type === 'quantity' ? { node: quantityNode(v), negative: v.si < 0, hasUnit: !!v.hint || Object.keys(v.dim).length > 0 } : undefined;
          };
          const method = fit.steps ? fitSteps(fit, s.span, spec) : undefined;
          const lines: EquationLine[] = [
            { role: 'formula', lhs: nameNode(s.name), rhs: formulaNode(s.expr, formulaOptions()) },
            ...(method?.lines ?? []),
            { role: 'result', lhs: functionHead(s.name, [{ name: fit.param }], formulaOptions().argumentSeparator), op: '=', rhs: formulaNode(body, formulaOptions(numbers)) },
            { role: 'given', lhs: sup(mi('R'), mn('2')), op: '=', rhs: mn(numberFormat({ digits: 4 })(fit.r2)) },
          ];
          const stacked = method?.system ? ([method.system[0] + 1, method.system[1] + 1] as const) : undefined;
          blocks.push({ kind: 'equation', line: s.span.line, lines, ...(stacked ? { stacked } : {}), ...(s.comment ? { comment: s.comment } : {}), messages });
          break;
        }
        if (r.value?.type === 'row') {
          blocks.push(selectionBlock(r, result, options, formulaOptions(), messages));
          break;
        }
        const substitute = substitution(result, quantityNode, formulaOptions());
        // A user function shows as "A_kruh(d) = π·d²/4": its parameters have no values to substitute.
        const params = s.kind === 'definition' ? s.params : undefined;
        const lhs = s.kind !== 'definition' ? undefined : params ? functionHead(s.name, params, formulaOptions().argumentSeparator) : nameNode(s.name);
        const valueLines = equationLines(r, s.expr, lhs, params ? { ...mode, substitution: false } : mode, formulaOptions, substitute, numberFormat(spec));
        // y := a == b == c: every member, then the substitution and the result of the last one.
        const chain = s.kind === 'definition' ? s.derivation : undefined;
        const lines = chain
          ? [
              // A member equal when rounded is set after ≐, as the book writes it.
              ...chain.map((m, i): EquationLine =>
                i === 0 && lhs
                  ? { role: 'formula', lhs, rhs: formulaNode(m, formulaOptions()) }
                  : { role: 'formula', rhs: formulaNode(m, formulaOptions()), ...(s.kind === 'definition' && s.approx?.includes(i - 1) ? { op: '≐' } : {}) },
              ),
              // A function has no values for its parameters: its derivation ends in its formula.
              ...(isGiven(s.expr) || params ? [] : equationLines(r, s.expr, undefined, mode, formulaOptions, substitute, numberFormat(spec)).filter((l, i) => !(i === 0 && l.role === 'formula'))),
            ]
          : valueLines;
        const derived = !!r.derivation && r.derivation.every((step) => step.ok);
        const follows = followsFrom(r);
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
          ...(derived ? { derived } : {}),
          ...(derived && follows ? { follows } : {}),
          ...(s.kind === 'definition' && s.source ? { source: s.source } : {}),
          // A table worked out (filter(T, where: …)): its rows printed below, so the choice can be checked.
          ...(s.kind === 'definition' && r.value?.type === 'table' ? { table: tableRows(r.value.table, numberFormat({ digits: 4 })) } : {}),
          messages,
        });
        break;
      }
      case 'derive': {
        // A derivation of theory: a = b = c, every step checked.
        const [first, ...rest] = s.members.map((m) => formulaNode(m, formulaOptions()));
        const op = (i: number) => (s.approx?.includes(i) ? '≐' : '=');
        const lines: EquationLine[] = rest.map((rhs, i) => (i === 0 ? { role: 'formula', lhs: first!, op: op(0), rhs } : { role: 'formula', rhs, op: op(i) }));
        const derived = !!r.derivation && r.derivation.every((step) => step.ok);
        const follows = followsFrom(r);
        blocks.push({ kind: 'equation', line: s.span.line, lines, ...(s.comment ? { comment: s.comment } : {}), ...(derived ? { derived } : {}), ...(derived && follows ? { follows } : {}), messages });
        break;
      }
      case 'solve': {
        // The equations as written, then the values found.
        // An inequality keeps its sign; the unknown follows from it: S ≤ π·d²/4 ⇒ d ≥ √(4·S/π).
        const sign = (r: string | undefined) => (r ? ({ '<': '<', '<=': '≤', '>': '>', '>=': '≥' } as Record<string, string>)[r]! : '=');
        // solve y: Kruh — the equation of the relation so named, as written there.
        const named = (eq: (typeof s.equations)[number]) => {
          const own = eq.named === undefined ? undefined : result.sheet.statements.find((o) => o.kind === 'derive' && o.relation && o.format?.eq === eq.named);
          return own?.kind === 'derive' ? { ...eq, left: own.members[0]!, right: own.members[1]! } : eq;
        };
        const lines: EquationLine[] = s.equations.map(named).map((eq) => ({ role: 'formula', lhs: formulaNode(eq.left, formulaOptions()), op: sign(eq.relation), rhs: formulaNode(eq.right, formulaOptions()) }));
        // The interval decides which root is found: "0 ≤ x ≤ 10".
        if (s.range && s.unknowns[0]) {
          // Of a differential equation the interval is its variable's: 0 ≤ x ≤ L.
          const range = row(formulaNode(s.range.low, formulaOptions()), mo('≤'), nameNode(s.ode?.variable ?? s.unknowns[0].name), mo('≤'), formulaNode(s.range.high, formulaOptions()));
          lines.push({ role: 'formula', op: '', rhs: range });
        }
        // y′(x_v) = 0 written out as on paper: 2·a·x_v + b = 0.
        if (r.expanded && !r.roots) lines.push({ role: 'formula', op: '', rhs: row(formulaNode(r.expanded.left, formulaOptions()), mo('='), formulaNode(r.expanded.right, formulaOptions())) });
        // Under its conditions (x ∈ ℝ, x > 0) the solution is worked out as on paper.
        if (r.roots && s.unknowns[0]) {
          lines.push(...rootLines(s, r.roots, s.unknowns[0].name, spec, quantityNode));
          blocks.push({ kind: 'equation', line: s.span.line, lines, ...(s.comment ? { comment: s.comment } : {}), messages });
          break;
        }
        // Its solution is a function: said how it was found, read below as w(x), w′(x).
        if (s.ode && r.ode && s.unknowns[0]) {
          const head = row(nameNode(s.unknowns[0].name), paren(nameNode(s.ode.variable)));
          lines.push({ role: 'result', lhs: head, op: '', rhs: mtext(t(catalog, 'print.odeSolved', { order: String(r.ode.order), steps: String(r.ode.steps) })), lead: '⇒' });
        }
        for (const found of r.solutions ?? []) {
          const value = valueNode(found.display.value, found.display.unit, numberFormat(spec), found.display.im, dateFormat);
          // A formula of numbers only (x² + 2·x = 8) says nothing the result does not.
          if (!found.formula || !readsNames(found.formula)) {
            lines.push({ role: 'result', lhs: nameNode(found.name), op: sign(found.relation), rhs: value, ...(found.relation ? { lead: '⇒' } : {}) });
            continue;
          }
          // Expressed by a formula: L = √(8·M_Ed/q) = √(8·37,5 kN·m / 12 kN/m) = 5 m, checkable by hand.
          const formula = formulaNode(found.formula, formulaOptions());
          lines.push({ role: 'formula', lhs: nameNode(found.name), op: sign(found.relation), rhs: formula, ...(found.relation ? { lead: '⇒' } : {}) });
          const substituted = formulaNode(found.formula, formulaOptions(substitution(result, quantityNode, formulaOptions())));
          if (mode.substitution && toText(substituted) !== toText(formula)) lines.push({ role: 'substitution', rhs: substituted });
          lines.push({ role: 'result', rhs: value });
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
          verdict: verdictText(check !== undefined, check?.passed ?? false, catalog, options.verdict),
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

  /**
   * A solution under conditions, as on paper: the conditions, of a quadratic its
   * discriminant and the formula of the roots with the numbers put in, then each
   * root, kept or set aside (and why), and what the unknown is.
   */
  /**
   * The least squares method written out (fit(…, steps: true)), as on paper: the sums over the points, then
   * of a straight line b₁ = (n·Σx·y − Σx·Σy)/(n·Σx² − (Σx)²) and b₀ = (Σy − b₁·Σx)/n with the numbers put in,
   * of a polynomial its normal equations n·b₀ + Σx·b₁ + Σx²·b₂ = Σy, … with their numbers and the coefficients found.
   */
  function fitSteps(fit: NonNullable<Extract<Value, { type: 'function' }>['fit']>, at: Statement['span'], spec: NumberFormatOptions): { lines: EquationLine[]; system?: [number, number] } {
    const steps = fit.steps!;
    const degree = fit.coefficients.length - 1;
    const o = formulaOptions();
    const v = (name: string): Expr => ({ kind: 'variable', name, span: at });
    const bin = (operator: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({ kind: 'binary', operator, left, right, span: at });
    const num = (value: number): Expr => ({ kind: 'number', value, span: at });
    const sum = (e: Expr): Expr => ({ kind: 'call', name: 'sum', args: [e], named: [], span: at });
    const [x, y, n] = [v(steps.x), v(steps.y), v('n')];
    // Σx^k (k = 0 is n) and Σx^k·y, as written: Σx, Σx², Σy, Σx·y.
    const xPower = (k: number): Expr => (k === 1 ? x : bin('^', x, num(k)));
    const powers = steps.powers.map((_, k) => (k === 0 ? n : sum(xPower(k))));
    const withY = steps.withY.map((_, k) => sum(k === 0 ? y : bin('*', xPower(k), y)));
    const b = fit.coefficients.map((_, k) => v(`b_${k}`));
    const sums = new Map<Expr, Quantity>([...powers.map((e, k) => [e, steps.powers[k]!] as const), ...withY.map((e, k) => [e, steps.withY[k]!] as const)]);
    const value = (q: Quantity) => {
      const d = toDisplay(q, options.registry);
      return valueNode(d.value, d.unit, numberFormat(spec), d.im, dateFormat);
    };
    // Put in, the sums are numbers: in the line of numbers each stands as a name of its own, replaced by its value.
    const filled = (e: Expr, also: ReadonlyMap<string, Quantity> = new Map()) => {
      const named = new Map(also);
      const put = (part: Expr): Expr => {
        const q = sums.get(part);
        if (q) {
          const name = `\u0000s${named.size}`;
          named.set(name, q);
          return v(name);
        }
        return part.kind === 'binary' ? { ...part, left: put(part.left), right: put(part.right) } : part;
      };
      return formulaNode(
        put(e),
        formulaOptions((part) => {
          const q = part.kind === 'variable' ? named.get(part.name) : undefined;
          return q ? { node: value(q), negative: q.si < 0, hasUnit: !!q.hint || Object.keys(q.dim).length > 0 } : undefined;
        }),
      );
    };
    const said = (lhs: Expr, q: Quantity): EquationLine => ({ role: 'result', lhs: formulaNode(lhs, o), op: '=', rhs: value(q) });
    const given: EquationLine[] = [
      { role: 'formula', lhs: nameNode('n'), op: '=', rhs: mn(String(fit.points)) },
      ...powers.slice(1).map((e, k) => said(e, steps.powers[k + 1]!)),
      ...withY.map((e, k) => said(e, steps.withY[k]!)),
    ];
    if (degree === 1) {
      const [sx, sxx, sy, sxy] = [powers[1]!, powers[2]!, withY[0]!, withY[1]!];
      const slope = bin('/', bin('-', bin('*', n, sxy), bin('*', sx, sy)), bin('-', bin('*', n, sxx), bin('^', sx, num(2))));
      const intercept = bin('/', bin('-', sy, bin('*', b[1]!, sx)), n);
      const [c0, c1] = [fit.coefficients[0]!.value, fit.coefficients[1]!.value];
      const lines: EquationLine[] = [
        ...given,
        { role: 'formula', lhs: nameNode('b_1'), op: '=', rhs: formulaNode(slope, o) },
        ...(mode.substitution ? [{ role: 'substitution' as const, rhs: filled(slope) }] : []),
        { role: 'result', rhs: value(c1) },
        { role: 'formula', lhs: nameNode('b_0'), op: '=', rhs: formulaNode(intercept, o) },
        ...(mode.substitution ? [{ role: 'substitution' as const, rhs: filled(intercept, new Map([['b_1', c1]])) }] : []),
        { role: 'result', rhs: value(c0) },
      ];
      return { lines };
    }
    // The normal equations, one for each power of x up to the degree: Σⱼ Σx^(i+j)·bⱼ = Σx^i·y.
    const equations = withY.map((right, i) => ({ left: b.slice(1).reduce<Expr>((acc, bj, j) => bin('+', acc, bin('*', powers[i + j + 1]!, bj)), bin('*', powers[i]!, b[0]!)), right, i }));
    const system: EquationLine[] = [
      ...equations.map(({ left, right }): EquationLine => ({ role: 'formula', lhs: formulaNode(left, o), op: '=', rhs: formulaNode(right, o) })),
      ...(mode.substitution ? equations.map(({ left, i }): EquationLine => ({ role: 'substitution', lhs: filled(left), op: '=', rhs: value(steps.withY[i]!) })) : []),
    ];
    return {
      lines: [...given, ...system, ...fit.coefficients.map((c, k) => said(b[k]!, c.value)).reverse()],
      system: [given.length, given.length + system.length],
    };
  }

  function rootLines(s: Extract<Statement, { kind: 'solve' }>, found: RootsFound, name: string, spec: NumberFormatOptions, quantityNode: (q: Quantity, name?: string) => MathNode): EquationLine[] {
    const out: EquationLine[] = [];
    const o = formulaOptions();
    const conditions = s.conditions ?? [];
    const comma = () => mtext(', ');
    // x ∈ ℝ, x > 0
    const said: MathNode[] = [];
    const inDomain = () => row(nameNode(name), mo('∈'), mi(DOMAIN_SPELLINGS[s.domain!][0]!, true));
    if (s.domain) said.push(inDomain());
    conditions.forEach((c) => said.push(...(said.length > 0 ? [comma()] : []), formulaNode(c, o)));
    if (said.length > 0) out.push({ role: 'formula', op: '', rhs: row(...said) });
    const value = (q: Quantity) => {
      const d = toDisplay(q, options.registry);
      return valueNode(d.value, d.unit, numberFormat(spec), d.im, dateFormat);
    };
    const substituted = (expr: Expr, extra?: (e: Expr) => Substituted | undefined) => {
      const sub = substitution(result, quantityNode, o);
      return formulaNode(expr, formulaOptions((e) => extra?.(e) ?? sub(e)));
    };
    // y(x) = 0 written out: a·x² + b·x + c = 0, then with the numbers: 5·x² + 4·x − 10 = 0 (the unknown stays).
    if (found.expanded) {
      const keepUnknown = (e: Expr): Substituted | undefined => (e.kind === 'variable' && e.name === name ? { node: nameNode(name), negative: false, hasUnit: false } : undefined);
      const general = row(formulaNode(found.expanded.left, o), mo('='), formulaNode(found.expanded.right, o));
      out.push({ role: 'formula', op: '', rhs: general });
      // Plain numbers put in as numbers, so the signs fold as on paper: + (−10) is − 10.
      const numbersOf = (e: Expr): Expr => {
        switch (e.kind) {
          case 'variable': {
            const v = e.name === name ? undefined : result.values.get(e.name);
            return v?.type === 'quantity' && !v.im && !v.hint && Object.keys(v.dim).length === 0 ? { kind: 'number', value: v.si, span: e.span } : e;
          }
          case 'unary':
            return { ...e, operand: numbersOf(e.operand) };
          case 'binary': {
            const l = numbersOf(e.left);
            const r = numbersOf(e.right);
            if ((e.operator === '+' || e.operator === '-') && r.kind === 'number' && r.value < 0) return { ...e, operator: e.operator === '+' ? '-' : '+', left: l, right: { ...r, value: -r.value } };
            return { ...e, left: l, right: r };
          }
          case 'call':
            return { ...e, args: e.args.map(numbersOf) };
          default:
            return e;
        }
      };
      const numbers = row(substituted(numbersOf(found.expanded.left), keepUnknown), mo('='), substituted(numbersOf(found.expanded.right), keepUnknown));
      if (mode.substitution && toText(numbers) !== toText(general)) out.push({ role: 'formula', op: '', rhs: numbers });
    }
    const q = found.quadratic;
    // x² + y² = r² for y: y₁,₂ = ±√(r² − x²) = ±√(5² − 3²), no discriminant and no vertex of a parabola.
    if (q?.pure) {
      const complex = found.roots.length > 0 && found.roots.every((r) => r.rejected === 'complex');
      if (complex || found.roots.length === 0) {
        out.push({ role: 'result', lead: '⇒', op: '', rhs: mtext(t(catalog, 'print.noRealRootSquare')) });
        return out;
      }
      const both: Expr = { kind: 'unary', operator: '±', operand: q.pure, span: s.span };
      const pair = found.roots.length === 1 ? nameNode(name) : nameNode(`${name}_1_2`);
      out.push({ role: 'formula', lhs: pair, op: '=', rhs: formulaNode(both, o) });
      const filled = substituted(both);
      if (mode.substitution && toText(filled) !== toText(formulaNode(both, o))) out.push({ role: 'substitution', rhs: filled });
    } else if (q) {
      const at = s.span;
      const bin = (operator: '-' | '*' | '/' | '^' | '±', left: Expr, right: Expr): Expr => ({ kind: 'binary', operator, left, right, span: at });
      const num = (v: number): Expr => ({ kind: 'number', value: v, span: at });
      // D = b² − 4·a·c = 4² − 4·5·10 = −184
      const dExpr = bin('-', bin('^', q.b, num(2)), bin('*', bin('*', num(4), q.a), q.c));
      out.push({ role: 'formula', lhs: mi('D'), op: '=', rhs: formulaNode(dExpr, o) });
      const dIn = substituted(dExpr);
      if (mode.substitution && toText(dIn) !== toText(formulaNode(dExpr, o))) out.push({ role: 'substitution', rhs: dIn });
      out.push({ role: 'result', rhs: value(q.discriminant) });
      const complex = found.roots.length > 0 && found.roots.every((r) => r.rejected === 'complex');
      if (complex || (found.roots.length === 0 && !q.discriminant.im)) {
        out.push({ role: 'result', lead: '⇒', op: '', rhs: mtext(t(catalog, 'print.noRealRoot')) });
        return out;
      }
      // x₁,₂ = (−b ± √D)/(2·a) = (−4 ± √216)/(2·5)
      const d: Expr = { kind: 'variable', name: 'D', span: at };
      const minusB: Expr = { kind: 'unary', operator: '-', operand: q.b, span: at };
      const twoA = bin('*', num(2), q.a);
      const formula = bin('/', bin('±', minusB, { kind: 'call', name: 'sqrt', args: [d], named: [], span: at }), twoA);
      const pair = found.roots.length === 1 ? nameNode(name) : nameNode(`${name}_1_2`);
      out.push({ role: 'formula', lhs: pair, op: '=', rhs: formulaNode(formula, o) });
      const dValue: Substituted = { node: value(q.discriminant), negative: q.discriminant.si < 0, hasUnit: false };
      const filled = substituted(formula, (e) => (e === d ? dValue : undefined));
      if (mode.substitution) out.push({ role: 'substitution', rhs: filled });
    }
    // x₁ = 1,07   x₂ = −1,87 — nevyhovuje podmínce x > 0
    const many = found.roots.length > 1;
    // "nevyhovuje" before what is not met, spaced as the condition after it.
    const rejectedWord = () => mtext(`  ${t(catalog, 'print.rootRejected')} `);
    found.roots.forEach((root, i) => {
      const lhs = many ? nameNode(`${name}_${i + 1}`) : nameNode(name);
      const why =
        root.rejected === undefined
          ? []
          : root.rejected === 'domain'
            ? [rejectedWord(), inDomain()]
            : root.rejected === 'complex'
            ? [mtext(`  ${t(catalog, 'print.rootComplex')}`)]
            : [mtext(`  ${t(catalog, 'print.rootRejected')} `), root.rejected < conditions.length ? formulaNode(conditions[root.rejected]!, o) : row(formulaNode(s.range!.low, o), mo('≤'), nameNode(name), mo('≤'), formulaNode(s.range!.high, o))];
      out.push({ role: 'result', lhs, op: '=', rhs: row(value(root.value), ...why) });
    });
    // What the unknown is: the root kept, the roots kept, or none.
    const kept = found.roots.filter((r) => r.rejected === undefined);
    if (kept.length < found.roots.length || found.roots.length === 0) {
      if (kept.length === 0) out.push({ role: 'result', lead: '⇒', op: '', rhs: mtext(t(catalog, 'print.noRootKept')) });
      else out.push({ role: 'result', lead: '⇒', lhs: nameNode(name), op: '=', rhs: kept.length === 1 ? value(kept[0]!.value) : row(mo('['), ...kept.flatMap((r, i) => [...(i > 0 ? [mo(o.argumentSeparator)] : []), value(r.value)]), mo(']')) });
    }
    // The vertex of the parabola: V = [−b/(2·a); −D/(4·a)] = [−2/(2·(−2)); −84/(4·(−2))] = [0,5; 10,5].
    if (q && !q.pure) {
      const at = s.span;
      const num = (v: number): Expr => ({ kind: 'number', value: v, span: at });
      const d: Expr = { kind: 'variable', name: 'D', span: at };
      const minusB: Expr = { kind: 'unary', operator: '-', operand: q.b, span: at };
      const vx: Expr = { kind: 'binary', operator: '/', left: minusB, right: { kind: 'binary', operator: '*', left: num(2), right: q.a, span: at }, span: at };
      const vy: Expr = { kind: 'binary', operator: '/', left: { kind: 'unary', operator: '-', operand: d, span: at }, right: { kind: 'binary', operator: '*', left: num(4), right: q.a, span: at }, span: at };
      const pair = (x: MathNode, y: MathNode) => row(mo('['), x, mo(o.argumentSeparator), y, mo(']'));
      const dValue: Substituted = { node: value(q.discriminant), negative: q.discriminant.si < 0, hasUnit: false };
      out.push({ role: 'formula', lhs: mi('V'), op: '=', rhs: pair(formulaNode(vx, o), formulaNode(vy, o)) });
      if (mode.substitution) out.push({ role: 'substitution', rhs: pair(substituted(vx), substituted(vy, (e) => (e.kind === 'variable' && e.name === 'D' ? dValue : undefined))) });
      out.push({ role: 'result', rhs: pair(value(q.vertex.x), value(q.vertex.y)) });
    }
    return out;
  }

  const position = options.summary ?? 'top';
  const rows: SummaryRow[] = result.checks.map((c) => {
    const statement = result.statements[c.statement]!;
    return {
      line: statement.statement.span.line,
      label: c.label ?? `${t(catalog, 'checks.check')} ${statement.statement.span.line}`,
      ...(c.utilization !== undefined ? { utilization: percent(c.utilization, catalog) } : {}),
      passed: c.passed,
      evaluated: statement.check !== undefined,
      verdict: verdictText(statement.check !== undefined, c.passed, catalog, options.verdict),
      ...(c.source !== undefined ? { source: c.source } : {}),
    };
  });

  return {
    title: options.title,
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    language: catalog.locale,
    ...(position !== 'none' && rows.length > 0 ? { summary: { position, rows, allPassed: rows.every((r) => r.passed) } } : {}),
    blocks: numberEquations(blocks, result, options.equations ?? 'none'),
    ...(beside.size > 0 ? { beside } : {}),
  };
}

export type EquationNumbers = 'none' | 'formulas' | 'results';

/** present: VYHOVUJE / NEVYHOVUJE; future: VYHOVÍ / NEVYHOVÍ (as ČVUT writes it); sign: ✓ / ✗ only. */
export type VerdictForm = 'present' | 'future' | 'sign';

/** The result of a check in the form the sheet chose; not evaluated stays said in words. */
export function verdictText(evaluated: boolean, passed: boolean, catalog: Catalog, form: VerdictForm = 'present'): string {
  if (!evaluated) return `? ${t(catalog, 'checks.notEvaluated')}`;
  const sign = passed ? '✓' : '✗';
  if (form === 'sign') return sign;
  const key = form === 'future' ? (passed ? 'checks.passedFuture' : 'checks.failedFuture') : passed ? 'checks.passed' : 'checks.failed';
  return `${sign} ${t(catalog, key)}`;
}

/**
 * Equation numbers (1), (2) … at the right, in order down the sheet, as books number them:
 * by the setting of the sheet, a line's own {eq} or {noeq} deciding for it. A line named
 * {eq=hooke} is referred to from text as (#hooke), which becomes its number wherever it stands.
 */
function numberEquations(blocks: PrintBlock[], result: SheetResult, mode: EquationNumbers): PrintBlock[] {
  const formats = new Map(result.statements.map((r) => [r.statement.span.line, r.statement.format] as const));
  const names = new Map<string, number>();
  let next = 0;
  const numbered = blocks.map((block): PrintBlock => {
    if (block.kind !== 'equation') return block;
    const format = formats.get(block.line);
    const byMode = mode === 'results' ? block.lines.some((l) => l.role === 'result' || l.role === 'formula') : mode === 'formulas' && block.lines.some((l) => l.role === 'formula');
    if (format?.noeq || !(format?.eq || byMode)) return block;
    const number = ++next;
    if (typeof format?.eq === 'string') names.set(format.eq, number);
    return { ...block, number };
  });
  // A derivation following from a numbered relation names it by its number: (3).
  const byLine = new Map(numbered.flatMap((block) => (block.kind === 'equation' && block.number !== undefined ? [[block.line, block.number] as const] : [])));
  const relationNumber = (name: string) => {
    if (names.has(name)) return `(${names.get(name)})`;
    const line = /^@(\d+)$/.exec(name)?.[1];
    if (line === undefined) return name;
    const n = byLine.get(Number(line));
    return n === undefined ? '' : `(${n})`;
  };
  const withRelations = numbered.map((block) => (block.kind === 'equation' && block.follows ? { ...block, follows: block.follows.map(relationNumber) } : block));
  if (names.size === 0) return withRelations;
  // (#hooke) in text and headings: the number of the equation so named; an unknown name stays visible.
  const refer = (text: string) => text.replace(/\(#([\p{L}_][\p{L}\p{N}_]*)\)/gu, (whole, name: string) => (names.has(name) ? `(${names.get(name)})` : whole));
  return withRelations.map((block) => (block.kind === 'paragraph' || block.kind === 'heading' ? { ...block, text: refer(block.text) } : block));
}

/** The relations the steps of a derivation follow from, by name ("" for one without), each once; none when they hold in general. */
function followsFrom(r: StatementResult): string[] | undefined {
  // A relation without a name stands by its line ("@12"): numbered, it is named by its number.
  const names = [...new Set((r.derivation ?? []).flatMap((step) => (step.relation ? [step.relation.label ?? `@${step.relation.line}`] : [])))];
  return names.length > 0 ? names : undefined;
}

/**
 * The statements set beside a side picture: those that follow it without a
 * blank line between, up to a heading, another picture or a page break.
 */
function besideLines(result: SheetResult, picture: StatementResult): number[] {
  const endLine = (r: StatementResult) => {
    const { offset, length, line } = r.statement.span;
    return line + (result.source.slice(offset, offset + length).match(/\n/g)?.length ?? 0);
  };
  const lines: number[] = [];
  let previous = picture;
  for (const r of result.statements.slice(result.statements.indexOf(picture) + 1)) {
    const s = r.statement;
    if (s.span.line !== endLine(previous) + 1) break;
    if (s.kind === 'heading' || s.kind === 'picture' || (s.kind === 'directive' && s.name === 'page')) break;
    lines.push(s.span.line);
    previous = r;
  }
  return lines;
}

/**
 * A cell as shown: a number with the decimal sign of the language and as many
 * decimals as its column format says ("0.0" one, "0" none); text as written.
 */
/** A table of values (the result of filter) as the print shows a table of the sheet. */
function tableRows(table: Extract<Value, { type: 'table' }>['table'], format: (value: number) => string): TableRows {
  const columns = table.columns.map((c) => ({ name: c.name, ...(c.unit ? { unit: c.unit } : {}), numeric: c.type === 'quantity' }));
  const text = (cell: Value | null | undefined): string => {
    if (!cell) return '';
    if (cell.type === 'quantity') return format(cell.hint ? (cell.si - (cell.hint.offset ?? 0)) / cell.hint.factor : cell.si).replace('-', '−');
    if (cell.type === 'text') return cell.value;
    return '';
  };
  return { columns, rows: table.rows.map((row) => row.map(text)) };
}

function cellText(cell: string, format: string | undefined, numeric: boolean, decimalSign: string): string {
  const text = cell.trim();
  if (!numeric || text === '') return text;
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) return text;
  const decimals = format ? (/[.,](0+)/.exec(format)?.[1]?.length ?? 0) : undefined;
  const shown = decimals === undefined ? text.replace(',', '.') : value.toFixed(decimals);
  return shown.replace('.', decimalSign).replace('-', '−');
}

/** Whether an expression reads names (values of the sheet), not numbers alone. */
function readsNames(expr: Expr): boolean {
  switch (expr.kind) {
    case 'variable':
    case 'member':
      return true;
    case 'unary':
      return readsNames(expr.operand);
    case 'binary':
      return readsNames(expr.left) || readsNames(expr.right);
    case 'call':
      return expr.args.some(readsNames) || expr.named.some((n) => readsNames(n.value));
    default:
      return false;
  }
}

/** Numbers written out: 5, -2, 12 kN/m, and series and matrices of them, with a unit after the brackets. */
function isGiven(expr: Expr): boolean {
  switch (expr.kind) {
    case 'number':
      return true;
    case 'unary':
      return expr.operator !== 'not' && isGiven(expr.operand);
    case 'vector':
      return expr.items.length > 0 && expr.items.every(isGiven);
    case 'matrix':
      return expr.rows.every((r) => r.every(isGiven));
    case 'binary':
      return expr.operator === '*' && expr.right.kind === 'unit' && (expr.left.kind === 'vector' || expr.left.kind === 'matrix') && isGiven(expr.left);
    default:
      return false;
  }
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
  // A value written out (5 m, [4, -2 | -2, 4] kN/m) is shown once, not as a formula and again as its result.
  const given = isGiven(expr) || expr.kind === 'string' || expr.kind === 'boolean' || expr.kind === 'date';

  // A conversion shows both units: "100 EUR = 2 500 CZK".
  const conversion = !lhs && expr.kind === 'number' && expr.unit !== undefined && r.display !== undefined && r.display.unit !== formatUnit(expr.unit);
  if (conversion && result) {
    return [{ role: 'formula', rhs: formulaNode(expr, formulaOptions()) }, { role: 'result', rhs: result }];
  }
  if (given || mode.resultOnly) {
    return [withLhs({ role: given ? 'given' : 'result', rhs: result ?? formulaNode(expr, formulaOptions()) }, true)];
  }

  // "I_mp := panel.I_mp": the formula would only repeat the name; the result says it all.
  const formula = formulaNode(expr, formulaOptions());
  if (lhs && result && toText(formula) === toText(lhs)) return [withLhs({ role: 'result', rhs: result }, true)];
  const lines: EquationLine[] = [withLhs({ role: 'formula', rhs: formula }, true)];
  // "a = b" or "G_min = G": the substitution would only repeat the result.
  const plainVariable = expr.kind === 'variable' || expr.kind === 'member';
  if (mode.substitution && !plainVariable && hasSubstitutableParts(expr) && r.status === 'ok') {
    // Nothing substituted (e.g. a series stays a name): no second, identical line.
    const substituted = formulaNode(expr, formulaOptions(substitute));
    if (toText(substituted) !== toText(lines[0]!.rhs)) lines.push({ role: 'substitution', rhs: substituted });
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
  if (r.displayList) return seriesNode(r.displayList, format, separator, date);
  if (r.displayMatrix) return matrixNode(r.displayMatrix, format);
  if (r.value.type === 'boolean') return mtext(r.value.value ? booleans.true : booleans.false);
  return otherValueNode(r.value);
}

/** Replaces variables and table columns by their values. */
function substitution(result: SheetResult, quantityNode: (q: Quantity, name?: string) => MathNode, formulaOptions: FormulaOptions) {
  const wrap = (value: Value | undefined, name?: string): Substituted | undefined => {
    if (!value) return undefined;
    if (value.type === 'quantity') {
      // A complex value is a sum: it needs parentheses like a negative one.
      return { node: quantityNode(value, name), negative: value.si < 0 || !!value.im, hasUnit: !!value.hint || Object.keys(value.dim).length > 0 };
    }
    if (value.type === 'text' || value.type === 'boolean') {
      const text = value.type === 'text' ? `"${value.value}"` : value.value ? formulaOptions.booleans.true : formulaOptions.booleans.false;
      return { node: mtext(text), negative: false, hasUnit: false };
    }
    return undefined;
  };
  return (expr: Expr): Substituted | undefined => {
    if (expr.kind === 'variable') return wrap(result.values.get(expr.name), expr.name);
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
    case 'clear':
      blocks.push({ kind: 'clear' });
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
    return e ? row(mn(e[1]!.replace('-', '−')), mo('·'), sup(mn('10'), mn(e[2]!.replace('-', '−')))) : mn(text.replace('-', '−'));
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
function seriesNode(items: readonly { value: number; unit: string; im?: number }[], format: (value: number) => string, separator: string, date?: (days: number) => string): MathNode {
  const shown = items.length > SERIES_SHOWN ? [...items.slice(0, 5), undefined, ...items.slice(-2)] : items;
  const parts: MathNode[] = [];
  // One unit after the brackets; items of different units (a solution x = [u, φ]) each with their own.
  const unit = items[0]?.unit ?? '';
  // Dates are written out each ("1. 1. 2026"); they have no unit after the brackets.
  const shared = unit !== 'date' && items.every((item) => item.unit === unit);
  shown.forEach((item, i) => {
    if (i > 0) parts.push(mo(separator));
    // Complex items (roots of a polynomial) keep their imaginary part.
    parts.push(item ? valueNode(item.value, shared ? '' : item.unit, format, item.im, date) : mo('…'));
  });
  const count = items.length > SERIES_SHOWN ? [THIN_SPACE, mtext(`(${items.length})`)] : [];
  return row(mo('['), ...parts, mo(']'), ...(shared && unit ? [THIN_SPACE, mu(unit)] : []), ...count);
}

const SERIES_SHOWN = 12;

/** A matrix in brackets; one unit for all items stands after it, else each item has its own. */
function matrixNode(m: { rows: number; cols: number; items: readonly { value: number; unit: string; im?: number }[] }, format: (value: number) => string): MathNode {
  const unit = m.items[0]?.unit ?? '';
  const shared = m.items.every((item) => item.unit === unit);
  const cells = Array.from({ length: m.rows }, (_, i) =>
    Array.from({ length: m.cols }, (_, j) => {
      const item = m.items[i * m.cols + j]!;
      return valueNode(item.value, shared ? '' : item.unit, format, item.im);
    }),
  );
  return row(mo('['), table(cells), mo(']'), ...(shared && unit ? [THIN_SPACE, mu(unit)] : []));
}

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

/** Size of a chart in the SVG user space: about the text width of A4 at 96 dpi, so text in it reads like 8 pt. */
export const CHART_SIZE = { width: 640, height: 300 } as const;
/** A surface in 3D: a box seen from above wants more height than a curve. */
const SURFACE_SIZE = { width: 640, height: 420 } as const;

/** The size of a chart whose axes share one scale (a circle round): its plot area as high as its ranges ask. */
function equalScaleSize(spec: ChartSpec): { width: number; height: number } {
  const plain = chartLayout(spec, CHART_SIZE);
  const xSpan = plain.x.max - plain.x.min;
  const ySpan = plain.y.max - plain.y.min;
  if (!(xSpan > 0) || !(ySpan > 0)) return CHART_SIZE;
  const frame = CHART_SIZE.height - (plain.plot.bottom - plain.plot.top);
  const height = Math.round((plain.plot.right - plain.plot.left) * (ySpan / xSpan) + frame);
  return { width: CHART_SIZE.width, height: Math.max(160, Math.min(900, height)) };
}

/** A chart line: the curves named after their expressions, the axes after the variable and the units. */
function chartBlock(
  plot: PlotResult,
  call: Extract<Expr, { kind: 'call' }>,
  line: number,
  formula: FormulaOptions,
  format: (value: number) => string,
  date: (days: number) => string,
  label: string | undefined,
  comment: string | undefined,
  messages: readonly Message[],
  chartStyle: string | undefined,
  cutTitle: (at: string) => string,
): PrintBlock {
  const ownLook = plot.style ? parseChartLook(plot.style) : undefined;
  const look = withLook(chartStyle ? parseChartLook(chartStyle) : undefined, ownLook);
  const names = call.args.map((arg) => superscripts(toText(formulaNode(arg, formula)).replace(/\s+/g, ' ')));
  const unit = (u: string) => (u ? ` [${u}]` : '');
  const spec: ChartSpec = {
    kind: plot.kind,
    series: plot.series.map((s, i) => ({
      label: names[i] ?? '',
      xs: s.xs,
      ys: s.ys,
      ...(s.mark ? { mark: s.mark } : {}),
      ...(s.roots ? { roots: s.roots } : {}),
      ...(s.axes ? { axes: s.axes } : {}),
      ...(s.extremes ? { extremes: s.extremes } : {}),
      ...(s.inflections ? { inflections: s.inflections } : {}),
      ...(s.roots || s.axes ? { rootName: plot.variable || 'x', ...(plot.xUnit ? { rootUnit: plot.xUnit } : {}) } : {}),
      ...(s.implicit ? { implicit: true } : {}),
    })),
    xTitle: plot.xDates ? plot.variable : `${plot.variable}${unit(plot.xUnit)}`.trim(),
    // One curve names the axis; more curves are named in the legend. Over x and y (an implicit curve) y names it.
    yTitle: (plot.yVariable ? `${plot.yVariable}${unit(plot.yUnit)}` : names.length === 1 ? `${names[0]}${unit(plot.yUnit)}` : unit(plot.yUnit)).trim(),
    ...(plot.yRange ? { yRange: plot.yRange } : {}),
    ...(plot.xRange ? { xRange: plot.xRange } : {}),
    ...(plot.area ? { area: plot.area } : {}),
    ...(plot.tangent ? { tangent: plot.tangent } : {}),
    ...(plot.labelOffsets ? { labelOffsets: plot.labelOffsets } : {}),
    ...(plot.points ? { points: plot.points } : {}),
    // A surface: its grid, the title of the colour bar from the expression and the unit of z.
    ...(plot.surface
      ? {
          surface: {
            xs: plot.surface.xs,
            ys: plot.surface.ys,
            z: plot.surface.z,
            zTitle: `${names[0] ?? ''}${unit(plot.surface.zUnit)}`.trim(),
            ...(plot.surface.levels ? { levels: plot.surface.levels } : {}),
            ...(plot.surface.levelCount !== undefined ? { levelCount: plot.surface.levelCount } : {}),
            ...(plot.surface.extremes ? { extremes: plot.surface.extremes } : {}),
            ...(plot.surface.view ? { view: plot.surface.view } : {}),
            ...(plot.equalScale ? { equalScale: true } : {}),
            ...(plot.equalScale && plot.surface.zUnit === plot.xUnit ? { trueScale: true } : {}),
            ...(plot.surface.points ? { points: plot.surface.points } : {}),
            ...(plot.surface.edges ? { edges: plot.surface.edges } : {}),
            ...(plot.surface.cut
              ? (() => {
                  const c = plot.surface.cut;
                  const label = `${c.axis === 'x' ? plot.variable : plot.yVariable ?? 'y'} = ${format(c.at)}${(c.axis === 'x' ? plot.xUnit : plot.yUnit) ? ` ${c.axis === 'x' ? plot.xUnit : plot.yUnit}` : ''}`;
                  // Along an axis of the unit of z (a sphere in metres): the curve at one scale, a circle round.
                  const equalScale = (c.axis === 'x' ? plot.yUnit : plot.xUnit) === plot.surface.zUnit;
                  return { cut: { ...c, label, title: cutTitle(label), ...(equalScale ? { equalScale: true } : {}) } };
                })()
              : {}),
          },
        }
      : {}),
  };
  // Its height to its width as dragged in the sheet (ratio=0.6), else the usual one.
  // A cut adds its panel below the surface: the chart is that much higher.
  const base = plot.place?.ratio ? { width: CHART_SIZE.width, height: Math.round(CHART_SIZE.width * plot.place.ratio) } : plot.kind === 'surface' ? SURFACE_SIZE : plot.equalScale ? equalScaleSize(spec) : CHART_SIZE;
  const size = base;
  const options = { ...size, format, look, ...(plot.xDates ? { formatX: date } : {}), ...(plot.title ? { title: plot.title } : {}) };
  return {
    kind: 'chart',
    line,
    svg: chartSvg(spec, options),
    ...(spec.surface?.cut ? { cut: { svg: cutChart(spec, options)!.svg, caption: spec.surface.cut.title } } : {}),
    look,
    ...(ownLook ? { ownLook } : {}),
    spec,
    layout: chartLayout(spec, options),
    xUnit: plot.xUnit,
    yUnit: plot.yUnit,
    ...(plot.xDates ? { xDates: true } : {}),
    caption: plot.title ?? '',
    ...(label ? { label } : {}),
    ...(comment ? { comment } : {}),
    messages,
    ...(plot.place?.width !== undefined ? { width: plot.place.width } : {}),
    ...(plot.place?.wrap ? { wrap: plot.place.wrap } : {}),
    ...(plot.place?.align ? { align: plot.place.align } : {}),
    ...(plot.place?.wrap && plot.place.dx ? { dx: plot.place.dx } : {}),
    ...(plot.place?.wrap && plot.place.dy ? { dy: plot.place.dy } : {}),
  };
}

const SUPERSCRIPT: Readonly<Record<string, string>> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

/** L^2 -> L² in plain text (chart labels). */
function superscripts(text: string): string {
  return text.replace(/\^(-?\d+)/g, (_, power: string) => [...power].map((c) => SUPERSCRIPT[c] ?? c).join(''));
}
