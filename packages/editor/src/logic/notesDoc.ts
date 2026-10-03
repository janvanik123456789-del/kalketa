/**
 * Notes of a sources layer between their stored form, the small Markdown
 * subset of render/notes.ts, and the document of the word-processor editor
 * (TipTap JSON). The file keeps Markdown; the user never sees it.
 *
 *   paragraph            text, with **bold**, *italic*, `code`, [links](https://…) and line breaks
 *   heading 1–3          # … ### …, with the id of a theory section: ## Title {#T3}
 *   bulletList           - item, a nested list as an indented "  - item"
 *   blockquote           > citation
 *   codeBlock            ``` lines ```
 *   horizontalRule       ---
 *   image                ![caption](layers/<id>/images/x.png) on its own line
 *   table                | a | b | over |---|---:|
 *
 * Characters that would read as markup are escaped with a backslash.
 */
import type { JSONContent } from '@tiptap/react';

type Align = 'left' | 'right' | 'center';

const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*(\{[^}]*\})?\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const HEADING = /^(#{1,3})\s+(.*?)\s*$/;
const ID = /\s*\{#(T\d+)\}$/;

// ---------------------------------------------------------------------------
// Markdown → document

export function notesToDoc(text: string): JSONContent {
  const lines = text.split(/\r?\n/);
  const content: JSONContent[] = [];
  let paragraph: string[] = [];
  let list: { text: string; sub: boolean }[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (paragraph.length) content.push({ type: 'paragraph', content: inlineLines(paragraph) });
    if (list.length) content.push(bulletList(list));
    if (quote.length) content.push({ type: 'blockquote', content: quote.map((q) => ({ type: 'paragraph', content: inline(q) })) });
    paragraph = [];
    list = [];
    quote = [];
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!.trimEnd();
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      while (++n < lines.length && !/^\s*```/.test(lines[n]!)) code.push(lines[n]!);
      content.push({ type: 'codeBlock', ...(code.length ? { content: [{ type: 'text', text: code.join('\n') }] } : {}) });
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[n + 1] ?? '')) {
      flush();
      const head = cells(line);
      const align = cells(lines[n + 1]!).map((c): Align => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'));
      const rows: string[][] = [];
      n += 2;
      while (n < lines.length && TABLE_ROW.test(lines[n]!)) rows.push(cells(lines[n++]!));
      n--;
      const cell = (type: string, text: string, i: number): JSONContent => ({
        type,
        ...(align[i] && align[i] !== 'left' ? { attrs: { align: align[i] } } : {}),
        content: [{ type: 'paragraph', content: inline(text) }],
      });
      content.push({
        type: 'table',
        content: [
          { type: 'tableRow', content: head.map((h, i) => cell('tableHeader', h, i)) },
          ...rows.map((r) => ({ type: 'tableRow', content: head.map((_, i) => cell('tableCell', r[i] ?? '', i)) })),
        ],
      });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      content.push({ type: 'horizontalRule' });
      continue;
    }
    const heading = HEADING.exec(line);
    const figure = FIGURE.exec(line.trim());
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const cite = /^\s*>\s?(.*)$/.exec(line);
    if (heading) {
      flush();
      const id = ID.exec(heading[2]!)?.[1];
      content.push({ type: 'heading', attrs: { level: heading[1]!.length, ...(id ? { tid: id } : {}) }, content: inline(heading[2]!.replace(ID, '')) });
    } else if (figure) {
      flush();
      content.push({ type: 'image', attrs: { path: figure[2], alt: unescape(figure[1]!), ...(figure[3] ? { extra: figure[3] } : {}) } });
    } else if (bullet) {
      if (paragraph.length || quote.length) flush();
      list.push({ text: bullet[2]!, sub: bullet[1]!.length >= 2 });
    } else if (cite) {
      if (paragraph.length || list.length) flush();
      quote.push(cite[1]!);
    } else {
      if (list.length || quote.length) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function bulletList(items: readonly { text: string; sub: boolean }[]): JSONContent {
  const top: JSONContent[] = [];
  for (const item of items) {
    const node: JSONContent = { type: 'listItem', content: [{ type: 'paragraph', content: inline(item.text) }] };
    const parent = top[top.length - 1];
    if (item.sub && parent) {
      const nested = parent.content!.find((c) => c.type === 'bulletList');
      if (nested) nested.content!.push(node);
      else parent.content!.push({ type: 'bulletList', content: [node] });
    } else {
      top.push(node);
    }
  }
  return { type: 'bulletList', content: top };
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

/** Lines of one paragraph: joined by line breaks. */
function inlineLines(lines: readonly string[]): JSONContent[] {
  return lines.flatMap((line, i) => [...(i > 0 ? [{ type: 'hardBreak' }] : []), ...inline(line)]);
}

/** A backslash before a character takes it as text. */
function unescape(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

type Mark = { type: string; attrs?: Record<string, unknown> };

/** Inline markup: `code`, [text](https://…), **bold**, *italic*; the rest is text. */
export function inline(text: string, marks: readonly Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  const push = (t: string, m: readonly Mark[]) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(m)) last.text += t;
    else out.push({ type: 'text', text: t, ...(m.length ? { marks: [...m] } : {}) });
  };
  let plain = '';
  for (let i = 0; i < text.length; ) {
    const rest = text.slice(i);
    const code = /^`([^`]+)`/.exec(rest);
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest);
    const bold = /^\*\*(.+?)\*\*/.exec(rest);
    const italic = /^\*([^*]+)\*/.exec(rest);
    const escaped = /^\\(.)/.exec(rest);
    const match = escaped ?? code ?? link ?? bold ?? italic;
    if (!match) {
      plain += text[i];
      i++;
      continue;
    }
    push(plain, marks);
    plain = '';
    if (match === escaped) plain += escaped![1];
    else if (match === code) push(code![1]!, [...marks, { type: 'code' }]);
    else if (match === link) out.push(...inline(link![1]!, [...marks, { type: 'link', attrs: { href: link![2] } }]));
    else if (match === bold) out.push(...inline(bold![1]!, [...marks, { type: 'bold' }]));
    else out.push(...inline(italic![1]!, [...marks, { type: 'italic' }]));
    i += match[0].length;
  }
  push(plain, marks);
  return out;
}

// ---------------------------------------------------------------------------
// Document → Markdown

export function docToNotes(doc: JSONContent): string {
  const blocks = (doc.content ?? []).map(block).filter((b) => b !== '');
  return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}

function block(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return startOfLine(inlineText(node.content));
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.['level'] ?? 1)));
      const id = typeof node.attrs?.['tid'] === 'string' && node.attrs['tid'] ? ` {#${node.attrs['tid']}}` : '';
      const title = inlineText(node.content).replace(/\n/g, ' ');
      return title.trim() || id ? `${'#'.repeat(level)} ${title}${id}` : '';
    }
    case 'bulletList':
      return listLines(node, 0).join('\n');
    case 'blockquote':
      return (node.content ?? [])
        .flatMap((p) => (p.type === 'paragraph' ? inlineText(p.content).split('\n') : [block(p)]))
        .map((l) => `> ${l}`)
        .join('\n');
    case 'codeBlock':
      return `\`\`\`\n${(node.content ?? []).map((t) => t.text ?? '').join('')}\n\`\`\``;
    case 'horizontalRule':
      return '---';
    case 'image': {
      const path = String(node.attrs?.['path'] ?? '');
      if (!path) return '';
      const caption = String(node.attrs?.['alt'] ?? '').replace(/[[\]\\]/g, (c) => `\\${c}`);
      return `![${caption}](${path})${node.attrs?.['extra'] ? String(node.attrs['extra']) : ''}`;
    }
    case 'table':
      return tableText(node);
    default:
      return inlineText(node.content);
  }
}

/** Items of a list; a nested list one level in (deeper ones stay at the second level). */
function listLines(list: JSONContent, depth: number): string[] {
  return (list.content ?? []).flatMap((item) => {
    const indent = depth > 0 ? '  ' : '';
    const parts = item.content ?? [];
    const text = parts
      .filter((p) => p.type === 'paragraph')
      .map((p) => inlineText(p.content).replace(/\n/g, ' '))
      .join(' ');
    return [`${indent}- ${text}`, ...parts.filter((p) => p.type === 'bulletList').flatMap((l) => listLines(l, depth + 1))];
  });
}

function tableText(table: JSONContent): string {
  const rows = (table.content ?? []).map((row) => row.content ?? []);
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const cellText = (cell: JSONContent | undefined) =>
    (cell?.content ?? [])
      .map((p) => inlineText(p.content).replace(/\n/g, ' '))
      .join(' ')
      .replace(/(?<!\\)\|/g, '\\|');
  const align = Array.from({ length: width }, (_, i) => String(rows[0]![i]?.attrs?.['align'] ?? 'left'));
  const line = (row: readonly JSONContent[]) => `| ${Array.from({ length: width }, (_, i) => cellText(row[i])).join(' | ')} |`;
  const rule = `|${align.map((a) => (a === 'right' ? '---:' : a === 'center' ? ':---:' : '---')).join('|')}|`;
  return [line(rows[0]!), rule, ...rows.slice(1).map(line)].join('\n');
}

/** Text that would start a block of another kind is escaped. */
function startOfLine(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/^(\s*)(#{1,3}\s|[-*]\s|>|```|---|\*\*\*|___|\||!\[)/, '$1\\$2'))
    .join('\n');
}

/** Text nodes with their marks back to Markdown; hard breaks become line breaks. */
function inlineText(content: readonly JSONContent[] | undefined): string {
  let out = '';
  for (const node of content ?? []) {
    if (node.type === 'hardBreak') {
      out += '\n';
      continue;
    }
    if (node.type !== 'text' || !node.text) continue;
    const marks = node.marks ?? [];
    const has = (type: string) => marks.some((m) => m.type === type);
    if (has('code')) {
      out += `\`${node.text.replace(/`/g, "'")}\``;
      continue;
    }
    let text = node.text.replace(/[\\`*[\]]/g, (c) => `\\${c}`);
    if (has('italic')) text = `*${text}*`;
    if (has('bold')) text = `**${text}**`;
    const link = marks.find((m) => m.type === 'link');
    const href = typeof link?.attrs?.['href'] === 'string' ? link.attrs['href'] : '';
    if (link && /^https?:\/\//.test(href)) text = `[${text}](${href})`;
    out += text;
  }
  return out;
}
