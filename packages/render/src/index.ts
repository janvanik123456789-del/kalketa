/**
 * @calccanvas/render — the print layer: evaluated sheet -> classical
 * technical calculation (HTML with MathML, ready for print and PDF).
 *
 * Pipeline (rendering doc, ch. 37): SheetResult -> PrintDocument (semantic
 * lines) -> HTML. Pure functions; no file access.
 */

import type { SheetResult, UnitRegistry } from '@calccanvas/core';
import type { Catalog } from '@calccanvas/i18n';
import { renderHtml } from './html.js';
import { buildPrintDocument } from './model.js';

export * from './math.js';
export { formulaNode, hasSubstitutableParts, type FormulaOptions } from './formula.js';
export * from './model.js';
export { renderHtml, type HtmlOptions } from './html.js';

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
}

/** Evaluated sheet -> printable HTML page. */
export function printHtml(result: SheetResult, settings: PrintSettings): string {
  const doc = buildPrintDocument(result, {
    catalog: settings.catalog,
    registry: settings.registry,
    digits: settings.digits ?? 4,
    title: settings.title,
    ...(settings.subtitle !== undefined ? { subtitle: settings.subtitle } : {}),
    ...(settings.summary !== undefined ? { summary: settings.summary } : {}),
    ...(settings.resolveFile ? { resolveFile: settings.resolveFile } : {}),
  });
  return renderHtml(doc, {
    catalog: settings.catalog,
    ...(settings.paper ? { paper: settings.paper } : {}),
    ...(settings.orientation ? { orientation: settings.orientation } : {}),
  });
}
