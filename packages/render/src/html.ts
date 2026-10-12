/**
 * Print model -> a self-contained HTML page for printing and PDF.
 *
 * Math is MathML (native in Chromium, Firefox and Safari); page size, margins
 * and page numbers come from CSS @page rules, so "Print to PDF" in a browser
 * gives the same result as the command line. Output is deterministic: the
 * same sheet and settings give the same bytes (rendering doc, ch. 39).
 */

import { t, type Catalog } from '@kalketa/i18n';
import { esc, mn, nameNode, sup, toMathML, VECTOR_ARROW, type MathNode } from './math.js';
import { NOTES_CSS } from './notes.js';
import { PAGED_SCRIPT, PRINT_MARGINS, pagedCss, paperSize, sheetSections, type PagedConfig, type Section } from './paged.js';

/** A nonce for the script of a printout: only a script carrying it runs there. */
function nonceOf(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
import type { EquationLine, Message, PrintBlock, PrintDocument, SummaryRow, TableRows, TextStyle } from './model.js';

export interface HtmlOptions {
  readonly catalog: Catalog;
  readonly paper?: 'A4' | 'A3' | 'Letter';
  readonly orientation?: 'portrait' | 'landscape';
  /** Appendices after the sheet, already rendered (see appendixHtml). */
  readonly appendices?: readonly string[];
  /** Left of the page footer: the revision and fingerprint (see revisionFooter). */
  readonly footer?: string;
  /** Right of the page head: the author and the date. */
  readonly headRight?: string;
  /** Lines (statement starts) the AI made and nobody reviewed: marked in the margin, with a notice at the top. */
  readonly aiLines?: ReadonlySet<number>;
  /** How the calculation is set: "compact" (school) or "airy" (a step per line). */
  readonly style?: CalcStyle;
  /** Pages numbered through (the browser's @page), or by sections (2.1, 2.2), laid out by the printout itself. */
  readonly pageNumbers?: PageNumbers;
}

export type PageNumbers = 'continuous' | 'sections';

/**
 * How a calculation is set (docs/navrhy/RESIC-A-STYLY.md): "compact" is the
 * school style, formula = substitution = result on one line, broken at an
 * equals sign only where it does not fit, inputs side by side, a check on one
 * line; "airy" sets each step on a line of its own. Only the setting changes,
 * never the calculation.
 */
/** compact: a line per step chain (school); airy: a line per step; book: formulas centred, as textbooks set them. */
/** columns: the British calculation sheet, the source on the left, the calculation, its results on the right. */
export type CalcStyle = 'compact' | 'airy' | 'book' | 'columns';

// A name with an index, a vector arrow or a power in text, written as in a formula: σ_Kt, S_min, p⃗_1, d^2.
const TEXT_NAME = /(\p{L}[\p{L}\p{N}\p{M}]*)(_[\p{L}\p{N}\p{M}_]*[\p{L}\p{N}\p{M}])?(\^-?[\p{L}\p{N}]+)?/gu;

/** Fonts by kind, as the printout and every machine have some of each. */
export const TEXT_FONT_FAMILIES = { serif: '"Cambria", "Times New Roman", serif', sans: '"Calibri", "Arial", sans-serif', mono: '"Consolas", "Courier New", monospace' } as const;
/** Dark enough to read on paper and in black-and-white print. */
/** The CSS font of a text line: a kind, or a font of the system by name (_ for a space) with a plain fallback. */
export function textFontCss(font: string): string {
  if (font in TEXT_FONT_FAMILIES) return TEXT_FONT_FAMILIES[font as keyof typeof TEXT_FONT_FAMILIES];
  return `"${font.replace(/_/g, ' ').replace(/["\\]/g, '')}", ${TEXT_FONT_FAMILIES.sans}`;
}
export const TEXT_COLOR_VALUES = { gray: '#5f6368', blue: '#1a4f9c', red: '#b3261e', green: '#2e7d32' } as const;

/** The style of a text line ({size=12 italic}) as a style attribute; nothing when it sets none. */
function styleAttribute(style: TextStyle | undefined): string {
  if (!style) return '';
  const rules = [
    style.size !== undefined ? `font-size: ${style.size}pt` : '',
    style.font ? `font-family: ${textFontCss(style.font)}` : '',
    style.italic ? 'font-style: italic' : '',
    style.bold ? 'font-weight: bold' : '',
    style.align ? `text-align: ${style.align}` : '',
    style.color ? `color: ${TEXT_COLOR_VALUES[style.color]}` : '',
  ].filter(Boolean);
  return rules.length > 0 ? ` style="${esc(rules.join('; '))}"` : '';
}

/**
 * Text of a paragraph or heading: names with an index (the _ of the Operators toolbar)
 * and powers (^) look as they do in the formulas around; *italic* and **bold** words as
 * in Markdown; everything else is plain text.
 */
export function textHtml(text: string): string {
  return colored(emphasis(namesInText(text)));
}

/** {red}words{/}: a part of the text in a colour of its own (of the colours a text line has). */
function colored(html: string): string {
  return html.replace(/\{(gray|blue|red|green)\}([\s\S]*?)\{\/\}/g, (_, color: keyof typeof TEXT_COLOR_VALUES, words: string) => `<span style="color: ${TEXT_COLOR_VALUES[color]}">${words}</span>`);
}

/** **bold** and *italic* parts; a lone * (2 * 3) stays as it is. Tags hold no *, so they are safe. */
function emphasis(html: string): string {
  return html.replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(\S(?:[^*]*?\S)?)\*(?!\*)/g, '$1<em>$2</em>');
}

function namesInText(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TEXT_NAME)) {
    if (!m[2] && !m[3] && !m[1]!.includes(VECTOR_ARROW)) continue;
    const name = nameNode(m[1]! + (m[2] ?? ''));
    const power = m[3]?.slice(1);
    out += esc(text.slice(last, m.index)) + toMathML(power ? sup(name, /^-?\d+$/.test(power) ? mn(power.replace('-', '−')) : nameNode(power)) : name);
    last = m.index! + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** An input ("L := 6 m"): one line, no formula. In the compact style inputs stand side by side. */
export function isInput(block: PrintBlock): boolean {
  return block.kind === 'equation' && block.lines.length === 1 && block.lines[0]!.role === 'given' && block.messages.length === 0 && !block.imported?.length && !block.blockCalc;
}

/** An appendix: its own page(s) with a title, e.g. "Příloha A: Zatížení". */
export function appendixHtml(title: string, body: string, section?: Section): string {
  return `<section class="appendix"${section ? ` data-section="${esc(section.label)}" data-section-title="${esc(section.title)}"` : ''}>
<h1 class="appendix-title">${esc(title)}</h1>
${body}
</section>`;
}

/** An equation with its number at the right, level with its last line: (5). */
function numbered(body: string, number: number | undefined): string {
  return number === undefined ? body : `<div class="eq-body">${body}<span class="eq-number">(${number})</span></div>`;
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
  // With columns the first row names them, as on a calculation sheet.
  const head = options.style === 'columns' ? columnsHead(catalog) : '';
  const paged = options.pageNumbers === 'sections';
  const sections = paged ? sheetSections(doc.blocks) : undefined;
  const body = head + renderBlocksHtml(doc.blocks, catalog, options.aiLines, options.style, sections, doc.beside);
  const aiNotice = options.aiLines && options.aiLines.size > 0 ? `<p class="ai-notice">${esc(t(catalog, 'print.aiUnreviewed'))}</p>` : '';
  const content = `<header class="doc-head">
<h1>${esc(doc.title)}</h1>
${doc.subtitle ? `<p class="subtitle">${esc(doc.subtitle)}</p>` : ''}
</header>
${aiNotice}
${doc.summary?.position === 'top' ? summary : ''}
<main>
${body}
</main>
${doc.summary?.position === 'bottom' ? summary : ''}
${(options.appendices ?? []).join('\n')}`;
  if (!paged) {
    return `<!doctype html>
<html lang="${esc(doc.language)}">
<head>
<meta charset="utf-8">
<meta name="generator" content="Kalketa">
<title>${esc(doc.title)}</title>
<style>
${stylesheet(doc, options)}
</style>
</head>
<body>
${content}
</body>
</html>`;
  }
  // Pages by sections: the printout lays them out itself. Its own script runs, no other (by its nonce).
  const config: PagedConfig = {
    ...paperSize(options.paper, options.orientation),
    margin: PRINT_MARGINS,
    title: doc.title,
    ...(options.headRight ? { headRight: options.headRight } : {}),
    ...(options.footer ? { footer: options.footer } : {}),
    page: t(catalog, 'print.page'),
    of: t(catalog, 'print.of'),
  };
  const nonce = nonceOf();
  return `<!doctype html>
<html lang="${esc(doc.language)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${nonce}'">
<meta name="generator" content="Kalketa">
<title>${esc(doc.title)}</title>
<style>
${stylesheet(doc, options).replace(/^@page \{[\s\S]*?\n\}\n/, '')}
${pagedCss(config)}
</style>
</head>
<body>
<div id="flow" data-paged-flow="${esc(JSON.stringify(config))}">
${content}
</div>
<script nonce="${nonce}">${PAGED_SCRIPT}</script>
</body>
</html>`;
}

export interface BlockHtmlOptions {
  /** Operator on the defining line; the editor shows "≔", print shows "=". */
  readonly defineOperator?: string;
  readonly style?: CalcStyle;
}

/**
 * Blocks as HTML; a side picture and the blocks beside it go into two
 * columns that stay together on one page.
 */
export function renderBlocksHtml(blocks: readonly PrintBlock[], catalog: Catalog, aiLines?: ReadonlySet<number>, style: CalcStyle = 'airy', sections?: ReadonlyMap<number, Section>, cellLines?: ReadonlySet<number>): string {
  const out: string[] = [];
  // A block the AI made and nobody reviewed carries a mark in the margin; the heading of a section its label.
  const marked = (block: PrintBlock, html: string) => {
    const section = block.kind === 'heading' ? sections?.get(block.line) : undefined;
    const own = section ? html.replace(/^<h(\d)/, `<h$1 data-section="${esc(section.label)}" data-section-title="${esc(section.title)}"`) : html;
    return 'line' in block && aiLines?.has(block.line) ? `<div class="ai-made">${own}</div>` : own;
  };
  const options = { style };
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    // Cells: a block and the ones written beside it stand on one row.
    const besideNext = (b: PrintBlock | undefined) => !!b && 'line' in b && !!cellLines?.has(b.line);
    if (besideNext(blocks[i + 1])) {
      const cells: string[] = [marked(block, renderBlockHtml(block, catalog, options))];
      while (besideNext(blocks[i + 1])) cells.push(marked(blocks[i + 1]!, renderBlockHtml(blocks[++i]!, catalog, options)));
      out.push(`<div class="cells">${cells.map((c) => `<div class="cell">${c}</div>`).join('')}</div>`);
      continue;
    }
    // Compact: inputs one after another stand side by side, as far as the line reaches.
    if (style === 'compact' && isInput(block) && isInput(blocks[i + 1] ?? block) && blocks[i + 1]) {
      const group: string[] = [];
      while (i < blocks.length && isInput(blocks[i]!)) group.push(marked(blocks[i]!, renderBlockHtml(blocks[i++]!, catalog, options)));
      i--;
      out.push(`<div class="flow-group">${group.join('')}</div>`);
      continue;
    }
    if (block.kind !== 'picture' || !block.side || !block.beside?.length) {
      out.push(marked(block, renderBlockHtml(block, catalog, options)));
      continue;
    }
    const beside = new Set(block.beside);
    const rows: string[] = [];
    while (i + 1 < blocks.length) {
      const next = blocks[i + 1]!;
      if (!('line' in next) || !beside.has(next.line)) break;
      rows.push(marked(next, renderBlockHtml(next, catalog, options)));
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

/** The head of the three columns: Reference, Calculation, Result. */
export function columnsHead(catalog: Catalog): string {
  return `<div class="cols cols-head"><div class="col-ref">${esc(t(catalog, 'print.colRef'))}</div><div class="col-calc">${esc(t(catalog, 'print.colCalc'))}</div><div class="col-out">${esc(t(catalog, 'print.colOut'))}</div></div>`;
}

/**
 * A block on a calculation sheet with columns: its source on the left, the working in the
 * middle, what it gives on the right (a result with its name, a verdict). Headings,
 * pictures and charts stay across the whole width (undefined).
 */
function columnsHtml(block: PrintBlock, catalog: Catalog, options: BlockHtmlOptions): string | undefined {
  const inner: BlockHtmlOptions = { ...options, style: 'airy' };
  const row = (ref: string | undefined, calc: string, out: string) =>
    `<div class="cols"><div class="col-ref">${ref ? esc(ref) : ''}</div><div class="col-calc">${calc}</div><div class="col-out">${out}</div></div>`;
  switch (block.kind) {
    case 'equation': {
      const first = block.lines[0];
      const last = block.lines[block.lines.length - 1];
      // The result goes to the right with its name; the formula and its numbers stay.
      const split = block.lines.length > 1 && last?.role === 'result' && !last.lhs && first?.lhs;
      const { source, ...rest } = block;
      const calc = renderBlockHtml(split ? { ...rest, lines: block.lines.slice(0, -1) } : rest, catalog, inner);
      const out = split ? `<div class="out-line">${math(first.lhs!)}<span class="op">${esc(last.op ?? '=')}</span>${math(last.rhs)}</div>` : '';
      return row(source, calc, out);
    }
    case 'check': {
      const { source, ...rest } = block;
      const status = !block.evaluated ? 'not-evaluated' : block.passed ? 'passed' : 'failed';
      const utilization = block.utilization ? `<span class="utilization">${esc(block.utilization)}</span>` : '';
      return row(source, renderBlockHtml(rest, catalog, inner), `<div class="out-verdict ${status}">${utilization}<span class="status">${esc(block.verdict)}</span></div>`);
    }
    case 'selection':
      return row(block.source, renderBlockHtml(block, catalog, inner), `<div class="out-line">${math(block.name)}<span class="op">=</span><strong>${esc(block.label)}</strong></div>`);
    case 'paragraph': {
      const { cites, ...rest } = block;
      return row(cites?.length ? cites.map((c) => `[${c}]`).join(' ') : undefined, renderBlockHtml(rest, catalog, inner), '');
    }
    default:
      return undefined;
  }
}

/** One block of the print model as HTML; shared by print and the editor. */
export function renderBlockHtml(block: PrintBlock, catalog: Catalog, options: BlockHtmlOptions = {}): string {
  if (options.style === 'columns') {
    const columns = columnsHtml(block, catalog, options);
    if (columns !== undefined) return columns;
  }
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(block.level + 1, 6);
      const position = block.position ? `<span class="position">${esc(block.position)}</span> ` : '';
      return `<h${level}${styleAttribute(block.style)}${block.position ? ' class="position-head"' : ''}>${position}${textHtml(block.text)}</h${level}>`;
    }
    case 'paragraph':
      return `<p class="text"${styleAttribute(block.style)}>${textHtml(block.text)}${(block.cites ?? []).map((c) => ` <span class="source">[${esc(c)}]</span>`).join('')}</p>`;
    case 'page-break':
      return '<div class="page-break"></div>';
    case 'clear':
      return '<div class="clear"></div>';
    case 'picture': {
      const image = block.src
        ? `<img src="${esc(block.src)}" alt="${esc(block.caption)}">`
        : `<div class="missing-image">${esc(t(catalog, 'print.pictureMissing', { path: block.path }))}</div>`;
      const caption = block.label ? `<figcaption><span class="figure-label">${esc(block.label)}:</span> ${esc(block.caption)}</figcaption>` : '';
      const wrap = block.wrap ? ` wrap-${block.wrap}` : block.align ? ` align-${block.align}` : '';
      // Placed freely: an empty stop of its height moves it down, a margin away from its edge.
      const styles = [block.width !== undefined ? `width:${block.width}%` : '', block.wrap && block.dx ? `margin-${block.wrap}:${block.dx}%` : '', block.wrap && block.dy ? `clear:${block.wrap}` : ''].filter(Boolean);
      const stop = block.wrap && block.dy ? `<div class="wrap-stop wrap-${block.wrap}" style="height:${block.dy}mm"></div>` : '';
      return `${stop}<figure class="block picture${block.width === undefined ? ' natural' : ''}${wrap}" data-line="${block.line}"${styles.length ? ` style="${styles.join(';')}"` : ''}>${image}${caption}</figure>`;
    }
    case 'chart': {
      const caption = block.label ? `<figcaption><span class="figure-label">${esc(block.label)}:</span> ${esc(block.caption)}</figcaption>` : '';
      // Placed as a picture: at an edge, or flowed around and moved from its line.
      const place = block.wrap ? ` wrap-${block.wrap}` : block.align ? ` align-${block.align}` : '';
      const styles = [block.width !== undefined ? `width:${block.width}%` : '', block.wrap && block.dx ? `margin-${block.wrap}:${block.dx}%` : '', block.wrap && block.dy ? `clear:${block.wrap}` : ''].filter(Boolean);
      const stop = block.wrap && block.dy ? `<div class="wrap-stop wrap-${block.wrap}" style="height:${block.dy}mm"></div>` : '';
      return `${stop}<figure class="block chart${place}" data-line="${block.line}"${styles.length ? ` style="${styles.join(';')}"` : ''}>${block.svg}${caption}${messages(block.messages)}</figure>`;
    }
    case 'equation':
      return `<section class="block equation${options.style === 'compact' ? ' compact' : options.style === 'book' ? ' book' : ''}${block.number !== undefined ? ' numbered' : ''}" data-line="${block.line}">
${numbered(options.style === 'compact' ? equationFlow(block.lines, block.comment, options.defineOperator ?? '=', block.source) : equationTable(block.lines, block.comment, options.defineOperator ?? '=', block.source), block.number)}${block.table ? dataTableHtml(block.table) : ''}${block.derived ? `<div class="derived">✓ ${esc(t(catalog, 'print.derived'))}</div>` : ''}${imported(block.imported, catalog)}${blockCalc(block.blockCalc, catalog)}${messages(block.messages)}
</section>`;
    case 'selection': {
      const condition = block.condition
        ? `<tr><td></td><td></td><td class="condition" colspan="2">${esc(t(catalog, 'print.condition'))}: ${math(block.condition)}</td></tr>`
        : '';
      const source = block.source ? ` · ${esc(block.source)}` : '';
      const image = block.image ? `<img class="row-image" src="${esc(block.image)}" alt="${esc(block.label)}">` : '';
      if (options.style === 'compact') {
        const condition = block.condition ? `<span class="part note-plain">${esc(t(catalog, 'print.condition'))}: ${math(block.condition)}</span>` : '';
        return `<section class="block selection compact" data-line="${block.line}">
${image}<div class="eq-flow"><span class="lhs">${math(block.name)}</span><span class="parts"><span class="part"><span class="op">${esc(options.defineOperator ?? '=')}</span><strong>${esc(block.label)}</strong></span><span class="part note-plain table-ref">(${esc(t(catalog, 'trace.table'))} ${esc(block.table)}${source})</span>${condition}${block.comment ? `<span class="part note">${esc(block.comment)}</span>` : ''}</span></div>${messages(block.messages)}
</section>`;
      }
      return `<section class="block selection" data-line="${block.line}">
${image}<table class="eq">
<tr><td class="lhs">${math(block.name)}</td><td class="op">${esc(options.defineOperator ?? '=')}</td><td class="rhs"><strong>${esc(block.label)}</strong> <span class="table-ref">(${esc(t(catalog, 'trace.table'))} ${esc(block.table)}${source})</span></td><td class="note">${comment(block.comment)}</td></tr>
${condition}</table>${messages(block.messages)}
</section>`;
    }
    case 'check': {
      const status = !block.evaluated ? 'not-evaluated' : block.passed ? 'passed' : 'failed';
      const verdict = block.verdict;
      const utilization = block.utilization ? `<span class="utilization">${esc(t(catalog, 'checks.utilization'))} ${esc(block.utilization)}</span>` : '';
      const source = block.source ? `<span class="source">[${esc(block.source)}]</span>` : '';
      if (options.style === 'compact') {
        // On one line: the label, the condition and its values, the utilization and the verdict, the source.
        const parts = block.lines.map((l, i) => `<span class="part ${l.role}">${i > 0 ? '<span class="op">→</span>' : ''}${math(l.rhs)}</span>`);
        const tail = `<span class="part verdict">${block.utilization ? `<span class="op">→</span><span class="utilization">${esc(block.utilization)}</span>` : ''}<span class="status">${esc(verdict)}</span></span>${source ? `<span class="part">${source}</span>` : ''}`;
        return `<section class="block check compact ${status}" data-line="${block.line}">
<div class="eq-flow">${block.label ? `<span class="lhs label">${esc(block.label)}:</span>` : ''}<span class="parts">${parts.join('')}${tail}</span></div>${messages(block.messages)}
</section>`;
      }
      return `<section class="block check ${status}" data-line="${block.line}">
<div class="check-head">${block.label ? `<span class="label">${esc(block.label)}</span>` : ''}${source}</div>
${checkLines(block.lines)}
<div class="verdict">${utilization}<span class="status">${esc(verdict)}</span></div>${messages(block.messages)}
</section>`;
    }
    case 'datatable':
      return `<section class="block datatable" data-line="${block.line}">
${dataTableHtml(block, block.name)}${messages(block.messages)}
</section>`;
    case 'error':
      return `<section class="block error" data-line="${block.line}">
<pre class="source">${esc(block.source)}</pre>${messages(block.messages)}
</section>`;
  }
}

/** A table as printed: the names typeset (g_k with k below), the formula of a calculated column under its name, rows of totals set apart. */
function dataTableHtml(table: TableRows & { readonly totals?: readonly number[] }, caption?: string): string {
  const head = table.columns
    .map((c) => `<th${c.numeric ? ' class="num"' : ''}>${toMathML(nameNode(c.name))}${c.unit ? ` <span class="unit">[${esc(c.unit)}]</span>` : ''}${c.formula ? `<div class="formula">= ${toMathML(c.formula)}</div>` : ''}</th>`)
    .join('');
  const body = table.rows
    .map((row, n) => `<tr${table.totals?.includes(n) ? ' class="total"' : ''}>${row.map((cell, i) => `<td${table.columns[i]?.numeric ? ' class="num"' : ''}>${esc(cell)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table class="data-table">${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody></table>`;
}

/** Lines aligned on "=": the left-hand side only on the first line. */
function equationTable(lines: readonly EquationLine[], note: string | undefined, defineOperator: string, source?: string): string {
  const rows = lines.map((line, i) => {
    const lhs = line.lhs ? `${line.lead ? `<span class="lead">${esc(line.lead)}</span>` : ''}${math(line.lhs)}` : '';
    const op = line.op ?? (line.lhs ? defineOperator : i > 0 ? '=' : '');
    return `<tr class="${line.role}"><td class="lhs">${lhs}</td><td class="op">${op}</td><td class="rhs">${math(line.rhs)}</td><td class="note">${i === 0 ? comment(note) + sourceRef(source) : ''}</td></tr>`;
  });
  return `<table class="eq">\n${rows.join('\n')}\n</table>`;
}

/**
 * The compact style: the name, then each step after its sign, all on one line;
 * the steps wrap at an equals sign under the first one when the line is full.
 */
function equationFlow(lines: readonly EquationLine[], note: string | undefined, defineOperator: string, source?: string): string {
  // The name leads the line when the first step has it; a later step with a name of its own
  // (the result of a solved equation, "x = 2") keeps it.
  const lhs = lines[0]?.lhs;
  const parts = lines.map((line, i) => {
    const op = line.op ?? (line.lhs ? defineOperator : i > 0 ? '=' : '');
    const own = i > 0 && line.lhs ? `${line.lead ? `<span class="lead">${esc(line.lead)}</span>` : ''}${math(line.lhs)}` : '';
    return `<span class="part ${line.role}${own ? ' own' : ''}">${own}${op ? `<span class="op">${esc(op)}</span>` : ''}${math(line.rhs)}</span>`;
  });
  const comment = (note ? `<span class="part note">${esc(note)}</span>` : '') + (source ? `<span class="part">${sourceRef(source)}</span>` : '');
  return `<div class="eq-flow">${lhs ? `<span class="lhs">${math(lhs)}</span>` : ''}<span class="parts">${parts.join('')}${comment}</span></div>`;
}

function checkLines(lines: readonly EquationLine[]): string {
  return `<table class="eq">\n${lines.map((l) => `<tr class="${l.role}"><td class="rhs">${math(l.rhs)}</td></tr>`).join('\n')}\n</table>`;
}

export function renderSummary(rows: readonly SummaryRow[], allPassed: boolean, catalog: Catalog): string {
  const body = rows
    .map((r) => {
      const status = r.verdict;
      const cls = !r.evaluated || !r.passed ? ' class="failed"' : '';
      const line = r.line !== undefined ? ` data-line="${r.line}"` : '';
      return `<tr${cls}${line}><td>${esc(r.label)}</td><td class="num">${esc(r.utilization ?? '')}</td><td>${esc(status)}</td><td>${esc(r.source ?? '')}</td></tr>`;
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

/** Where a formula comes from, as a check shows it: [EN 1990, 6.10]. */
function sourceRef(source: string | undefined): string {
  return source ? ` <span class="source">[${esc(source)}]</span>` : '';
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
  @top-left { content: ${cssString(doc.title)}; font: 8pt sans-serif; color: #555; }${options.headRight ? `
  @top-right { content: ${cssString(options.headRight)}; font: 8pt sans-serif; color: #555; }` : ''}
  @bottom-right { content: ${pageLabel} counter(page) ${of} counter(pages); font: 8pt sans-serif; color: #555; }${options.footer ? `
  @bottom-left { content: ${cssString(options.footer)}; font: 8pt sans-serif; color: #555; }` : ''}
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
export const BLOCK_CSS = `/* Cells of one row: a text and a formula, two results, side by side. */
/* On one baseline: a text stands on the main line of the formula beside it, as in a sentence. */
.cells { display: flex; align-items: baseline; gap: 10mm; }
.cells > .cell { flex: 0 1 auto; min-width: 0; }
.cells > .cell > * { margin-top: 0; margin-bottom: 0; }
/* A calculation sheet with columns: the source, the working, the results; lines between them run down the page. */
.cols { display: grid; grid-template-columns: 22mm minmax(0, 1fr) 38mm; column-gap: 0; align-items: stretch; }
.cols > div { min-width: 0; }
.cols > .col-ref { border-right: 0.4pt solid #999; padding: 1.2mm 2mm 0 0; font-size: 8pt; color: #444; overflow-wrap: anywhere; }
.cols > .col-calc { padding: 0 2.5mm; }
.cols > .col-out { border-left: 0.4pt solid #999; padding: 1.2mm 0 0 2.5mm; }
.cols.cols-head { border-bottom: 0.8pt solid #333; font-weight: 600; font-size: 9pt; color: #222; }
.cols.cols-head > div { padding-top: 0; padding-bottom: 1mm; }
.cols .col-calc .verdict, .cols .col-calc .check-head .source { display: none; }
.cols .out-line { font-weight: bold; }
.cols .out-line .op { margin: 0 0.3em; font-weight: normal; }
.cols .out-verdict { display: flex; flex-direction: column; gap: 0.5mm; font-weight: bold; }
.cols .out-verdict .utilization { font-weight: normal; font-size: 9pt; }
.cols .out-verdict.failed .status { color: #b00020; }
math { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math; font-size: 1.1em; math-style: normal; }
h1 { font-size: 17pt; margin: 0 0 1mm; }
h2 { font-size: 13pt; margin: 6mm 0 2mm; border-bottom: 0.4pt solid #999; break-after: avoid; }
.position-head .position { display: inline-block; min-width: 16mm; margin-right: 2mm; }
h3, h4, h5, h6 { font-size: 11pt; margin: 4mm 0 1.5mm; break-after: avoid; }
.subtitle { margin: 0 0 4mm; color: #444; }
.text { margin: 1.5mm 0; }
.block.picture { margin: 3mm auto; text-align: center; }
.picture img { display: block; width: 100%; height: auto; }
.picture.natural { width: fit-content; max-width: 100%; }
.picture.natural img { width: auto; max-width: 100%; }
.picture figcaption, .chart figcaption { margin-top: 1.5mm; font-size: 9pt; }
.block.chart { margin: 3mm auto; text-align: center; max-width: 170mm; break-inside: avoid; }
.chart .figure-label { font-weight: 600; }
.picture .figure-label { font-weight: 600; }
/* Lines flow around a wrapped picture: each block keeps whole beside it (a formula is never broken), below it the full width. */
.block.picture.align-left, .block.chart.align-left { margin-left: 0; margin-right: auto; text-align: left; }
.block.picture.align-right, .block.chart.align-right { margin-left: auto; margin-right: 0; text-align: right; }
.block.picture.wrap-right, .block.chart.wrap-right { float: right; margin: 1mm 0 2mm 5mm; }
.block.picture.wrap-left, .block.chart.wrap-left { float: left; margin: 1mm 5mm 2mm 0; }
.block, h2, h3, h4 { display: flow-root; }
.page-break, .clear { clear: both; }
/* A derivation checked step by step: a quiet mark under it. */
.derived { margin: 0.3mm 0 0 6mm; font-size: 8pt; color: #2e7d32; }
/* ⇒ before the unknown that follows from an inequality. */
.lead { margin: 0 0.6em; }
/* The stop above a freely placed picture: as tall as it is moved down, no width, so the text beside it is not narrowed. */
.wrap-stop { width: 0; margin: 0; }
.wrap-stop.wrap-right { float: right; }
.wrap-stop.wrap-left { float: left; }
.side-group { display: grid; grid-template-columns: minmax(0, 1fr) var(--side); column-gap: 5mm; align-items: start; break-inside: avoid; }
.side-group.side-left { grid-template-columns: var(--side) minmax(0, 1fr); }
.side-group.side-left .side-picture { order: -1; }
.side-picture .block.picture { width: 100% !important; margin: 1.5mm 0; }
.picture .missing-image { padding: 4mm; border: 1px dashed #c62828; color: #c62828; font-size: 9pt; }
.block { margin: 1.5mm 0 2.5mm; break-inside: avoid; }
table.eq { border-collapse: collapse; }
/* A table written in the sheet: lines under the header and at the end, numbers to the right. */
table.data-table { border-collapse: collapse; margin: 2mm 0; font-size: 9.5pt; }
table.data-table caption { text-align: left; font-weight: 600; padding-bottom: 1mm; }
table.data-table th, table.data-table td { padding: 0.6mm 3mm; text-align: left; }
table.data-table th { border-bottom: 0.8pt solid #333; font-weight: 600; }
table.data-table tbody tr:last-child td { border-bottom: 0.8pt solid #333; }
table.data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
table.data-table .unit { font-weight: 400; }
table.data-table th .formula { font-weight: 400; font-size: 8.5pt; color: #444; }
table.data-table tr.total td { font-weight: 600; border-top: 0.6pt solid #333; }
table.eq td { padding: 0.6mm 1.2mm; vertical-align: middle; }
td.lhs { text-align: right; min-width: 14mm; }
td.op { text-align: center; width: 4mm; }
td.note { padding-left: 6mm; color: #555; font-size: 9pt; }
tr.result td.rhs math { font-weight: bold; }
.comment::before { content: "— "; }
.selection .row-image { float: right; max-height: 28mm; max-width: 45mm; margin: 0 0 2mm 4mm; }
.selection .table-ref, .condition { color: #444; font-size: 9pt; }
/* The compact (school) style: a step after another on one line, broken at "=" under the first one. */
.block.compact { margin: 0.8mm 0 1.4mm; }
.eq-flow { display: flex; align-items: baseline; }
.eq-flow .lhs { flex: none; margin-right: 1.4mm; }
.eq-flow .parts { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 1.6mm; row-gap: 1mm; min-width: 0; }
.eq-flow .part { display: inline-flex; align-items: baseline; gap: 1.4mm; white-space: nowrap; }
.eq-flow .part.result math { font-weight: bold; }
.eq-flow .part.own { margin-left: 5mm; }
.eq-flow .part.note { color: #555; font-size: 9pt; white-space: normal; padding-left: 3mm; }
.eq-flow .part.note::before { content: "— "; }
.eq-flow .part.note-plain { white-space: normal; }
.check.compact { padding: 0.6mm 0 0.6mm 3mm; }
.check.compact .eq-flow .label { font-weight: 600; }
.check.compact .verdict { margin: 0; }
.flow-group { display: flex; flex-wrap: wrap; column-gap: 12mm; margin: 0.8mm 0 1.4mm; break-inside: avoid; }
.flow-group > * { flex: none; }
.flow-group .block.compact { margin: 0.4mm 0; }
.check { border-left: 1.2mm solid #888; padding: 1mm 0 1mm 3mm; }
.check.passed { border-left-color: #2e7d32; }
.check.failed, .check.not-evaluated { border-left-color: #c62828; }
.check .label { font-weight: 600; margin-right: 3mm; }
.check .source, .text .source, .summary td:last-child { color: #555; font-size: 9pt; }
.block.equation.numbered .eq-body { position: relative; padding-right: 12mm; }
.eq-number { position: absolute; right: 0; bottom: 0.15em; }
.block.equation.book table.eq { margin-left: auto; margin-right: auto; }
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
.ai-notice { margin: 2mm 0 4mm; padding: 2mm 3mm; border: 0.75pt solid #5a3fa6; border-left-width: 3pt; color: #3d2a73; font-size: 9.5pt; break-inside: avoid; }
.ai-made { position: relative; border-left: 1.5pt solid #5a3fa6; padding-left: 2mm; margin-left: -2mm; }
.ai-made::before { content: "AI"; position: absolute; left: -8mm; top: 0.5mm; padding: 0 0.8mm; border: 0.5pt solid #5a3fa6; color: #5a3fa6; font: 600 6.5pt/1.3 sans-serif; }
.summary table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
.summary th, .summary td { border-bottom: 0.4pt solid #bbb; padding: 1mm 2mm; text-align: left; }
.summary .num { text-align: right; white-space: nowrap; }
.summary tr.failed td { font-weight: 700; }
.summary .some-failed { font-weight: 700; color: #b71c1c; }
.page-break { break-after: page; }
.imported { font-size: 9pt; color: #1f4f8f; margin: 0.3mm 0 0 18mm; }`;
