#!/usr/bin/env node
/**
 * calccanvas run <sheet> [--lang cs] [--digits 4]
 *   Evaluates a sheet and prints the results. <sheet> is a .calc file or a
 *   .cc file with its tables next to it. Exit code 1 when the sheet has errors.
 *
 * calccanvas trace <sheet> <name> [--lang cs]
 *   Shows where a result comes from: formulas, inputs, table rows and sources.
 *
 * calccanvas pack <file.cc> [--out file.calc] [--title "…"]
 * calccanvas unpack <file.calc> [--into folder]
 *   Converts between an unpacked folder and a .calc file.
 *
 * calccanvas import-table <file.csv|file.xlsx> --name <Table> [--sheet <Excel sheet>]
 *                         [--into <sheet folder>] [--source "<title>"]
 *   Imports a table into a sheet folder (tables/<Table>/schema.json + data.csv).
 */

import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultRegistry, traceName, type Diagnostic } from '@calccanvas/core';
import { catalogFor, formatDiagnostic, t, type Catalog } from '@calccanvas/i18n';
import { evaluateDocument, FILE_EXTENSION, importTable, parseCsv, readWorkbook } from '@calccanvas/sheet';
import { openSheet, saveSheetFile, writeFolder, writeTable } from './files.js';
import { formatReport, formatTrace } from './report.js';

const USAGE = [
  'Usage:',
  '  calccanvas run <sheet.calc|sheet.cc> [--lang <language>] [--digits <n>]',
  '  calccanvas trace <sheet.calc|sheet.cc> <name> [--lang <language>]',
  '  calccanvas pack <sheet.cc> [--out <file.calc>] [--title <title>]',
  '  calccanvas unpack <sheet.calc> [--into <folder>]',
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
      into: { type: 'string' },
      out: { type: 'string' },
      title: { type: 'string' },
      source: { type: 'string' },
    },
  });
  const [command, file, name] = positionals;
  const catalog = catalogFor(values.lang);
  const digits = Number(values.digits);

  if ((command === 'run' || command === 'trace') && file) {
    const opened = await openSheet(file);
    printDiagnostics(opened.diagnostics, catalog);
    if (!opened.document) return 1;
    const { result, tableDiagnostics } = evaluateDocument(opened.document, defaultRegistry);
    printDiagnostics(tableDiagnostics, catalog);

    if (command === 'trace') {
      const node = name ? traceName(result, name) : undefined;
      if (!node) {
        console.error(t(catalog, 'trace.notFound', { name: name ?? '' }));
        return 1;
      }
      console.log(formatTrace(node, { catalog, digits }));
      return 0;
    }
    console.log(formatReport(result, { catalog, digits }));
    return [...opened.diagnostics, ...tableDiagnostics, ...result.diagnostics].some((d) => d.severity === 'error') ? 1 : 0;
  }

  if (command === 'pack' && file) {
    const opened = await openSheet(file);
    if (!opened.document) return 1;
    let doc = opened.document;
    if (values.title) doc = { ...doc, manifest: { ...doc.manifest, title: values.title } };
    const out = values.out ?? file.slice(0, -extname(file).length) + FILE_EXTENSION;
    await saveSheetFile(doc, out);
    console.log(out);
    return 0;
  }

  if (command === 'unpack' && file) {
    const opened = await openSheet(file);
    printDiagnostics(opened.diagnostics, catalog);
    if (!opened.document) return 1;
    const sheetName = basename(file, extname(file));
    const written = writeFolder(opened.document, values.into ?? join('.', sheetName), sheetName);
    console.log(written.join('\n'));
    return 0;
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
    const source = { title: values.source ?? basename(file), retrieved };
    const imported = importTable(grid, { name: values.name, registry: defaultRegistry, source, images });
    const tableName = (JSON.parse(imported.files.schemaJson) as { name: string }).name;
    const written = writeTable(values.into ?? '.', tableName, imported.files);
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
