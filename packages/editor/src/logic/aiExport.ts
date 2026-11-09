/**
 * A calculation for an AI in a chat window, as one file (or one text on the clipboard): the request in the user's
 * language, the sheet with its assignment, the tables of its data layers, the messages of the program, and the whole
 * language of Kalketa (llms.txt). Attached to ChatGPT, Claude.ai or Gemini it needs nothing else; the answer comes
 * back by Ctrl+V (docs/navrhy/AI-Z-CHATU.md).
 */

import type { SheetResult, Table } from '@kalketa/core';
import { formatDiagnostic, t, type Catalog } from '@kalketa/i18n';
import { tableText } from './aiContext.js';
import { llmsTxt } from './llmsTxt.js';

const FENCE = '`'.repeat(3);

export interface AiExportInput {
  readonly title: string;
  /** The printed sheet as it is written (file notation). */
  readonly source: string;
  readonly result: SheetResult;
  readonly tables: readonly Table[];
  /** The language the user reads; the request and the messages are in it. */
  readonly catalog: Catalog;
}

/** The text of the file for the AI. */
export function aiExportText(input: AiExportInput): string {
  const { catalog, result } = input;
  const lines = input.source.split('\n');
  const messages = result.diagnostics
    .filter((d) => d.severity !== 'info')
    .map((d) => `- line ${d.span.line} \`${(lines[d.span.line - 1] ?? '').trim()}\`: ${d.code} ${formatDiagnostic(d, catalog)}`);
  const tables = input.tables.flatMap((table) => [...tableText(table, new Set()), '']);
  return [
    `# ${input.title}`,
    '',
    t(catalog, 'aiExport.request'),
    '',
    '## The calculation',
    '',
    FENCE,
    input.source.replace(/\n+$/, ''),
    FENCE,
    '',
    ...(tables.length > 0 ? ['## Tables of its data layers (read by pick(Table, "key").column)', '', ...tables] : []),
    '## Messages of the program',
    '',
    ...(messages.length > 0 ? messages : ['- none: the calculation has no errors and no warnings.']),
    '',
    '---',
    '',
    llmsTxt(),
  ].join('\n');
}
