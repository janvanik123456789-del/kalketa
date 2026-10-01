/**
 * @calccanvas/render — the print layer: evaluated sheet -> classical
 * technical calculation (HTML with MathML, ready for print and PDF).
 *
 * Pipeline (rendering doc, ch. 37): SheetResult -> PrintDocument (semantic
 * lines) -> HTML. Pure functions; no file access.
 */

import type { SheetResult, UnitRegistry } from '@calccanvas/core';
import { t, type Catalog } from '@calccanvas/i18n';
import { appendixHtml, renderBlocksHtml, renderHtml } from './html.js';
import { buildPrintDocument } from './model.js';
import { notesHtml } from './notes.js';

export * from './math.js';
export { formulaNode, hasSubstitutableParts, type FormulaOptions } from './formula.js';
export * from './model.js';
export { renderHtml, renderBlockHtml, renderBlocksHtml, sideGroupHtml, renderSummary, appendixHtml, BLOCK_CSS, type HtmlOptions, type BlockHtmlOptions } from './html.js';
export { notesHtml, notesImages, NOTES_CSS, type NotesOptions } from './notes.js';

/** A layer printed after the sheet. */
export type PrintAppendix =
  | { readonly kind: 'calc'; readonly layer: string; readonly name: string; readonly result: SheetResult }
  | { readonly kind: 'notes'; readonly layer: string; readonly name: string; readonly text: string };

export interface PrintSettings {
  readonly catalog: Catalog;
  readonly registry: UnitRegistry;
  readonly title: string;
  readonly subtitle?: string;
  readonly digits?: number;
  readonly paper?: 'A4' | 'A3' | 'Letter';
  readonly orientation?: 'portrait' | 'landscape';
  readonly summary?: 'top' | 'bottom' | 'none';
  readonly resolveFile?: (path: string) => string | undefined;
  /** Layers printed after the sheet, in this order, as Appendix A, B, … */
  readonly appendices?: readonly PrintAppendix[];
}

/** "Příloha A: Zatížení" for the n-th appendix. */
export function appendixTitle(catalog: Catalog, index: number, name: string): string {
  return t(catalog, 'print.appendix', { letter: String.fromCharCode(65 + (index % 26)), name });
}

/** Evaluated sheet -> printable HTML page. */
export function printHtml(result: SheetResult, settings: PrintSettings): string {
  const appendices = settings.appendices ?? [];
  const titles = new Map(appendices.map((a, i) => [a.layer, appendixTitle(settings.catalog, i, a.name)]));
  const common = {
    catalog: settings.catalog,
    registry: settings.registry,
    digits: settings.digits ?? 4,
    importSource: (layer: string) => titles.get(layer),
    ...(settings.resolveFile ? { resolveFile: settings.resolveFile } : {}),
  };
  const doc = buildPrintDocument(result, {
    ...common,
    title: settings.title,
    ...(settings.subtitle !== undefined ? { subtitle: settings.subtitle } : {}),
    ...(settings.summary !== undefined ? { summary: settings.summary } : {}),
  });

  const rendered = appendices.map((appendix) => {
    const title = titles.get(appendix.layer)!;
    if (appendix.kind === 'notes') {
      const notes = notesHtml(appendix.text, settings.resolveFile ? { resolveFile: settings.resolveFile } : {});
      return appendixHtml(title, `<div class="notes">${notes}</div>`);
    }
    const inner = buildPrintDocument(appendix.result, { ...common, title: appendix.name, summary: 'none' });
    return appendixHtml(title, renderBlocksHtml(inner.blocks, settings.catalog));
  });

  return renderHtml(doc, {
    catalog: settings.catalog,
    appendices: rendered,
    ...(settings.paper ? { paper: settings.paper } : {}),
    ...(settings.orientation ? { orientation: settings.orientation } : {}),
  });
}
