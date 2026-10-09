/**
 * @kalketa/render — the print layer: evaluated sheet -> classical
 * technical calculation (HTML with MathML, ready for print and PDF).
 *
 * Pipeline (rendering doc, ch. 37): SheetResult -> PrintDocument (semantic
 * lines) -> HTML. Pure functions; no file access.
 */

import type { SheetResult, UnitRegistry } from '@kalketa/core';
import { formatDate, t, type Catalog } from '@kalketa/i18n';
import { appendixHtml, renderBlocksHtml, renderHtml, type CalcStyle } from './html.js';
import { buildPrintDocument, type EquationNumbers } from './model.js';
import { notesHtml } from './notes.js';

export * from './math.js';
export { formulaNode, hasSubstitutableParts, type FormulaOptions } from './formula.js';
export * from './model.js';
export { renderHtml, renderBlockHtml, renderBlocksHtml, sideGroupHtml, renderSummary, appendixHtml, isInput, textHtml, BLOCK_CSS, type HtmlOptions, type BlockHtmlOptions, type CalcStyle } from './html.js';
export { kalkFormula, notesHtml, notesImages, NOTES_CSS, type NotesOptions } from './notes.js';

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
  /** Equation numbers at the right (1), (2) …: none, of formulas, of every result. */
  readonly equations?: EquationNumbers;
  readonly resolveFile?: (path: string) => string | undefined;
  /** Layers printed after the sheet, in this order, as Appendix A, B, … */
  readonly appendices?: readonly PrintAppendix[];
  /** Left of the page footer: the revision and fingerprint (revisionFooter). */
  readonly footer?: string;
  /** Lines of the sheet (statement starts) the AI made and nobody reviewed yet. */
  readonly aiLines?: ReadonlySet<number>;
  /** How the calculation is set; "airy" when absent. */
  readonly style?: CalcStyle;
}

/** Where the printed content stands among the revisions of the sheet. */
export interface FooterRevision {
  /** First 8 hex digits of the content fingerprint, "3f9c 21ab". */
  readonly hash: string;
  /** The content is this revision. */
  readonly revision?: { readonly label: string; readonly created: string };
  /** The content changed after this revision (a draft). */
  readonly after?: string;
}

/** "Revize A (1. 10. 2026) · otisk 3f9c 21ab", "Rozpracováno po revizi A · otisk …", or the fingerprint alone. */
export function revisionFooter(catalog: Catalog, state: FooterRevision): string {
  const hash = t(catalog, 'print.fingerprint', { hash: state.hash });
  if (state.revision) {
    const date = state.revision.created ? formatDate(Math.floor(Date.parse(state.revision.created) / 86_400_000), catalog) : '';
    return `${t(catalog, 'print.revision', { label: state.revision.label, date })} · ${hash}`;
  }
  if (state.after) return `${t(catalog, 'print.draftAfter', { label: state.after })} · ${hash}`;
  return hash.charAt(0).toUpperCase() + hash.slice(1);
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
    ...(settings.equations !== undefined ? { equations: settings.equations } : {}),
  });

  const rendered = appendices.map((appendix) => {
    const title = titles.get(appendix.layer)!;
    if (appendix.kind === 'notes') {
      const notes = notesHtml(appendix.text, settings.resolveFile ? { resolveFile: settings.resolveFile } : {});
      return appendixHtml(title, `<div class="notes">${notes}</div>`);
    }
    const inner = buildPrintDocument(appendix.result, { ...common, title: appendix.name, summary: 'none' });
    return appendixHtml(title, renderBlocksHtml(inner.blocks, settings.catalog, undefined, settings.style));
  });

  return renderHtml(doc, {
    catalog: settings.catalog,
    appendices: rendered,
    ...(settings.paper ? { paper: settings.paper } : {}),
    ...(settings.orientation ? { orientation: settings.orientation } : {}),
    ...(settings.footer ? { footer: settings.footer } : {}),
    ...(settings.aiLines && settings.aiLines.size > 0 ? { aiLines: settings.aiLines } : {}),
    ...(settings.style ? { style: settings.style } : {}),
  });
}
