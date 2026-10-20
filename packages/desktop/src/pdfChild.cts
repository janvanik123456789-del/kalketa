/**
 * The process that reads a study PDF (study.ts): started by Electron as a utility process for one file and ended
 * after it. pdf.js parses what anyone may have written into a PDF; a flaw it has reaches only this process, and
 * a file that never ends or eats memory takes only it down, never the program.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

/** A chapter of a PDF's table of contents. */
interface StudyChapter {
  readonly title: string;
  readonly level: number;
  readonly page: number;
}

/** What pdf.js gives for one entry of the table of contents. */
interface OutlineNode {
  readonly title: string;
  readonly dest: string | unknown[] | null;
  readonly items: readonly OutlineNode[];
}

/** The text of each page of a PDF, its printed page numbers and its table of contents. */
async function readPdf(bytes: Uint8Array): Promise<object> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
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

const port = (process as unknown as { parentPort: { once(event: 'message', listener: (e: { data: Uint8Array }) => void): void; postMessage(m: unknown): void } }).parentPort;
port.once('message', (e) => {
  readPdf(e.data).then(
    (read) => port.postMessage({ read }),
    (error: unknown) => port.postMessage({ error: String((error as Error)?.message ?? error) }),
  );
});
