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

import { defaultRegistry, evaluateSheet, formatExpr, fromDecimalComma, parse, type Expr, type Statement } from '@kalketa/core';
import { formatNumber, t, type Catalog } from '@kalketa/i18n';
import { formulaNode, type FormulaOptions } from './formula.js';
import { esc, mo, nameNode, paren, row, toMathML, type MathNode } from './math.js';
import katex from 'katex';

export interface NotesOptions {
  /** Resolves an image path inside the sheet to a URL (e.g. a data: URI). */
  readonly resolveFile?: (path: string) => string | undefined;
  /** For the words of the check of derivations in ```kalk blocks (without it, signs only). */
  readonly catalog?: Catalog;
}

type Block =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: string[] }
  | { readonly kind: 'list'; readonly items: { readonly text: string; readonly sub: boolean }[] }
  | { readonly kind: 'code'; readonly lines: string[]; readonly lang?: string }
  | { readonly kind: 'table'; readonly head: string[]; readonly align: Align[]; readonly rows: string[][] }
  | { readonly kind: 'rule' }
  | { readonly kind: 'quote'; readonly lines: string[] }
  | { readonly kind: 'figure'; readonly caption: string; readonly path: string; readonly description?: string; readonly place: FigurePlace };

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

const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*(?:\{([^}]*)\})?\s*$/;

/** What a figure shows, written for search and readers of the screen: {alt="průběh momentu"}. */
export function figureDescription(attributes: string | undefined): string | undefined {
  return /(?:^|\s)alt="([^"]*)"/.exec(attributes ?? '')?.[1];
}

/** Where a figure stands: {width=60% align=center}, its width a share of the text width. */
export interface FigurePlace {
  readonly width?: number;
  readonly align?: 'left' | 'center' | 'right';
}

export function figurePlace(attributes: string | undefined): FigurePlace {
  const text = (attributes ?? '').replace(/"[^"]*"/g, '""');
  const width = Number(/(?:^|\s)width=(\d+(?:\.\d+)?)%/.exec(text)?.[1]);
  const align = /(?:^|\s)align=(left|center|right)\b/.exec(text)?.[1] as FigurePlace['align'];
  return { ...(width > 0 && width <= 100 ? { width } : {}), ...(align ? { align } : {}) };
}

/** The attributes of a figure ({…}, braces included) with its place changed; empty when nothing is left. */
export function withFigurePlace(attributes: string | undefined, place: FigurePlace): string {
  const inner = (attributes ?? '').replace(/^\{|\}$/g, '');
  const kept = (inner.match(/\S+="[^"]*"|\S+/g) ?? []).filter((a) => !/^(width|align)=/.test(a));
  const all = [...kept, ...(place.width !== undefined ? [`width=${Math.round(place.width)}%`] : []), ...(place.align ? [`align=${place.align}`] : [])];
  return all.length > 0 ? `{${all.join(' ')}}` : '';
}

/** The style of a placed figure: its width, and the margins that align it. */
export function figureStyle(place: FigurePlace): string {
  return [
    ...(place.width !== undefined ? [`width:${place.width}%`] : []),
    ...(place.align === 'center' ? ['margin-left:auto', 'margin-right:auto'] : place.align === 'right' ? ['margin-left:auto', 'margin-right:0'] : []),
  ].join(';');
}

export function notesHtml(text: string, options: NotesOptions = {}): string {
  return parseBlocks(text)
    .map((block, i, all) => {
      switch (block.kind) {
        case 'heading': {
          const level = Math.min(block.level + 1, 6);
          // {#T3} after a heading is the id of a theory section: shown as a badge, cited as [T3].
          const id = /\s*\{#(T\d+)\}$/.exec(block.text);
          const title = id ? block.text.slice(0, id.index) : block.text;
          return `<h${level}>${inline(title)}${id ? ` <span class="tid">${id[1]}</span>` : ''}</h${level}>`;
        }
        case 'paragraph':
          return `<p>${mathJoined(block.lines).map(inline).join('<br>')}</p>`;
        case 'list':
          return `<ul>${block.items.map((item) => `<li${item.sub ? ' class="sub"' : ''}>${inline(item.text)}</li>`).join('')}</ul>`;
        case 'code':
          return block.lang === 'kalk' ? kalkHtml(block.lines, options.catalog) : `<pre class="code"><code>${esc(block.lines.join('\n'))}</code></pre>`;
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
          const alt = block.description ?? block.caption;
          const image = src ? `<img src="${esc(src)}" alt="${esc(alt)}"${block.description ? ` title="${esc(block.description)}"` : ''}>` : `<div class="missing-image">${esc(block.path)}</div>`;
          const style = figureStyle(block.place);
          const figure = `<figure${style ? ` class="placed" style="${style}"` : ''}>${image}${block.caption ? `<figcaption>${inline(block.caption)}</figcaption>` : ''}</figure>`;
          // The cut-out of a formula whose formula is confirmed below: the formula stands for it, the cut-out a click away.
          const next = all[i + 1];
          if (/\/vzorec-[^/]*$/.test(block.path) && next?.kind === 'code' && next.lang === 'kalk' && kalkConfirmed(next.lines)) {
            return `<details class="cutout"><summary>${esc(options.catalog ? t(options.catalog, 'kalk.cutout') : '▸')}${block.caption ? ` · ${inline(block.caption)}` : ''}</summary>${figure}</details>`;
          }
          return figure;
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
      const description = figureDescription(figure[3]);
      blocks.push({ kind: 'figure', caption: figure[1]!, path: figure[2]!, ...(description ? { description } : {}), place: figurePlace(figure[3]) });
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

/** Numbers as the user's language writes them (0,6 in Czech), when it is known. */
function kalkOptions(catalog?: Catalog): FormulaOptions {
  if (!catalog || !formatNumber(1.5, catalog).includes(',')) return KALK_OPTIONS;
  return { ...KALK_OPTIONS, literal: (v) => formatNumber(v, catalog, { digits: 15 }), argumentSeparator: ';' };
}

/** A line written with decimal commas, as the book prints it (0,6·σ_Kt), read as the language has it. */
function readable(line: string): string {
  return /\d,\d/.test(line) ? fromDecimalComma(line) : line;
}

/**
 * One line of the calculation language typeset as a formula, symbolically (nothing
 * is computed): "w := 5·q·L⁴/(384·E·I)" as w = 5·q·L⁴ over 384·E·I. A line the
 * language does not read stays as written, marked.
 */
export function kalkFormula(line: string, catalog?: Catalog): { readonly html: string; readonly ok: boolean } {
  const parsed = parse(readable(line), { isUnit: (name) => defaultRegistry.isUnit(name) });
  const s = parsed.sheet.statements.find((x) => x.kind !== 'comment');
  const bad = { html: `<code class="kalk-bad">${esc(line)}</code>`, ok: false };
  if (!s || parsed.diagnostics.some((d) => d.severity === 'error')) return bad;
  return kalkStatement(s, line, catalog);
}

/** A statement of a ```kalk block typeset: a derivation with all its members, y = a = b = c. */
function kalkStatement(s: Statement, line: string, catalog?: Catalog): { readonly html: string; readonly ok: boolean } {
  const bad = { html: `<code class="kalk-bad">${esc(line)}</code>`, ok: false };
  const node = statementNode(s, kalkOptions(catalog));
  if (!node) return bad;
  const label = s.kind === 'check' && s.label ? `<span class="kalk-label">${esc(s.label)}:</span> ` : '';
  return { html: `${label}${toMathML(node, 'block')}`, ok: true };
}

/** A statement of a ```kalk block as a row of math: a definition, a derivation, a formula. */
function statementNode(s: Statement, options: FormulaOptions): MathNode | undefined {
  // Between the members = or, where the step is equal when rounded, ≐.
  const approx = s.kind === 'definition' || s.kind === 'derive' ? (s.approx ?? []) : [];
  const chain = (members: readonly MathNode[]) => members.flatMap((m, i) => (i > 0 ? [mo(approx.includes(i - 1) ? '≐' : '='), m] : [m]));
  if (s.kind === 'definition') {
    const name = s.params && s.params.length > 0 ? row(nameNode(s.name), paren(row(...s.params.flatMap((p, i) => (i > 0 ? [mo(','), nameNode(p.name)] : [nameNode(p.name)]))))) : nameNode(s.name);
    return row(name, mo('='), ...chain((s.derivation ?? [s.expr]).map((m) => formulaNode(m, options))));
  } else if (s.kind === 'derive') return row(...chain(s.members.map((m) => formulaNode(m, options))));
  else if (s.kind === 'display' || s.kind === 'check') return formulaNode(s.expr, options);
  return undefined;
}

/** A line of a ```kalk block: a note, or a formula typeset with the check of its derivation. */
export interface KalkLine {
  readonly note?: string;
  readonly source: string;
  readonly html: string;
  /** The check of a derivation: ok, or which step does not hold and why. */
  readonly check?: { readonly ok: boolean; readonly text: string };
  /** The number the book gave the formula ({eq=32}): shown at the right, (32). */
  readonly number?: string;
}

/** The note the AI leaves on a formula it read from a picture, until the user confirms it. */
export function isAiNote(line: string): boolean {
  return /^'\s*✦/.test(line.trim()) || /^'.*\bAI \(/.test(line.trim());
}

/** A block of formulas with no note of the AI left: confirmed, shown as the book prints it. */
export function kalkConfirmed(lines: readonly string[]): boolean {
  return lines.some((l) => l.trim() !== '' && !l.trim().startsWith("'")) && !lines.some(isAiNote);
}

/**
 * The lines of a ```kalk block, typeset, the block checked as one: a symbol it introduces
 * (derive M_mp := …) holds for the lines below. Every derivation is checked step by step,
 * so a formula the model read from a picture wrongly shows; a step may also be a
 * substitution of another relation of the book, which the check cannot know.
 */
export function kalkLines(lines: readonly string[], catalog?: Catalog): KalkLine[] {
  const shown = lines.map((l) => l.trim()).filter((l) => l !== '');
  const formulas = shown.filter((l) => !l.startsWith("'")).map(piecesOf);
  const result = formulas.length > 0 ? evaluateSheet(formulas.flat().map((p) => readable(p.text)).join('\n')) : undefined;
  const byLine = new Map(result?.statements.map((r) => [r.statement.span.line, r] as const) ?? []);
  const say = (key: Parameters<typeof t>[1], step?: number, sign = '') => (catalog ? t(catalog, key, step !== undefined ? { step: String(step) } : {}) : sign);
  let at = 0;
  let formula = 0;
  return shown.map((l): KalkLine => {
    if (l.startsWith("'")) return { note: l.slice(1).trim(), source: l, html: '' };
    const pieces = formulas[formula++]!;
    const rows = pieces.map(() => byLine.get(++at));
    const readOk = rows.every((r) => r && !r.diagnostics.some((d) => d.code === 'E-SYNTAX'));
    const typeset =
      pieces.length === 1 && !pieces[0]!.bound
        ? readOk ? kalkStatement(rows[0]!.statement, l, catalog) : kalkFormula(l, catalog)
        : readOk ? kalkPieces(pieces, rows.map((r) => r!.statement), l, catalog) : { html: `<code class="kalk-bad">${esc(l)}</code>`, ok: false };
    const eq = rows.at(-1)?.statement.format?.eq;
    const own = { source: l, html: typeset.html, ...(typeof eq === 'string' && /^\d/.test(eq) ? { number: eq } : {}) };
    // The steps of all the derivations of the line, numbered through it.
    const checked = rows.map((r) => (r ? stepVerdicts(r) : undefined)).filter((v) => v !== undefined);
    if (checked.length === 0) return own;
    let offset = 0;
    for (const c of checked) {
      const wrong = c.verdicts.findIndex((v) => v === false);
      if (wrong >= 0) {
        const key = c.problems[wrong] === 'units' ? 'kalk.stepUnits' : c.problems[wrong] === 'unverified' ? 'kalk.stepUnverified' : 'kalk.stepDiffers';
        return { ...own, check: { ok: false, text: say(key, offset + wrong + 1, `⚠ ${offset + wrong + 1}`) } };
      }
      offset += c.verdicts.length;
    }
    const putIn = checked.some((c) => c.verdicts.includes('put-in'));
    return { ...own, check: { ok: true, text: say(putIn ? 'kalk.derivedWithValues' : 'kalk.derived', undefined, '✓') } };
  });
}

/**
 * A formula line as the language reads it: the parts of A ⇒ B, and a bound followed
 * by a chain (d ≥ √(4·S/π) = √(4·23,53/π) ≐ 5,5 mm) as the bound and the chain derived.
 */
interface Piece {
  readonly text: string;
  /** The bound the chain starts with: "d >= sqrt(4·S/π)". */
  readonly bound?: string;
}

function piecesOf(line: string): Piece[] {
  return line.split(/\s*⇒\s*/).map((part): Piece => {
    const bound = /^(.+?)\s*(<=|>=|≤|≥|<|>)\s*(.+)$/.exec(part);
    if (!bound || !/==|≐|≈/.test(bound[3]!)) return { text: part };
    const first = bound[3]!.split(/\s*(?:==|≐|≈)\s*/)[0]!;
    return { text: `derive ${bound[3]}`, bound: `${bound[1]} ${bound[2]} ${first}` };
  });
}

/** The pieces of a line typeset in one row, joined by ⇒. */
function kalkPieces(pieces: readonly Piece[], statements: readonly Statement[], line: string, catalog?: Catalog): { readonly html: string; readonly ok: boolean } {
  const bad = { html: `<code class="kalk-bad">${esc(line)}</code>`, ok: false };
  const options = kalkOptions(catalog);
  const nodes: MathNode[] = [];
  for (const [i, piece] of pieces.entries()) {
    const s = statements[i]!;
    let node: MathNode | undefined;
    if (piece.bound && s.kind === 'derive') {
      const parsed = parse(readable(piece.bound), { isUnit: (name) => defaultRegistry.isUnit(name) });
      const bound = parsed.sheet.statements.find((x) => x.kind !== 'comment');
      if (!bound || (bound.kind !== 'display' && bound.kind !== 'check') || parsed.diagnostics.some((d) => d.severity === 'error')) return bad;
      const approx = s.approx ?? [];
      node = row(formulaNode(bound.expr, options), ...s.members.slice(1).flatMap((m, k) => [mo(approx.includes(k) ? '≐' : '='), formulaNode(m, options)]));
    } else node = statementNode(s, options);
    if (!node) return bad;
    nodes.push(...(i > 0 ? [mo('⇒')] : []), node);
  }
  return { html: toMathML(row(...nodes), 'block'), ok: true };
}

/** How each step of a derivation stands in the sources: holds, values put in, or not. */
function stepVerdicts(r: ReturnType<typeof evaluateSheet>['statements'][number]): { verdicts: (boolean | 'put-in')[]; problems: (string | undefined)[] } | undefined {
  const steps = r.derivation;
  if (!steps || steps.length === 0) return undefined;
  // A worked example of a book: values put in for the symbols (not to be checked here, the
  // sources have no values), and a calculation of numbers whose unit the book writes at its
  // result only (0,6·170·1/1,5 = 68 MPa): checked by its numbers.
  const members = r.statement.kind === 'definition' ? (r.statement.derivation ?? []) : r.statement.kind === 'derive' ? r.statement.members : [];
  const verdicts = steps.map((s, i): boolean | 'put-in' => {
    if (s.ok) return true;
    const [a, b] = [members[i], members[i + 1]];
    if (!a || !b) return false;
    if (readsSymbols(a) && !readsSymbols(b)) return 'put-in';
    if (!readsSymbols(a) && !readsSymbols(b)) return sameNumber(a, b);
    return false;
  });
  // Numbers that give another number differ, whatever unit only one of them writes.
  const problems = steps.map((s, i) => (members[i] && members[i + 1] && !readsSymbols(members[i]!) && !readsSymbols(members[i + 1]!) ? 'differs' : s.problem));
  return { verdicts, problems };
}

/** Whether a member of a chain reads symbols (names, not only numbers and units). */
function readsSymbols(expr: Expr): boolean {
  // Through every kind of node (a root, a power, a call): any name inside counts.
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(walk);
    if (!node || typeof node !== 'object') return false;
    // π is a number of the book, not a symbol.
    if ((node as { kind?: unknown }).kind === 'variable') return (node as { name?: unknown }).name !== 'π';
    return Object.entries(node).some(([key, value]) => key !== 'span' && walk(value));
  };
  return walk(expr);
}

/** Two members of numbers only with the same number, whatever unit only one of them writes. */
function sameNumber(a: Expr, b: Expr): boolean {
  const value = (e: Expr) => evaluateSheet(`x := ${formatExpr(e)}`).statements[0]?.display?.value;
  const [x, y] = [value(a), value(b)];
  // Books round what they print (23,53 for 23,529…): half a per cent apart is the same number.
  return x !== undefined && y !== undefined && Math.abs(x - y) <= 0.005 * Math.max(Math.abs(x), Math.abs(y));
}

function kalkHtml(lines: readonly string[], catalog?: Catalog): string {
  // A line starting with ' is a note to the formulas ("' AI wrote this from a picture").
  // Confirmed (no note of the AI left), the formulas stand as the book prints them: centred, numbered.
  const confirmed = kalkConfirmed(lines);
  const html = kalkLines(lines, catalog).map((l) =>
    l.note !== undefined
      ? confirmed
        ? ''
        : `<div class="kalk-note">${esc(l.note)}</div>`
      : `<div class="kalk-formula" title="${esc(l.source)}">${l.html}${l.number ? `<span class="kalk-number">(${esc(l.number)})</span>` : ''}${l.check && !(confirmed && l.check.ok) ? `<span class="kalk-check ${l.check.ok ? 'ok' : 'bad'}">${esc(l.check.text)}</span>` : ''}</div>`,
  );
  return `<div class="kalk${confirmed ? ' confirmed' : ''}">${html.join('')}</div>`;
}

/** Inline markup: `code` as written, then links, bold and italic on the rest (escaped first). */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? `<code>${esc(part.slice(1, -1))}</code>` : withMath(part)))
    .join('');
}

/**
 * LaTeX math as models and books write it, typeset by KaTeX as MathML (as all formulas here):
 * $$…$$ and \[…\] on a line of their own, $…$ and \(…\) among words. A dollar of a price
 * ($5 and $10) is no formula: after the opening one stands no space, before the closing one
 * no space and after it no digit.
 */
const TEX = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=\S)([^$\n]*?\S)\$(?!\d)/g;

function withMath(text: string): string {
  const formulas: string[] = [];
  // Set aside while the marks are made: the source kept in the formula holds "_" and "*" too.
  const marked = marks(
    text.replace(TEX, (whole: string, display?: string, block?: string, among?: string, inText?: string) => {
      // "\[T3\]" is how the word-processor editor writes a bracket as text: only math in brackets is a formula.
      const bracketed = block ?? among;
      if (bracketed !== undefined && !/\\[A-Za-z]|[\^_=]/.test(bracketed)) return whole;
      formulas.push(texHtml((display ?? block ?? among ?? inText)!, display !== undefined || block !== undefined));
      return `\u0000${formulas.length - 1}\u0000`;
    }),
  );
  return marked.replace(/\u0000(\d+)\u0000/g, (_, i: string) => formulas[Number(i)]!);
}

function texHtml(tex: string, display: boolean): string {
  // No commands that reach outside the formula (\href, \htmlClass): trust stays off.
  return katex.renderToString(tex, { output: 'mathml', displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 200 });
}

/** Lines of a paragraph with a formula over several of them ($$ … $$) made one. */
function mathJoined(lines: readonly string[]): string[] {
  const out: string[] = [];
  let open: string[] | undefined;
  for (const line of lines) {
    const parts = open ? [...open, line] : [line];
    const joined = parts.join(' ');
    const unclosed = (joined.match(/\$\$/g) ?? []).length % 2 === 1 || (joined.match(/\\\[/g) ?? []).length > (joined.match(/\\\]/g) ?? []).length;
    if (unclosed) open = parts;
    else {
      out.push(joined);
      open = undefined;
    }
  }
  if (open) out.push(...open);
  return out;
}

function marks(text: string): string {
  // "\*" is a star as text (the word-processor editor writes such escapes): as an entity, no markup can take it.
  let html = esc(text).replace(/\\([\\`*[\]|#>_!-])/g, (_, c: string) => `&#${c.charCodeAt(0)};`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label: string, url: string) => `<a href="${url}">${label}</a>`);
  // σ_Kt: the index of the letter set below, as in a formula (not inside a link, whose address may hold "_").
  html = html.split(/(<a [^>]*>.*?<\/a>)/).map((part) => (part.startsWith('<a ') ? part : part.replace(/(\p{L})_([\p{L}\p{N}]+(?:[,_][\p{L}\p{N}]+)*)/gu, (_, letter: string, index: string) => `${letter}<sub>${index.replace(/_/g, ',')}</sub>`))).join('');
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
.notes .katex math[display="block"] { margin: 2mm 0; }
.notes .katex math { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math; font-size: 1.1em; }
.notes .katex-error { color: #a12828; }
.notes .kalk { margin: 2mm 0; }
.notes .kalk-formula { margin: 1mm 0; }
.notes .kalk-formula math { display: inline-block; }
.notes .kalk-label { color: #555; font-size: 0.95em; }
.notes code.kalk-bad { color: #a12828; }
.notes .kalk-check { display: block; font-size: 0.85em; }
.notes .kalk.confirmed .kalk-formula { position: relative; text-align: center; padding: 0 12mm; }
.notes .kalk-number { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
.notes details.cutout { margin: 0; font-size: 0.85em; color: #666; }
.notes details.cutout summary { cursor: pointer; }
.notes .kalk-check.ok { color: #2e7d32; }
.notes .kalk-check.bad { color: #a15c00; }
.notes .kalk-note { color: #5a3fa6; font-size: 0.9em; }
.notes pre.code { margin: 2mm 0; padding: 1.5mm 2mm; background: #f3f5f8; border: 1px solid #d5dae1; white-space: pre-wrap; }
.notes blockquote.citation { margin: 2mm 0; padding: 1mm 0 1mm 3mm; border-left: 1mm solid #9aa6b4; color: #333; font-style: italic; }
.notes figure { margin: 3mm 0; break-inside: avoid; }
.notes figure img { max-width: 100%; max-height: 110mm; }
.notes figure.placed { display: table; }
.notes figure.placed figcaption { display: table-caption; caption-side: bottom; }
.notes figure.placed[style*="width"] img { width: 100%; max-height: none; }
.notes figcaption { font-size: 9pt; color: #555; margin-top: 1mm; }
.notes .missing-image { padding: 4mm; border: 1px dashed #c62828; color: #c62828; font-size: 9pt; }`;
