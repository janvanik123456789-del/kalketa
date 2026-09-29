#!/usr/bin/env node
/**
 * calccanvas run <file.cc> [--lang cs] [--digits 4]
 *
 * Evaluates a sheet and prints the results. Exit code 1 when the sheet has
 * errors, so the command can be used in scripts and CI.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { evaluateSheet } from '@calccanvas/core';
import { catalogFor } from '@calccanvas/i18n';
import { formatReport } from './report.js';

const USAGE = 'Usage: calccanvas run <file.cc> [--lang <language>] [--digits <n>]';

function main(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      lang: { type: 'string', default: process.env['LANG'] ?? 'en' },
      digits: { type: 'string', default: '4' },
    },
  });
  const [command, file] = positionals;
  if (command !== 'run' || !file) {
    console.error(USAGE);
    return 2;
  }

  const source = readFileSync(file, 'utf8');
  const result = evaluateSheet(source);
  console.log(formatReport(result, { catalog: catalogFor(values.lang), digits: Number(values.digits) }));
  return result.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
