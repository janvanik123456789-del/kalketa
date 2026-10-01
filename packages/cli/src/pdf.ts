/**
 * HTML -> PDF through an installed Chromium browser (Edge on every Windows 10+,
 * or Chrome/Chromium). Headless printing honours the CSS @page rules, so the
 * PDF matches what "Print to PDF" in the browser gives.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES: readonly string[] = [
  process.env['KALKETA_BROWSER'] ?? '',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

export function findBrowser(): string | undefined {
  return CANDIDATES.find((path) => path !== '' && existsSync(path));
}

export function htmlToPdf(html: string, pdfPath: string): void {
  const browser = findBrowser();
  if (!browser) {
    throw new Error('No Edge, Chrome or Chromium found. Set KALKETA_BROWSER to its path, or open the HTML and print it to PDF.');
  }
  const dir = mkdtempSync(join(tmpdir(), 'kalketa-'));
  try {
    const htmlPath = join(dir, 'print.html');
    writeFileSync(htmlPath, html);
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${join(dir, 'profile')}`,
        '--no-pdf-header-footer',
        `--print-to-pdf=${resolve(pdfPath)}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: 'ignore', timeout: 60_000 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (!existsSync(pdfPath)) throw new Error(`The browser did not create ${pdfPath}.`);
}
