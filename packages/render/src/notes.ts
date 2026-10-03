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
 *     - an indented bullet is a second level
 *
 * Everything else is shown as text; no HTML from the notes is ever passed on.
 */

import { esc } from './math.js';

export interface NotesOptions {
  /** Resolves an image path inside the sheet to a URL (e.g. a data: URI). */
  readonly resolveFile?: (path: string) => string | undefined;
}

type Block =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'paragraph'; readonly lines: string[] }
  | { readonly kind: 'list'; readonly items: { readonly text: string; readonly sub: boolean }[] }
  | { readonly kind: 'code'; readonly lines: string[] }
  | { readonly kind: 'quote'; readonly lines: string[] }
  | { readonly kind: 'figure'; readonly caption: string; readonly path: string };

const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*(?:\{[^}]*\})?\s*$/;

export function notesHtml(text: string, options: NotesOptions = {}): string {
  return parseBlocks(text)
    .map((block) => {
      switch (block.kind) {
        case 'heading': {
          const level = Math.min(block.level + 1, 6);
          return `<h${level}>${inline(block.text)}</h${level}>`;
        }
        case 'paragraph':
          return `<p>${block.lines.map(inline).join('<br>')}</p>`;
        case 'list':
          return `<ul>${block.items.map((item) => `<li${item.sub ? ' class="sub"' : ''}>${inline(item.text)}</li>`).join('')}</ul>`;
        case 'code':
          return `<pre class="code"><code>${esc(block.lines.join('\n'))}</code></pre>`;
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
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    // ``` opens and closes a block shown as written (e.g. proposed lines of a calculation).
    if (/^\s*```/.test(line)) {
      if (code) {
        blocks.push({ kind: 'code', lines: code });
        code = undefined;
      } else {
        flush();
        code = [];
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
  if (code) blocks.push({ kind: 'code', lines: code });
  return blocks;
}

/** Inline markup: `code` as written, then links, bold and italic on the rest (escaped first). */
function inline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? `<code>${esc(part.slice(1, -1))}</code>` : marks(part)))
    .join('');
}

function marks(text: string): string {
  let html = esc(text);
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
.notes li.sub { margin-left: 5mm; list-style-type: circle; }
.notes code { font-family: Consolas, 'Courier New', monospace; font-size: 0.95em; }
.notes pre.code { margin: 2mm 0; padding: 1.5mm 2mm; background: #f3f5f8; border: 1px solid #d5dae1; white-space: pre-wrap; }
.notes blockquote.citation { margin: 2mm 0; padding: 1mm 0 1mm 3mm; border-left: 1mm solid #9aa6b4; color: #333; font-style: italic; }
.notes figure { margin: 3mm 0; break-inside: avoid; }
.notes figure img { max-width: 100%; max-height: 110mm; }
.notes figcaption { font-size: 9pt; color: #555; margin-top: 1mm; }
.notes .missing-image { padding: 4mm; border: 1px dashed #c62828; color: #c62828; font-size: 9pt; }`;
