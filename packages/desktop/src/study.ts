/**
 * Study files in the theory folders (docs/01-filozofie.md, ch. 9.6): PDF, HTML
 * and Markdown. The main process reads them (a PDF's pages and table of
 * contents through pdf.js, in a process of its own) and keeps a PDF's text in a cache by file, size and
 * time, so a book is read once; the editor makes the chapters and sections
 * (@kalketa/sheet, studyFile.ts). The card next to a file (<file>.kalketa.json)
 * says how it is cited and which chapters or pages are read.
 */

import { app, utilityProcess } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Study files by extension. */
const STUDY_EXTENSIONS = ['.pdf', '.html', '.htm', '.md'];

export function isStudyFile(name: string): boolean {
  return STUDY_EXTENSIONS.includes(extname(name).toLowerCase());
}

/** A chapter of a PDF's table of contents. */
interface StudyChapter {
  readonly title: string;
  readonly level: number;
  readonly page: number;
}

/** A study file as read: a PDF's pages and contents, or the text of HTML and Markdown (StudyRaw in the editor). */
export interface StudyRead {
  readonly kind: 'pdf' | 'html' | 'md';
  readonly fileName: string;
  readonly title?: string;
  readonly pages?: readonly string[];
  readonly labels?: readonly string[];
  readonly outline?: readonly StudyChapter[];
  readonly text?: string;
  readonly contentHash: string;
  readonly modified: string;
}

/** Longest reading of one PDF (a book of a thousand pages takes about a minute). */
const PDF_TIMEOUT_MS = 300_000;

/** A PDF read by pdf.js in a utility process of its own (pdfChild.cts), ended after the file. */
function readPdf(bytes: Uint8Array): Promise<Pick<StudyRead, 'title' | 'pages' | 'labels' | 'outline'>> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(join(dirname(fileURLToPath(import.meta.url)), 'pdfChild.cjs'), [], { serviceName: 'Kalketa PDF', execArgv: ['--max-old-space-size=2048'], stdio: 'ignore' });
    let done = false;
    const finish = (error?: Error, read?: Pick<StudyRead, 'title' | 'pages' | 'labels' | 'outline'>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(read!);
    };
    const timer = setTimeout(() => finish(new Error('Reading the PDF took too long')), PDF_TIMEOUT_MS);
    child.on('message', (m: { read?: Pick<StudyRead, 'title' | 'pages' | 'labels' | 'outline'>; error?: string }) => finish(m.error !== undefined ? new Error(m.error) : undefined, m.read));
    child.on('exit', () => finish(new Error('Reading the PDF stopped')));
    child.on('spawn', () => child.postMessage(bytes));
  });
}

function cacheDir(): string {
  return join(app.getPath('userData'), 'study-cache');
}

/** What a study file says, from the cache when the file has not changed. */
export async function readStudyFile(path: string): Promise<StudyRead> {
  const info = await stat(path);
  const key = createHash('sha256').update(`${path.toLowerCase()}|${info.size}|${info.mtimeMs}|2`).digest('hex').slice(0, 32);
  const cached = join(cacheDir(), `${key}.json`);
  try {
    return JSON.parse(await readFile(cached, 'utf8')) as StudyRead;
  } catch {
    // Not read yet, or changed since.
  }
  const bytes = new Uint8Array(await readFile(path));
  const contentHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const ext = extname(path).toLowerCase();
  const read = ext === '.pdf' ? await readPdf(bytes) : { text: new TextDecoder().decode(bytes) };
  const content: StudyRead = {
    kind: ext === '.pdf' ? 'pdf' : ext === '.md' ? 'md' : 'html',
    fileName: basename(path),
    ...read,
    contentHash,
    modified: info.mtime.toISOString(),
  };
  try {
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(cached, JSON.stringify(content));
  } catch {
    // Without a cache the file is read again next time.
  }
  return content;
}

/** The card next to a study file. */
function cardPath(path: string): string {
  return join(path, '..', `${basename(path)}.kalketa.json`);
}

/** The card as written; the editor checks what is in it. */
export async function readStudySettings(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(cardPath(path), 'utf8')) as unknown;
  } catch {
    return {};
  }
}

export async function writeStudySettings(path: string, settings: object): Promise<void> {
  await writeFile(cardPath(path), JSON.stringify(settings, null, 2) + '\n');
}
