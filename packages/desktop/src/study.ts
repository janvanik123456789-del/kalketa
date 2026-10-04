/**
 * Study files in the theory folders (docs/01-filozofie.md, ch. 9.6): PDF, HTML
 * and Markdown. The main process reads them (a PDF's pages and table of
 * contents through pdf.js) and keeps a PDF's text in a cache by file, size and
 * time, so a book is read once; the editor makes the chapters and sections
 * (@kalketa/sheet, studyFile.ts). The card next to a file (<file>.kalketa.json)
 * says how it is cited and which chapters or pages are read.
 */

import { app } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** What pdf.js gives for one entry of the table of contents. */
interface OutlineNode {
  readonly title: string;
  readonly dest: string | unknown[] | null;
  readonly items: readonly OutlineNode[];
}

const require = createRequire(import.meta.url);

/** The text of each page of a PDF, its printed page numbers and its table of contents. */
async function readPdf(bytes: Uint8Array): Promise<Pick<StudyRead, 'title' | 'pages' | 'labels' | 'outline'>> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '');
      // A word split at the end of a line ("ohý-\nbaný") is joined again, so quotes from it are found.
      pages.push(text.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2').replace(/[ \t]+\n/g, '\n').trim());
      page.cleanup();
    }
    const labels = (await doc.getPageLabels().catch(() => null)) ?? undefined;
    const outline: StudyChapter[] = [];
    const walk = async (nodes: readonly OutlineNode[], level: number) => {
      for (const node of nodes) {
        try {
          const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
          const ref = Array.isArray(dest) ? dest[0] : undefined;
          const index = typeof ref === 'number' ? ref : ref ? await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]) : undefined;
          if (index !== undefined && node.title.trim()) outline.push({ title: node.title.trim(), level, page: index + 1 });
        } catch {
          // An entry pointing nowhere is left out.
        }
        if (node.items.length) await walk(node.items, level + 1);
      }
    };
    await walk(((await doc.getOutline()) ?? []) as OutlineNode[], 1);
    const meta = (await doc.getMetadata().catch(() => undefined))?.info as { Title?: string } | undefined;
    return {
      ...(meta?.Title?.trim() ? { title: meta.Title.trim() } : {}),
      pages,
      ...(labels && labels.some((l, i) => l !== String(i + 1)) ? { labels } : {}),
      ...(outline.length ? { outline } : {}),
    };
  } finally {
    await task.destroy();
  }
}

function cacheDir(): string {
  return join(app.getPath('userData'), 'study-cache');
}

/** What a study file says, from the cache when the file has not changed. */
export async function readStudyFile(path: string): Promise<StudyRead> {
  const info = await stat(path);
  const key = createHash('sha256').update(`${path.toLowerCase()}|${info.size}|${info.mtimeMs}|1`).digest('hex').slice(0, 32);
  const cached = join(cacheDir(), `${key}.json`);
  try {
    return JSON.parse(await readFile(cached, 'utf8')) as StudyRead;
  } catch {
    // Not read yet, or changed since.
  }
  const bytes = new Uint8Array(await readFile(path));
  const ext = extname(path).toLowerCase();
  const read = ext === '.pdf' ? await readPdf(bytes) : { text: new TextDecoder().decode(bytes) };
  const content: StudyRead = {
    kind: ext === '.pdf' ? 'pdf' : ext === '.md' ? 'md' : 'html',
    fileName: basename(path),
    ...read,
    contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
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
