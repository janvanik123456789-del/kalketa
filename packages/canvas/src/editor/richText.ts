/**
 * A text of the canvas between its runs (bold, italic, underlined, coloured parts)
 * and the field it is written in: the HTML the field shows, and the runs read back.
 */

import type { TextRun } from '../scene.js';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lines of runs as the field shows them: a <div> per line, the formats as <b>, <i>, <u>, <font>. */
export function htmlOf(lines: readonly (readonly TextRun[])[]): string {
  return lines
    .map((line) => {
      const inner = line
        .map((r) => {
          let html = esc(r.text);
          if (r.underline) html = `<u>${html}</u>`;
          if (r.italic) html = `<i>${html}</i>`;
          if (r.bold) html = `<b>${html}</b>`;
          if (r.color) html = `<font color="${esc(r.color)}">${html}</font>`;
          return html;
        })
        .join('');
      return `<div>${inner || '<br>'}</div>`;
    })
    .join('');
}

/** The minimal shape of a node read back: a DOM node in the editor, a plain object in tests. */
export interface RichNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly textContent: string | null;
  readonly childNodes: ArrayLike<RichNode>;
  getAttribute?(name: string): string | null;
  readonly style?: { readonly fontWeight?: string; readonly fontStyle?: string; readonly textDecoration?: string; readonly textDecorationLine?: string; readonly color?: string };
}

/**
 * The lines of runs of a field written in: a <div> or <p> starts a line, <br> breaks one;
 * <b>/<strong>, <i>/<em>, <u> and <font color> (or the same in a style) give the formats.
 */
export function runsOf(root: RichNode): TextRun[][] {
  const lines: TextRun[][] = [[]];
  const push = (text: string, format: Omit<TextRun, 'text'>) => {
    if (!text) return;
    const line = lines[lines.length - 1]!;
    const last = line[line.length - 1];
    const same = last && !!last.bold === !!format.bold && !!last.italic === !!format.italic && !!last.underline === !!format.underline && last.color === format.color;
    if (same) line[line.length - 1] = { ...last, text: last.text + text };
    else line.push({ text, ...(format.bold ? { bold: true } : {}), ...(format.italic ? { italic: true } : {}), ...(format.underline ? { underline: true } : {}), ...(format.color ? { color: format.color } : {}) });
  };
  const walk = (node: RichNode, format: Omit<TextRun, 'text'>, top: boolean) => {
    if (node.nodeType === 3) return push((node.textContent ?? '').replace(/ /g, ' '), format);
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase();
    if (name === 'BR') {
      lines.push([]);
      return;
    }
    const block = name === 'DIV' || name === 'P';
    // A block starts a line of its own, unless it is the first thing written.
    if (block && !top && lines[lines.length - 1]!.length > 0) lines.push([]);
    const style = node.style ?? {};
    const decoration = `${style.textDecoration ?? ''} ${style.textDecorationLine ?? ''}`;
    const colour = (name === 'FONT' ? node.getAttribute?.('color') : undefined) || style.color || undefined;
    const next = {
      ...format,
      ...(name === 'B' || name === 'STRONG' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600 ? { bold: true } : {}),
      ...(name === 'I' || name === 'EM' || style.fontStyle === 'italic' ? { italic: true } : {}),
      ...(name === 'U' || decoration.includes('underline') ? { underline: true } : {}),
      ...(colour ? { color: colour } : {}),
    };
    const children = Array.from(node.childNodes);
    children.forEach((child, i) => {
      // A <br> that only keeps an empty block open is no line of its own.
      if (block && child.nodeName.toUpperCase() === 'BR' && i === children.length - 1) return;
      walk(child, next, false);
    });
    // A block that ended a line: what follows starts the next one.
    if (block && !top) lines.push([]);
  };
  Array.from(root.childNodes).forEach((child) => walk(child, {}, false));
  // Lines left empty at the end by the last block are no lines.
  while (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
  return lines;
}
