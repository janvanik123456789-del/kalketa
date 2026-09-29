#!/usr/bin/env node
/**
 * calccanvas run <file.cc> [--lang cs] [--digits 4]
 *   Evaluates a sheet (with the tables stored next to it) and prints the results.
 *   Exit code 1 when the sheet has errors, so it can be used in scripts and CI.
 *
 * calccanvas import-table <file.csv|file.xlsx> --name <Table> [--sheet <Excel sheet>]
 *                         [--into <sheet folder>] [--source "<title>"] [--lang cs]
 *   Imports a table into a sheet folder (tables/<Table>/schema.json + data.csv).
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultRegistry, evaluateSheet, type Diagnostic } from '@calccanvas/core';
import { catalogFor, formatDiagnostic, type Catalog } from '@calccanvas/i18n';
import { importTable, parseCsv, readWorkbook } from '@calccanvas/sheet';
import { loadTablesNextTo, writeTable } from './files.js';
import { formatReport } from './report.js';

const USAGE = [
  'Usage:',
  '  calccanvas run <file.cc> [--lang <language>] [--digits <n>]',
  '  calccanvas import-table <file.csv|file.xlsx> --name <Table> [--sheet <name>] [--into <folder>] [--source <title>]',
].join('\n');

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      lang: { type: 'string', default: process.env['LANG'] ?? 'en' },
      digits: { type: 'string', default: '4' },
      name: { type: 'string' },
      sheet: { type: 'string' },
      into: { type: 'string', default: '.' },
      source: { type: 'string' },
    },
  });
  const [command, file] = positionals;
  const catalog = catalogFor(values.lang);

  if (command === 'run' && file) {
    const loaded = loadTablesNextTo(file, defaultRegistry);
    printDiagnostics(loaded.diagnostics, catalog);
    const result = evaluateSheet(readFileSync(file, 'utf8'), { tables: loaded.tables });
    console.log(formatReport(result, { catalog, digits: Number(values.digits) }));
    const errors = [...loaded.diagnostics, ...result.diagnostics].some((d) => d.severity === 'error');
    return errors ? 1 : 0;
  }

  if (command === 'import-table' && file && values.name) {
    const isExcel = ['.xlsx', '.xlsm'].includes(extname(file).toLowerCase());
    let grid: string[][];
    let images: Awaited<ReturnType<typeof readWorkbook>>[number]['images'] = [];
    if (isExcel) {
      const sheets = await readWorkbook(new Uint8Array(readFileSync(file)));
      const sheet = values.sheet ? sheets.find((s) => s.name === values.sheet) : sheets[0];
      if (!sheet) {
        console.error(`Sheet not found: ${values.sheet ?? '(first)'}; available: ${sheets.map((s) => s.name).join(', ')}`);
        return 2;
      }
      grid = sheet.rows;
      images = sheet.images;
    } else {
      grid = parseCsv(readFileSync(file, 'utf8'));
    }

    const retrieved = new Date().toISOString().slice(0, 10);
    const source = { title: values.source ?? file, retrieved };
    const imported = importTable(grid, { name: values.name, registry: defaultRegistry, source, images });
    const name = (JSON.parse(imported.files.schemaJson) as { name: string }).name;
    const written = writeTable(values.into, name, imported.files);
    printDiagnostics(imported.diagnostics, catalog);
    console.log(written.join('\n'));
    return imported.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
  }

  console.error(USAGE);
  return 2;
}

function printDiagnostics(diagnostics: readonly Diagnostic[], catalog: Catalog): void {
  for (const d of diagnostics) console.error(`${catalog.severity[d.severity]}: ${formatDiagnostic(d, catalog)}`);
}

process.exitCode = await main(process.argv.slice(2));
