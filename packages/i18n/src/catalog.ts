/**
 * A message catalog for one language. Adding a language means adding one
 * catalog; no code changes are needed elsewhere.
 */

import type { DiagnosticCode, Severity } from '@calccanvas/core';

export interface Catalog {
  /** BCP 47 tag, also used for number formatting (cs -> 1 234,5). */
  readonly locale: string;
  /** Name of the language in that language, for the settings menu. */
  readonly name: string;
  /** Message per diagnostic code; {param} placeholders are filled in. */
  readonly diagnostics: Readonly<Record<DiagnosticCode, string>>;
  /** Translations of term codes used as parameter values. */
  readonly terms: Readonly<Record<string, string>>;
  readonly severity: Readonly<Record<Severity, string>>;
  /** Labels of the user interface and printed output. */
  readonly ui: Readonly<Record<UiKey, string>>;
}

export const UI_KEYS = [
  'checks.title',
  'checks.check',
  'checks.utilization',
  'checks.source',
  'checks.passed',
  'checks.failed',
  'checks.notEvaluated',
  'checks.allPassed',
  'checks.someFailed',
  'trace.table',
  'trace.row',
  'trace.rows',
  'trace.column',
  'trace.source',
  'trace.interpolated',
  'trace.notFound',
  'print.page',
  'print.of',
  'print.condition',
  'editor.untitled',
  'editor.new',
  'editor.open',
  'editor.save',
  'editor.example',
  'editor.print',
  'editor.sheet',
  'editor.tables',
  'editor.language',
  'editor.printLanguage',
  'editor.saved',
  'editor.unsaved',
  'editor.details',
  'editor.nothingSelected',
  'editor.value',
  'editor.formula',
  'editor.origin',
  'editor.messages',
  'editor.importTable',
  'editor.newTable',
  'editor.tableName',
  'editor.addRow',
  'editor.deleteRow',
  'editor.addColumn',
  'editor.deleteColumn',
  'editor.columnName',
  'editor.columnType',
  'editor.columnUnit',
  'editor.type.quantity',
  'editor.type.text',
  'editor.type.boolean',
  'editor.noTables',
  'editor.image',
  'editor.uploadImage',
  'editor.help',
  'editor.openFailed',
  'editor.tableUsedBy',
  'editor.exportPdf',
  'editor.closeUnsaved',
  'editor.discard',
  'editor.cancel',
  'editor.sheetFiles',
] as const;

export type UiKey = (typeof UI_KEYS)[number];
