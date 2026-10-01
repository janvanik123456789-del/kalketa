/**
 * Print model -> a self-contained HTML page for printing and PDF.
 *
 * Math is MathML (native in Chromium, Firefox and Safari); page size, margins
 * and page numbers come from CSS @page rules, so "Print to PDF" in a browser
 * gives the same result as the command line. Output is deterministic: the
 * same sheet and settings give the same bytes (rendering doc, ch. 39).
 */

import { t, type Catalog } from '@calccanvas/i18n';
import { esc, toMathML, type MathNode } from './math.js';
import { NOTES_CSS } from './notes.js';
import type { EquationLine, Message, PrintBlock, PrintDocument, SummaryRow } from './model.js';

export interface HtmlOptions {
  readonly catalog: Catalog;
  readonly paper?: 'A4' | 'A3' | 'Letter';
  readonly orientation?: 'portrait' | 'landscape';
  /** Appendices after the sheet, already rendered (see appendixHtml). */
  readonly appendices?: readonly string[];
}

/** An appendix: its own page(s) with a title, e.g. "Příloha A: Zatížení". */
export function appendixHtml(title: string, body: string): string {
  return `<section class="appendix">
<h1 class="appendix-title">${esc(title)}</h1>
${body}
</section>`;
}

function blockCalc(title: string | undefined, catalog: Catalog): string {
  return title ? `\n<div class="imported">${esc(t(catalog, 'print.blockCalc'))}: ${esc(title)}</div>` : '';
}

function imported(values: readonly string[] | undefined, catalog: Catalog): string {
  if (!values?.length) return '';
  return `\n<div class="imported">${esc(t(catalog, 'print.imported'))}: ${values.map(esc).join(', ')}</div>`;
}

const SEVERITY_MARK: Readonly<Record<Message['severity'], string>> = { error: '✕', warning: '⚠', info: 'ℹ' };

export function renderHtml(doc: PrintDocument, options: HtmlOptions): string {
  const { catalog } = options;
  const summary = doc.summary ? renderSummary(doc.summary.rows, doc.summary.allPassed, catalog) : '';
  const body = renderBlocksHtml(doc.blocks, catalog);
  return `<!doctype html>
<html lang="${esc(doc.language)}">
<head>
<meta charset="utf-8">
<meta name="generator" content="CalcCanvas">
<title>${esc(doc.title)}</title>
<style>
${stylesheet(doc, options)}
</style>
</head>
<body>
<header class="doc-head">
<h1>${esc(doc.title)}</h1>
${doc.subtitle ? `<p class="subtitle">${esc(doc.subtitle)}</p>` : ''}
</header>
${doc.summary?.position === 'top' ? summary : ''}
<main>
${body}
</main>
${doc.summary?.position === 'bottom' ? summary : ''}
${(options.appendices ?? []).join('\n')}
</body>
</html>
`;
}

export interface BlockHtmlOptions {
  /** Operator on the defining line; the editor shows "≔", print shows "=". */
  readonly defineOperator?: string;
}

/**
 * Blocks as HTML; a side picture and the blocks beside it go into two
 * columns that stay together on one page.
 */
export function renderBlocksHtml(blocks: readonly PrintBlock[], catalog: Catalog): string {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.kind !== 'picture' || !block.side || !block.beside?.length) {
      out.push(renderBlockHtml(block, catalog));
      continue;
    }
    const beside = new Set(block.beside);
    const rows: string[] = [];
    while (i + 1 < blocks.length) {
      const next = blocks[i + 1]!;
      if (!('line' in next) || !beside.has(next.line)) break;
      rows.push(renderBlockHtml(next, catalog));
      i++;
    }
    out.push(sideGroupHtml(rows.join('\n'), renderBlockHtml(block, catalog), block.side, block.width));
  }
  return out.join('\n');
}

/** Two columns: the lines and the picture on its side; `width` is the picture's share in percent. */
export function sideGroupHtml(rows: string, picture: string, side: 'left' | 'right', width: number | undefined): string {
  return `<div class="side-group side-${side}" style="--side:${width ?? 40}%"><div class="side-rows">${rows}</div><div class="side-picture">${picture}</div></div>`;
}

/** One block of the print model as HTML; shared by print and the editor. */
export function renderBlockHtml(block: PrintBlock, catalog: Catalog, options: BlockHtmlOptions = {}): string {
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(block.level + 1, 6);
      return `<h${level}>${esc(block.text)}</h${level}>`;
    }
    case 'paragraph':
      return `<p class="text">${esc(block.text)}</p>`;
    case 'page-break':
      return '<div class="page-break"></div>';
    case 'picture': {
      const image = block.src
        ? `<img src="${esc(block.src)}" alt="${esc(block.caption)}">`
        : `<div class="missing-image">${esc(t(catalog, 'print.pictureMissing', { path: block.path }))}</div>`;
      const caption = block.label ? `<figcaption><span class="figure-label">${esc(block.label)}:</span> ${esc(block.caption)}</figcaption>` : '';
      const size = block.width !== undefined ? ` style="width:${block.width}%"` : '';
      return `<figure class="block picture${block.width === undefined ? ' natural' : ''}" data-line="${block.line}"${size}>${image}${caption}</figure>`;
    }
    case 'equation':
      return `<section class="block equation" data-line="${block.line}">
${equationTable(block.lines, block.comment, options.defineOperator ?? '=')}${imported(block.imported, catalog)}${blockCalc(block.blockCalc, catalog)}${messages(block.messages)}
</section>`;
    case 'selection': {
      const condition = block.condition
        ? `<tr><td></td><td></td><td class="condition" colspan="2">${esc(t(catalog, 'print.condition'))}: ${math(block.condition)}</td></tr>`
        : '';
      const source = block.source ? ` · ${esc(block.source)}` : '';
      const image = block.image ? `<img class="row-image" src="${esc(block.image)}" alt="${esc(block.label)}">` : '';
      return `<section class="block selection" data-line="${block.line}">
${image}<table class="eq">
<tr><td class="lhs">${math(block.name)}</td><td class="op">${esc(options.defineOperator ?? '=')}</td><td class="rhs"><strong>${esc(block.label)}</strong> <span class="table-ref">(${esc(t(catalog, 'trace.table'))} ${esc(block.table)}${source})</span></td><td class="note">${comment(block.comment)}</td></tr>
${condition}</table>${messages(block.messages)}
</section>`;
    }
    case 'check': {
      const status = !block.evaluated ? 'not-evaluated' : block.passed ? 'passed' : 'failed';
      const verdict = !block.evaluated
        ? `? ${t(catalog, 'checks.notEvaluated')}`
        : block.passed
          ? `✓ ${t(catalog, 'checks.passed')}`
          : `✗ ${t(catalog, 'checks.failed')}`;
      const utilization = block.utilization ? `<span class="utilization">${esc(t(catalog, 'checks.utilization'))} ${esc(block.utilization)}</span>` : '';
      const source = block.source ? `<span class="source">[${esc(block.source)}]</span>` : '';
      return `<section class="block check ${status}" data-line="${block.line}">
<div class="check-head">${block.label ? `<span class="label">${esc(block.label)}</span>` : ''}${source}</div>
${checkLines(block.lines)}
<div class="verdict">${utilization}<span class="status">${esc(verdict)}</span></div>${messages(block.messages)}
</section>`;
    }
    case 'error':
      return `<section class="block error" data-line="${block.line}">
<pre class="source">${esc(block.source)}</pre>${messages(block.messages)}
</section>`;
  }
}

/** Lines aligned on "=": the left-hand side only on the first line. */
function equationTable(lines: readonly EquationLine[], note: string | undefined, defineOperator: string): string {
  const rows = lines.map((line, i) => {
    const lhs = line.lhs ? math(line.lhs) : '';
    const op = line.op ?? (line.lhs ? defineOperator : i > 0 ? '=' : '');
    return `<tr class="${line.role}"><td class="lhs">${lhs}</td><td class="op">${op}</td><td class="rhs">${math(line.rhs)}</td><td class="note">${i === 0 ? comment(note) : ''}</td></tr>`;
  });
  return `<table class="eq">\n${rows.join('\n')}\n</table>`;
}

function checkLines(lines: readonly EquationLine[]): string {
  return `<table class="eq">\n${lines.map((l) => `<tr class="${l.role}"><td class="rhs">${math(l.rhs)}</td></tr>`).join('\n')}\n</table>`;
}

export function renderSummary(rows: readonly SummaryRow[], allPassed: boolean, catalog: Catalog): string {
  const body = rows
    .map((r) => {
      const status = !r.evaluated ? `? ${t(catalog, 'checks.notEvaluated')}` : r.passed ? `✓ ${t(catalog, 'checks.passed')}` : `✗ ${t(catalog, 'checks.failed')}`;
      const cls = !r.evaluated || !r.passed ? ' class="failed"' : '';
      return `<tr${cls}><td>${esc(r.label)}</td><td class="num">${esc(r.utilization ?? '')}</td><td>${esc(status)}</td><td>${esc(r.source ?? '')}</td></tr>`;
    })
    .join('\n');
  const failed = rows.filter((r) => !r.passed).length;
  const total = allPassed ? t(catalog, 'checks.allPassed') : t(catalog, 'checks.someFailed', { count: failed, total: rows.length });
  return `<section class="summary">
<h2>${esc(t(catalog, 'checks.title'))}</h2>
<table>
<thead><tr><th>${esc(t(catalog, 'checks.check'))}</th><th class="num">${esc(t(catalog, 'checks.utilization'))}</th><th></th><th>${esc(t(catalog, 'checks.source'))}</th></tr></thead>
<tbody>
${body}
</tbody>
</table>
<p class="${allPassed ? 'all-passed' : 'some-failed'}">${esc(total)}</p>
</section>`;
}

function messages(list: readonly Message[]): string {
  if (list.length === 0) return '';
  const items = list.map((m) => `<li class="${m.severity}">${SEVERITY_MARK[m.severity]} ${esc(m.text)}</li>`).join('');
  return `\n<ul class="messages">${items}</ul>`;
}

function comment(text: string | undefined): string {
  return text ? `<span class="comment">${esc(text)}</span>` : '';
}

function math(node: MathNode): string {
  return toMathML(node);
}

function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function stylesheet(doc: PrintDocument, options: HtmlOptions): string {
  const page = `${options.paper ?? 'A4'} ${options.orientation ?? 'portrait'}`;
  const pageLabel = cssString(`${t(options.catalog, 'print.page')} `);
  const of = cssString(` ${t(options.catalog, 'print.of')} `);
  return `@page {
  size: ${page};
  margin: 18mm 16mm 18mm 20mm;
  @top-left { content: ${cssString(doc.title)}; font: 8pt sans-serif; color: #555; }
  @bottom-right { content: ${pageLabel} counter(page) ${of} counter(pages); font: 8pt sans-serif; color: #555; }
}
:root { color-scheme: light; }
body { font: 10.5pt/1.45 "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #111; background: #fff; margin: 0 auto; max-width: 180mm; padding: 8mm 0; }
@media screen { body { padding: 12mm 10mm; } }
${BLOCK_CSS}
${NOTES_CSS}
.appendix { break-before: page; }
.appendix-title { font-size: 15pt; margin: 0 0 4mm; }`;
}

/** Styles of blocks and the summary; used by print and by the editor. */
export const BLOCK_CSS = `math { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math; font-size: 1.1em; math-style: normal; }
h1 { font-size: 17pt; margin: 0 0 1mm; }
h2 { font-size: 13pt; margin: 6mm 0 2mm; border-bottom: 0.4pt solid #999; break-after: avoid; }
h3, h4, h5, h6 { font-size: 11pt; margin: 4mm 0 1.5mm; break-after: avoid; }
.subtitle { margin: 0 0 4mm; color: #444; }
.text { margin: 1.5mm 0; }
.block.picture { margin: 3mm auto; text-align: center; }
.picture img { display: block; width: 100%; height: auto; }
.picture.natural { width: fit-content; max-width: 100%; }
.picture.natural img { width: auto; max-width: 100%; }
.picture figcaption { margin-top: 1.5mm; font-size: 9pt; }
.picture .figure-label { font-weight: 600; }
.side-group { display: grid; grid-template-columns: minmax(0, 1fr) var(--side); column-gap: 5mm; align-items: start; break-inside: avoid; }
.side-group.side-left { grid-template-columns: var(--side) minmax(0, 1fr); }
.side-group.side-left .side-picture { order: -1; }
.side-picture .block.picture { width: 100% !important; margin: 1.5mm 0; }
.picture .missing-image { padding: 4mm; border: 1px dashed #c62828; color: #c62828; font-size: 9pt; }
.block { margin: 1.5mm 0 2.5mm; break-inside: avoid; }
table.eq { border-collapse: collapse; }
table.eq td { padding: 0.6mm 1.2mm; vertical-align: middle; }
td.lhs { text-align: right; min-width: 14mm; }
td.op { text-align: center; width: 4mm; }
td.note { padding-left: 6mm; color: #555; font-size: 9pt; }
tr.result td.rhs math { font-weight: bold; }
.comment::before { content: "— "; }
.selection .row-image { float: right; max-height: 28mm; max-width: 45mm; margin: 0 0 2mm 4mm; }
.selection .table-ref, .condition { color: #444; font-size: 9pt; }
.check { border-left: 1.2mm solid #888; padding: 1mm 0 1mm 3mm; }
.check.passed { border-left-color: #2e7d32; }
.check.failed, .check.not-evaluated { border-left-color: #c62828; }
.check .label { font-weight: 600; margin-right: 3mm; }
.check .source, .summary td:last-child { color: #555; font-size: 9pt; }
.check .verdict { margin-top: 0.8mm; }
.check .utilization { margin-right: 4mm; }
.check .status { font-weight: 700; }
.error { border-left: 1.2mm solid #c62828; padding: 1mm 0 1mm 3mm; }
.error pre.source { margin: 0; font: 9.5pt Consolas, "Courier New", monospace; white-space: pre-wrap; }
ul.messages { list-style: none; margin: 0.5mm 0 0; padding: 0; font-size: 9pt; }
ul.messages .error { color: #b71c1c; }
ul.messages .warning { color: #8a5a00; }
ul.messages .info { color: #555; }
.summary { margin: 2mm 0 5mm; break-inside: avoid; }
.summary table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
.summary th, .summary td { border-bottom: 0.4pt solid #bbb; padding: 1mm 2mm; text-align: left; }
.summary .num { text-align: right; white-space: nowrap; }
.summary tr.failed td { font-weight: 700; }
.summary .some-failed { font-weight: 700; color: #b71c1c; }
.page-break { break-after: page; }
.imported { font-size: 9pt; color: #1f4f8f; margin: 0.3mm 0 0 18mm; }`;
