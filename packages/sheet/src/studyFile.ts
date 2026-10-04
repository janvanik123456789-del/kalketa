/**
 * Study files (docs/01-filozofie.md, ch. 9.6): PDF, HTML or Markdown put as
 * they are into a theory folder, next to the .kalkt libraries. The program
 * reads their text and offers them like a library: sections the model gets by
 * the question, cited with the file's key ([EC3:T45]), copies of the cited
 * sections kept in the calculation.
 *
 * A PDF gives a section per page: T45 is page 45 of the file, titled by the
 * chapter it belongs to and the page as printed. HTML and Markdown give a
 * section per heading, T1, T2… in order. A whole book may stay in the folder:
 * its card next to it (<file>.kalketa.json) says which chapters or pages are
 * read, so the search does not wander into parts that do not belong.
 */

import { keyOf, type TheoryLibrary, type TheorySource, THEORY_FORMAT, THEORY_FORMAT_VERSION } from './theoryLibrary.js';

/** What the program read from a study file. */
export interface StudyContent {
  readonly kind: 'pdf' | 'html' | 'md';
  /** File name without the folder, e.g. "Pruznost a pevnost.pdf". */
  readonly fileName: string;
  /** The title the file gives (PDF metadata, <title>, the first heading). */
  readonly title?: string;
  /** PDF: the text of each page. HTML and Markdown: the text of each chapter. */
  readonly pages: readonly string[];
  /** PDF: the page numbers as printed ("iv", "45"), by page. */
  readonly labels?: readonly string[];
  /** PDF: its table of contents; HTML and Markdown: the headings, one per chapter. */
  readonly outline?: readonly StudyChapter[];
  readonly contentHash: string;
  /** ISO time the file was last changed. */
  readonly modified: string;
}

export interface StudyChapter {
  readonly title: string;
  /** 1 = chapter, 2 = section, … */
  readonly level: number;
  /** Where it starts: page (PDF) or chapter (HTML, Markdown), from 1. */
  readonly page: number;
}

/** A study file as the desktop reads it: a PDF's pages and contents, or the text of HTML and Markdown. */
export interface StudyRaw extends Omit<StudyContent, 'pages'> {
  readonly pages?: readonly string[];
  readonly text?: string;
}

/** The content of a study file: HTML and Markdown split into chapters by heading. */
export function studyContent(raw: StudyRaw): StudyContent {
  if (raw.kind === 'pdf' || raw.text === undefined) return { ...raw, pages: raw.pages ?? [] };
  const { text, ...rest } = raw;
  const read = raw.kind === 'md' ? markdownChapters(text) : htmlChapters(text);
  return { ...rest, ...(read.title && !raw.title ? { title: read.title } : {}), pages: read.pages, outline: read.outline };
}

/** The card next to a study file: how it is cited and which part of it is read. */
export interface StudySettings {
  readonly key?: string;
  readonly title?: string;
  readonly source?: TheorySource;
  /** Chapters read, by their place in the outline (from 0). */
  readonly chapters?: readonly number[];
  /** Pages read, as printed: "45–80, 112-130, 7". */
  readonly pages?: string;
}

/** A file this large read whole is better narrowed to its chapters. */
export const LARGE_STUDY_PAGES = 60;
const STUDY_EXTENSIONS = ['.pdf', '.html', '.htm', '.md'];
const KEY = /^[A-Z][A-Z0-9]{0,5}$/;

export function isStudyFile(name: string): boolean {
  const lower = name.toLowerCase();
  return STUDY_EXTENSIONS.some((e) => lower.endsWith(e));
}

/** The card's file name for a study file. */
export function studyCardName(fileName: string): string {
  return `${fileName}.kalketa.json`;
}

export function parseStudySettings(value: unknown): StudySettings {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
  const key = text(v['key']);
  const title = text(v['title']);
  const pages = text(v['pages']);
  const source = typeof v['source'] === 'object' && v['source'] !== null && text((v['source'] as Record<string, unknown>)['title']) ? (v['source'] as TheorySource) : undefined;
  const chapters = Array.isArray(v['chapters']) ? v['chapters'].filter((n): n is number => Number.isInteger(n) && n >= 0) : undefined;
  return { ...(key && KEY.test(key) ? { key } : {}), ...(title ? { title } : {}), ...(source ? { source } : {}), ...(chapters && chapters.length ? { chapters } : {}), ...(pages ? { pages } : {}) };
}

/** A short, stable number for a text (FNV-1a), for ids that do not change between runs. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A title from a file name: "Sbirka_prikladu.pdf" -> "Sbirka prikladu". */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

/** Pages written as printed ("45–80, 7") -> page numbers of the file, from 1. */
export function parsePageRanges(text: string, count: number, labels?: readonly string[]): number[] {
  const toPage = (label: string) => {
    const at = labels?.indexOf(label) ?? -1;
    if (at >= 0) return at + 1;
    const n = Number(label);
    return Number.isInteger(n) && n >= 1 && n <= count ? n : undefined;
  };
  const pages = new Set<number>();
  for (const part of text.split(/[,;]/)) {
    const range = /^\s*([^\s–—-]+)\s*(?:[–—-]\s*([^\s–—-]+))?\s*$/.exec(part);
    if (!range) continue;
    const from = toPage(range[1]!);
    const to = range[2] !== undefined ? toPage(range[2]) : from;
    if (from === undefined || to === undefined) continue;
    for (let p = Math.min(from, to); p <= Math.max(from, to); p++) pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Pages (or chapters) a chapter of the outline covers: up to where the next one of its level or above starts. */
export function chapterPages(outline: readonly StudyChapter[], index: number, count: number): number[] {
  const chapter = outline[index];
  if (!chapter) return [];
  const next = outline.slice(index + 1).find((c) => c.level <= chapter.level);
  // A PDF chapter may end on the page the next one starts on: that page goes with both.
  const end = next ? Math.max(chapter.page, next.page) : count;
  const pages: number[] = [];
  for (let p = chapter.page; p <= Math.min(end, count); p++) pages.push(p);
  return pages;
}

/** Pages (chapters) read by the settings: the chosen chapters and pages, else all. */
export function selectedPages(content: StudyContent, settings: StudySettings): number[] {
  const count = content.pages.length;
  const chosen = new Set<number>();
  for (const i of settings.chapters ?? []) for (const p of chapterPages(content.outline ?? [], i, count)) chosen.add(p);
  if (settings.pages) for (const p of parsePageRanges(settings.pages, count, content.labels)) chosen.add(p);
  if (chosen.size === 0 && !settings.chapters?.length && !settings.pages) return content.pages.map((_, i) => i + 1);
  return [...chosen].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
}

/** Advice on a study file: its size, how much is read, whether it has text at all. */
export interface StudyAdvice {
  readonly pages: number;
  readonly selected: number;
  /** Large and read whole: choosing its chapters makes the answers more precise. */
  readonly large: boolean;
  /** Hardly any text: a scan without a text layer. */
  readonly noText: boolean;
}

export function studyAdvice(content: StudyContent, settings: StudySettings): StudyAdvice {
  const selected = selectedPages(content, settings).length;
  const withText = content.pages.filter((p) => p.trim().length >= 40).length;
  return { pages: content.pages.length, selected, large: content.kind === 'pdf' && content.pages.length > LARGE_STUDY_PAGES && selected === content.pages.length, noText: content.pages.length > 0 && withText < content.pages.length / 4 };
}

/** One line for a heading: no marks the notes Markdown would read as an id or a heading. */
function headingText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[{}#]/g, '').trim() || '–';
}

/** Text of a page or chapter as the notes Markdown keeps it: no line read as a heading. */
function bodyText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => (/^\s*#/.test(l) ? `\\${l.trimStart()}` : l))
    .join('\n')
    .trim();
}

/** The study file as a theory library: its selected pages (chapters) as sections. */
export function studyLibrary(content: StudyContent, settings: StudySettings = {}): TheoryLibrary {
  const title = settings.title ?? content.title?.trim() ?? baseName(content.fileName);
  const key = settings.key ?? keyOf(title);
  const outline = content.outline ?? [];
  const paged = content.kind === 'pdf';
  const label = (p: number) => content.labels?.[p - 1] ?? String(p);
  /** The deepest chapter a page belongs to: the last one starting on it or before. */
  const chapterOf = (p: number) => [...outline].reverse().find((c) => c.page <= p)?.title;
  const parts: string[] = [];
  for (const p of selectedPages(content, settings)) {
    const text = bodyText(content.pages[p - 1] ?? '');
    if (!text) continue;
    const heading = paged ? [chapterOf(p), `s. ${label(p)}`].filter(Boolean).join(' – ') : (outline[p - 1]?.title ?? `${p}`);
    parts.push(`## ${headingText(heading)} {#T${p}}`, '', text, '');
  }
  return {
    manifest: {
      format: THEORY_FORMAT,
      formatVersion: THEORY_FORMAT_VERSION,
      id: `study-${fingerprint(content.fileName.toLowerCase())}`,
      key: KEY.test(key) ? key : 'TEO',
      version: content.modified.slice(0, 10),
      title,
      source: settings.source ?? { title },
      language: '',
      shareable: false,
      created: content.modified,
      modified: content.modified,
      contentHash: content.contentHash,
    },
    text: parts.join('\n'),
    files: new Map(),
  };
}

// ---------------------------------------------------------------------------
// HTML and Markdown: chapters by heading

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Plain text of an HTML fragment: blocks on lines of their own. */
function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|nav|header|footer)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol|pre|blockquote)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim();
}

/** Chapters of an HTML page by its headings h1–h3; text before the first heading is a chapter of its own. */
export function htmlChapters(html: string): { title?: string; pages: string[]; outline: StudyChapter[] } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const pages: string[] = [];
  const outline: StudyChapter[] = [];
  const heading = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let last = 0;
  let current: StudyChapter | undefined;
  const close = (end: number) => {
    const text = htmlText(body.slice(last, end));
    if (current) {
      pages.push(text);
      outline.push(current);
    } else if (text) {
      pages.push(text);
      outline.push({ title: title ? htmlText(title) : '–', level: 1, page: 1 });
    }
  };
  for (const m of body.matchAll(heading)) {
    close(m.index);
    current = { title: htmlText(m[2]!), level: Number(m[1]), page: pages.length + 1 };
    last = m.index + m[0].length;
  }
  close(body.length);
  return { ...(title ? { title: htmlText(title) } : {}), pages, outline };
}

/** Chapters of a Markdown file by its headings #–###. */
export function markdownChapters(text: string): { title?: string; pages: string[]; outline: StudyChapter[] } {
  const pages: string[] = [];
  const outline: StudyChapter[] = [];
  let lines: string[] = [];
  let current: StudyChapter | undefined;
  const close = () => {
    const body = lines.join('\n').trim();
    if (current) {
      pages.push(body);
      outline.push(current);
    } else if (body) {
      pages.push(body);
      outline.push({ title: '–', level: 1, page: 1 });
    }
  };
  for (const line of text.split(/\r?\n/)) {
    const heading = /^(#{1,3})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      close();
      current = { title: heading[2]!.replace(/\s*\{#[^}]*\}$/, ''), level: heading[1]!.length, page: pages.length + 1 };
      lines = [];
    } else {
      lines.push(line);
    }
  }
  close();
  const first = outline.find((c) => c.level === 1);
  return { ...(first && first.title !== '–' ? { title: first.title } : {}), pages, outline };
}
