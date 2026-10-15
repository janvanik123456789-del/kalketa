import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { printHtml } from '../src/index.js';

const cs = catalogFor('cs');
const rows = Array.from({ length: 14 }, (_, i) => `    | ${i / 10} | ${(4 - 0.35 * i).toFixed(2)} |`).join('\n');
const sheet = (head: string) => `${head}\n    | t [s] | a [m/s^2] |\n${rows}\n`;

describe('a table set across ({across})', () => {
  it('is the same table for the calculation, marked for print', () => {
    const across = evaluateSheet(`${sheet('table P: {across}')}x := max(P.a)`);
    expect(across.diagnostics).toEqual([]);
    expect(across.statements[0]!.statement.format).toEqual({ across: true });
    expect(across.values.get('x')).toMatchObject({ si: 4 });
    expect(evaluateSheet(sheet('table P: {sideways}')).diagnostics.map((d) => d.code)).toEqual(['W-FORMAT']);
  });

  it('prints each column on a row, the values side by side, in bands of twelve at most', () => {
    const html = printHtml(evaluateSheet(sheet('table P: {across}')), { catalog: cs, registry: defaultRegistry, title: 'T' });
    const table = html.slice(html.indexOf('<table class="data-table across">'), html.indexOf('</table>', html.indexOf('data-table across')));
    // Two bands (12 + 2 values), each with a row for t and a row for a.
    expect(table.match(/<tbody>/g)).toHaveLength(2);
    expect(table.match(/<tr>/g)).toHaveLength(4);
    const firstRow = table.slice(table.indexOf('<tr>'), table.indexOf('</tr>'));
    expect(firstRow.match(/<td/g)).toHaveLength(12);
    expect(firstRow).toContain('[s]');
    // Down, as before: a header row and a row for each point.
    const down = printHtml(evaluateSheet(sheet('table P:')), { catalog: cs, registry: defaultRegistry, title: 'T' });
    expect(down).not.toContain('data-table across');
  });
});
