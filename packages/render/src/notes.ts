/**
 * Notes of sources and AI layers: a small, safe subset of Markdown.
 *
 *   # Heading, ## Heading, ### Heading
 *   paragraphs separated by a blank line; a single line break stays a break
 *   - bullet lists
 *   > citation (e.g. "ČSN EN 1993-1-1, čl. 6.2.5")
 *   ![caption](layers/<id>/images/fig1.png)   a figure on its own line
 *   [text](https://…)   links (http and https only)
 *   **bold**, *italic*, `code`
 *   ``` lines shown as written ```   (e.g. proposed lines of a calculation)
 *   ```kalk formulas ```    lines of the calculation language, typeset as in the sheet
 *     - an indented bullet is a second level
 *   | a | b |  with a |---|---:| line below: a table (colons align the column)
 *   ---   alone on a line: a dividing line
 *   ## Heading {#T3}   a theory section with its id (shown as a badge)
 *
 * Everything else is shown as text; no HTML from the notes is ever passed on.
 */

import { defaultRegistry, parse } from '@kalketa/core';
import { formulaNode, type FormulaOptions } from './formula.js';
import { esc, mo, nameNode, paren, row, toMathML, type MathNode } from './math.js';

export interface NotesOptions {
  /** Resolves an image path inside the sheet to a URL (e.g. a data: URI). */
  readonly resolveFile?: (path: string) => string | undefined;
}

type Block =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: string[] }
  | { readonly kind: 'list'; readonly items: { readonly text: string; readonly sub: boolean }[] }
  | { readonly kind: 'code'; readonly lines: string[]; readonly lang?: string }
  | { readonly kind: 'table'; readonly head: string[]; readonly align: Align[]; readonly rows: string[][] }
  | { readonly kind: 'rule' }
  | { readonly kind: 'quote'; readonly lines: string[] }
  | { readonly kind: 'figure'; readonly caption: string; readonly path: string };

type Align = 'left' | 'right' | 'center';

/** |---|:---:|---:| under the head of a table. */
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/** Cells of a table row; "\|" is a pipe inside a cell. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*(?:\{[^}]*\})?\s*$/;

export function notesHtml(text: string, options: NotesOptions = {}): string {
  return parseBlocks(text)
    .map((block) => {
      switch (block.kind) {
        case 'heading': {
          const level = Math.min(block.level + 1, 6);
          // {#T3} after a heading is the id of a theory section: shown as a badge, cited as [T3].
          const id = /\s*\{#(T\d+)\}$/.exec(block.text);
          const title = id ? block.text.slice(0, id.index) : block.text;
          return `<h${level}>${inline(title)}${id ? ` <span class="tid">${id[1]}</span>` : ''}</h${level}>`;
        }
        case 'paragraph':
          return `<p>${block.lines.map(inline).join('<br>')}</p>`;
        case 'list':
          return `<ul>${block.items.map((item) => `<li${item.sub ? ' class="sub"' : ''}>${inline(item.text)}</li>`).join('')}</ul>`;
        case 'code':
          return block.lang === 'kalk' ? kalkHtml(block.lines) : `<pre class="code"><code>${esc(block.lines.join('\n'))}</code></pre>`;
        case 'rule':
          return '<hr>';
        case 'table': {
          // Only the three fixed alignments ever reach the style attribute.
          const cell = (tag: string, text: string, i: number) => `<${tag}${block.align[i] && block.align[i] !== 'left' ? ` style="text-align:${block.align[i]}"` : ''}>${inline(text)}</${tag}>`;
          const head = `<tr>${block.head.map((h, i) => cell('th', h, i)).join('')}</tr>`;
          const rows = block.rows.map((r) => `<tr>${block.head.map((_, i) => cell('td', r[i] ?? '', i)).join('')}</tr>`).join('');
          return `<table class="md"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
        }
        case 'quote':
          return `<blockquote class="citation">${block.lines.map(inline).join('<br>')}</blockquote>`;
        case 'figure': {
          const src = options.resolveFile?.(block.path);
          const image = src ? `<img src="${esc(src)}" alt="${esc(block.caption)}">` : `<div class="missing-image">${esc(block.path)}</div>`;
          return `<figure>${image}${block.caption ? `<figcaption>${inline(block.caption)}</figcaption>` : ''}</figure>`;
        }
      }
    })
    .join('\n');
}

/** Image paths used by notes, so the editor can keep or clean up files. */
export function notesImages(text: string): string[] {
  return parseBlocks(text).flatMap((b) => (b.kind === 'figure' ? [b.path] : []));
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  const flush = () => {
    if (current) blocks.push(current);
    current = undefined;
  };

  let code: string[] | undefined;
  let lang: string | undefined;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]!;
    const line = raw.trimEnd();
    // ``` opens and closes a block shown as written (e.g. proposed lines of a calculation).
    if (/^\s*```/.test(line)) {
      if (code) {
        blocks.push({ kind: 'code', lines: code, ...(lang ? { lang } : {}) });
        code = undefined;
      } else {
        flush();
        code = [];
        lang = /^\s*```\s*([\w-]+)/.exec(line)?.[1]?.toLowerCase();
      }
      continue;
    }
    if (code) {
      code.push(raw);
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    // A table: a row of cells with a |---| line under it, then rows until one is not a row.
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[n + 1] ?? '')) {
      flush();
      const head = cells(line);
      const align = cells(lines[n + 1]!).map((c): Align => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'));
      const rows: string[][] = [];
      n += 2;
      while (n < lines.length && TABLE_ROW.test(lines[n]!)) rows.push(cells(lines[n++]!));
      n--;
      blocks.push({ kind: 'table', head, align, rows });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const figure = FIGURE.exec(line.trim());
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! });
    } else if (figure) {
      flush();
      blocks.push({ kind: 'figure', caption: figure[1]!, path: figure[2]! });
    } else if (bullet) {
      if (current?.kind !== 'list') flush();
      current ??= { kind: 'list', items: [] };
      // An indented item belongs under the one above it.
      (current as Extract<Block, { kind: 'list' }>).items.push({ text: bullet[2]!, sub: bullet[1]!.length >= 2 });
    } else if (quote) {
      if (current?.kind !== 'quote') flush();
      current ??= { kind: 'quote', lines: [] };
      (current as Extract<Block, { kind: 'quote' }>).lines.push(quote[1]!);
    } else {
      if (current?.kind !== 'paragraph') flush();
      current ??= { kind: 'paragraph', lines: [] };
      (current as Extract<Block, { kind: 'paragraph' }>).lines.push(line.trim());
    }
  }
  flush();
  // A block left open runs to the end (e.g. an answer still being written).
  if (code) blocks.push({ kind: 'code', lines: code, ...(lang ? { lang } : {}) });
  return blocks;
}

const KALK_OPTIONS: FormulaOptions = { literal: (v) => String(v), argumentSeparator: ',', booleans: { true: 'true', false: 'false' } };

/**
 * One line of the calculation language typeset as a formula, symbolically (nothing
 * is computed): "w := 5·q·L⁴/(384·E·I)" as w = 5·q·L⁴ over 384·E·I. A line the
 * language does not read stays as written, marked.
 */
export function kalkFormula(line: string): { readonly html: string; readonly ok: boolean } {
  const parsed = parse(line, { isUnit: (name) => defaultRegistry.isUnit(name) });
  const s = parsed.sheet.statements.find((x) => x.kind !== 'comment');
  const bad = { html: `<code class="kalk-bad">${esc(line)}</code>`, ok: false };
  if (!s || parsed.diagnostics.some((d) => d.severity === 'error')) return bad;
  let node: MathNode | undefined;
  if (s.kind === 'definition') {
    const name = s.params && s.params.length > 0 ? row(nameNode(s.name), paren(row(...s.params.flatMap((p, i) => (i > 0 ? [mo(','), nameNode(p.name)] : [nameNode(p.name)]))))) : nameNode(s.name);
    node = row(name, mo('='), formulaNode(s.expr, KALK_OPTIONS));
  } else if (s.kind === 'display' || s.kind === 'check') node = formulaNode(s.expr, KALK_OPTIONS);
  if (!node) return bad;
  const label = s.kind === 'check' && s.label ? `<span class="kalk-label">${esc(s.label)}:</span> ` : '';
  return { html: `${label}${toMathML(node, 'block')}`, ok: true };
}

function kalkHtml(lines: readonly string[]): string {
  // A line starting with ' is a note to the formulas ("' AI wrote this from a picture").
  const formulas = lines
    .filter((l) => l.trim() !== '')
    .map((l) => (l.trim().startsWith("'") ? `<div class="kalk-note">${esc(l.trim().slice(1).trim())}</div>` : `<div class="kalk-formula" title="${esc(l.trim())}">${kalkFormula(l.trim()).html}</div>`));
  return `<div class="kalk">${formulas.join('')}</div>`;
}

/** Inline markup: `code` as written, then links, bold and italic on the rest (escaped first). */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? `<code>${esc(part.slice(1, -1))}</code>` : marks(part)))
    .join('');
}

function marks(text: string): string {
  // "\*" is a star as text (the word-processor editor writes such escapes): as an entity, no markup can take it.
  let html = esc(text).replace(/\\([\\`*[\]|#>_!-])/g, (_, c: string) => `&#${c.charCodeAt(0)};`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label: string, url: string) => `<a href="${url}">${label}</a>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return html;
}

/** Styles of notes in print and in the editor. */
export const NOTES_CSS = `.notes { font-size: 10.5pt; line-height: 1.5; }
.notes h2, .notes h3, .notes h4 { margin: 4mm 0 1.5mm; }
.notes p { margin: 1.5mm 0; }
.notes ul { margin: 1.5mm 0; padding-left: 6mm; }
.notes table.md { border-collapse: collapse; margin: 2mm 0; font-size: 9.5pt; }
.notes table.md th, .notes table.md td { border: 1px solid #c5ccd5; padding: 0.8mm 2mm; }
.notes table.md th { background: #f1f3f6; }
.notes hr { border: none; border-top: 1px solid #c5ccd5; margin: 3mm 0; }
.notes .tid { font-size: 0.7em; font-weight: normal; color: #6b7480; border: 1px solid #c5ccd5; border-radius: 3px; padding: 0 1.2mm; vertical-align: middle; }
.notes li.sub { margin-left: 5mm; list-style-type: circle; }
.notes code { font-family: Consolas, 'Courier New', monospace; font-size: 0.95em; }
.notes .kalk { margin: 2mm 0; }
.notes .kalk-formula { margin: 1mm 0; }
.notes .kalk-formula math { display: inline-block; }
.notes .kalk-label { color: #555; font-size: 0.95em; }
.notes code.kalk-bad { color: #a12828; }
.notes .kalk-note { color: #5a3fa6; font-size: 0.9em; }
.notes pre.code { margin: 2mm 0; padding: 1.5mm 2mm; background: #f3f5f8; border: 1px solid #d5dae1; white-space: pre-wrap; }
.notes blockquote.citation { margin: 2mm 0; padding: 1mm 0 1mm 3mm; border-left: 1mm solid #9aa6b4; color: #333; font-style: italic; }
.notes figure { margin: 3mm 0; break-inside: avoid; }
.notes figure img { max-width: 100%; max-height: 110mm; }
.notes figcaption { font-size: 9pt; color: #555; margin-top: 1mm; }
.notes .missing-image { padding: 4mm; border: 1px dashed #c62828; color: #c62828; font-size: 9pt; }`;
