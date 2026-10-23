/**
 * Pages numbered by sections (1.1, 1.2, 2.1 …, as ETH asks for statics): the
 * browser's own paging (@page) only counts pages through, and cannot put the
 * title of a section in the head. So the printout lays out its pages itself:
 * a small script of its own (and only it, by a nonce) measures the blocks and
 * puts them on pages of the paper's size, a section always on a new page, each
 * page with its head and its number. The editor uses the same sections.
 */

import { fitWideEquations } from './fit.js';
import type { PrintBlock } from './model.js';

/** A section of the printout: its label (2, 3a, A) and its title for the page head. */
export interface Section {
  readonly label: string;
  readonly title: string;
}

/**
 * The sections of a sheet by the lines of their headings: its positions (Pos. 2 Průvlak)
 * when it has any; else the headings of the highest level that occurs at least twice
 * (one heading is the title of the sheet, no section), numbered 1, 2, 3.
 */
export function sheetSections(blocks: readonly PrintBlock[]): Map<number, Section> {
  const headings = blocks.filter((b): b is Extract<PrintBlock, { kind: 'heading' }> => b.kind === 'heading');
  const sections = new Map<number, Section>();
  const positions = headings.filter((h) => h.positionLabel !== undefined);
  if (positions.length > 0) {
    for (const h of positions) sections.set(h.line, { label: h.positionLabel!, title: `${h.position ?? ''} ${plain(h.text)}`.trim() });
    return sections;
  }
  const levels = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
  const level = levels.find((l) => headings.filter((h) => h.level === l).length >= 2);
  if (level === undefined) return sections;
  headings.filter((h) => h.level === level).forEach((h, i) => sections.set(h.line, { label: String(i + 1), title: plain(h.text) }));
  return sections;
}

/** A heading as plain words: no marks of its text (*italic*, σ_Kt stays as written). */
function plain(text: string): string {
  return text.replace(/\*+/g, '').trim();
}

/**
 * The label of each page: the section it belongs to and its page in it (2.3); pages
 * before the first section by their number alone. `starts[i]` is the section that
 * begins on page i (a section always begins a page), if any.
 */
export function pageLabels(starts: readonly (Section | undefined)[]): string[] {
  let current: Section | undefined;
  let inSection = 0;
  let before = 0;
  return starts.map((start) => {
    if (start) {
      current = start;
      inSection = 0;
    }
    if (!current) return String(++before);
    return `${current.label}.${++inSection}`;
  });
}

/** What the script of the printout needs: the paper, its margins, the texts of the heads. */
export interface PagedConfig {
  readonly width: number;
  readonly height: number;
  readonly margin: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly title: string;
  readonly headRight?: string;
  readonly footer?: string;
  /** "Strana", "z": the words of the page number. */
  readonly page: string;
  readonly of: string;
}

/**
 * The script that lays out the pages. Plain JavaScript run in the printout: it waits for
 * the pictures, measures every block, starts a page where the next block does not fit,
 * where a section begins or the sheet asks for it (@page), keeps a heading with what
 * follows it, then marks the document as laid out (data-paged) for whoever prints it.
 */
export const PAGED_SCRIPT = `(async () => {
  const flow = document.getElementById('flow');
  const cfg = JSON.parse(flow.dataset.pagedFlow);
  await Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => undefined) : undefined)));
  // Equations wider than the page made smaller first, so they are measured as printed.
  (${fitWideEquations.toString()})(flow);
  const mm = (() => { const probe = document.createElement('div'); probe.style.height = '100mm'; document.body.appendChild(probe); const px = probe.getBoundingClientRect().height / 100; probe.remove(); return px; })();
  const body = (cfg.height - cfg.margin.top - cfg.margin.bottom) * mm;
  // Containers whose parts go on pages one by one: the calculation, an appendix, the notes of one.
  const items = [];
  const take = (el, mark) => {
    if (el.matches('main, .appendix, .notes')) {
      const parts = [...el.children];
      parts.forEach((part, i) => take(part, i === 0 ? (mark || el) : undefined));
      return;
    }
    if (mark && mark !== el && mark.dataset.section !== undefined) {
      el.dataset.section = mark.dataset.section;
      el.dataset.sectionTitle = mark.dataset.sectionTitle;
    }
    if (mark && mark.matches && mark.matches('.appendix')) el.dataset.breakBefore = '';
    items.push(el);
  };
  [...flow.children].forEach((el) => take(el));
  const height = (el) => {
    const style = getComputedStyle(el);
    return el.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  };
  const heights = items.map(height);
  const pages = [];
  let page = [];
  let used = 0;
  items.forEach((el, i) => {
    const breakHere = el.matches('.page-break');
    const starts = el.dataset.section !== undefined || el.dataset.breakBefore !== undefined;
    // A heading goes with the block after it.
    const heading = /^H[1-6]$/.test(el.tagName) || el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4');
    const need = heights[i] + (heading && items[i + 1] ? heights[i + 1] : 0);
    if (page.length > 0 && (breakHere || starts || used + need > body)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    if (breakHere) return;
    page.push(el);
    used += heights[i];
  });
  if (page.length > 0) pages.push(page);
  // Labels: a section numbers its own pages, 2.1, 2.2; pages before the first one 1, 2.
  let current;
  let inSection = 0;
  let before = 0;
  const labels = pages.map((p) => {
    const start = p[0] && p[0].dataset.section !== undefined ? { label: p[0].dataset.section, title: p[0].dataset.sectionTitle || '' } : undefined;
    if (start) { current = start; inSection = 0; }
    return { label: current ? current.label + '.' + (++inSection) : String(++before), title: current ? current.title : '' };
  });
  const text = (tag, cls, value) => { const el = document.createElement(tag); el.className = cls; el.textContent = value; return el; };
  const out = document.createElement('div');
  pages.forEach((p, i) => {
    const sheet = document.createElement('section');
    sheet.className = 'paged-page';
    sheet.appendChild(text('div', 'ph-left', labels[i].title ? cfg.title + ' · ' + labels[i].title : cfg.title));
    if (cfg.headRight) sheet.appendChild(text('div', 'ph-right', cfg.headRight));
    const content = document.createElement('div');
    content.className = 'paged-body';
    p.forEach((el) => content.appendChild(el));
    sheet.appendChild(content);
    if (cfg.footer) sheet.appendChild(text('div', 'pf-left', cfg.footer));
    sheet.appendChild(text('div', 'pf-right', cfg.page + ' ' + labels[i].label + ' (' + (i + 1) + ' ' + cfg.of + ' ' + pages.length + ')'));
    out.appendChild(sheet);
  });
  flow.replaceWith(out);
  document.documentElement.dataset.paged = String(pages.length);
})();`;

/** The paper in millimetres: width and height for its orientation. */
export function paperSize(paper: 'A4' | 'A3' | 'Letter' = 'A4', orientation: 'portrait' | 'landscape' = 'portrait'): { width: number; height: number } {
  const [w, h] = paper === 'A3' ? [297, 420] : paper === 'Letter' ? [215.9, 279.4] : [210, 297];
  return orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
}

/** The margins of a printed page in millimetres, as @page sets them for the flowing print. */
export const PRINT_MARGINS = { top: 18, right: 16, bottom: 18, left: 20 } as const;

/** The CSS of the pages the script lays out, for the paper. */
export function pagedCss(config: PagedConfig): string {
  const m = config.margin;
  return `@page { size: ${config.width}mm ${config.height}mm; margin: 0; }
body { max-width: none; margin: 0; padding: 0; }
#flow { width: ${config.width - m.left - m.right}mm; margin: 0 ${m.right}mm 0 ${m.left}mm; }
.paged-page { position: relative; width: ${config.width}mm; height: ${config.height}mm; box-sizing: border-box; padding: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; break-after: page; overflow: hidden; }
.paged-page:last-child { break-after: auto; }
.paged-page .paged-body { height: 100%; }
.paged-page .paged-body > :first-child { margin-top: 0; }
.ph-left, .ph-right, .pf-left, .pf-right { position: absolute; font: 8pt sans-serif; color: #555; }
.ph-left { top: 8mm; left: ${m.left}mm; }
.ph-right { top: 8mm; right: ${m.right}mm; }
.pf-left { bottom: 8mm; left: ${m.left}mm; }
.pf-right { bottom: 8mm; right: ${m.right}mm; }
@media screen { body { background: #e9ecf0; } .paged-page { background: #fff; margin: 6mm auto; box-shadow: 0 1px 5px rgb(0 0 0 / 18%); } }`;
}
