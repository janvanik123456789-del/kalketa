/**
 * The chosen part of a study PDF into the sources with its pictures and
 * formulas cut out at their place (docs/01-filozofie.md, ch. 9.6): each page is
 * laid out (pdfLayout.ts), its text goes in as lines, its pictures and the
 * formulas the PDF scattered go in as cut-outs. Formula cut-outs are named
 * vzorec-…, so they can be told apart (and written as Kalketa formulas later).
 */
import { selectedPages, studyNotes, type StudyContent, type StudySettings } from '@kalketa/sheet';
import { joinSpacedLetters } from './pdfText.js';
import { linesOf, pageLayout, withoutRunningBoxes, withoutRunningLines, withoutRunningParts } from './pdfLayout.js';
import { cutOut, loadPdf, pageContent } from './pdfDocs.js';
import { picturePath } from './pictures.js';

export interface StudyImport {
  readonly text: string;
  /** The cut-outs, by their path in the sheet. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly pictures: number;
  readonly formulas: number;
}

/** Printed lines as the sources keep them: letters spaced out joined, a word split at a line end put together. */
function textLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = joinSpacedLetters(raw).text;
    const last = out[out.length - 1];
    if (last !== undefined && /\p{Ll}-$/u.test(last) && /^\p{Ll}/u.test(line)) out[out.length - 1] = last.slice(0, -1) + line;
    else out.push(line);
  }
  return out;
}

export async function studyImport(
  file: { readonly path: string; readonly title: string; readonly content: StudyContent; readonly settings: StudySettings },
  options: { readonly sheetPath?: string; readonly folder: string; readonly caption: (page: string) => string; readonly taken: (path: string) => boolean; progress?(page: number, of: number): void },
): Promise<StudyImport> {
  const doc = await loadPdf(file.path, options.sheetPath);
  const files = new Map<string, Uint8Array>();
  const texts = new Map<number, string>();
  let pictures = 0;
  let formulas = 0;
  const pages = selectedPages(file.content, file.settings);
  // All pages read first: a running head or foot is known only from the pages together.
  const contents = [];
  for (const [n, p] of pages.entries()) {
    options.progress?.(n + 1, pages.length);
    const page = await doc.getPage(p);
    contents.push({ page, ...(await pageContent(page)) });
  }
  // What every page repeats at the same place (a navigation panel, its buttons) goes first, then the lines are
  // made of the rest, then running heads and feet go.
  const parts = withoutRunningParts(contents);
  const drawings = withoutRunningBoxes(contents.map((c) => ({ boxes: c.drawn, width: c.width, height: c.height })));
  const pictureBoxes = withoutRunningBoxes(contents.map((c) => ({ boxes: c.pictures, width: c.width, height: c.height })));
  const kept = withoutRunningLines(contents.map((c, i) => ({ lines: parts[i]!.length === c.parts.length ? c.lines : linesOf(parts[i]!), height: c.height })));
  for (const [n, p] of pages.entries()) {
    const { page, width, height } = contents[n]!;
    const images = pictureBoxes[n]!;
    const drawn = drawings[n]!;
    const lines = kept[n]!;
    const label = file.content.labels?.[p - 1] ?? String(p);
    const blocks: string[] = [];
    let run: string[] = [];
    const flush = () => {
      if (run.length) blocks.push(textLines(run).join('\n'));
      run = [];
    };
    for (const item of pageLayout(lines, images, { width, height }, drawn)) {
      if (item.kind === 'text') {
        run.push(item.text);
        continue;
      }
      const bytes = await cutOut(page, item.box, true);
      // A blank part of the page: nothing to show.
      if (!bytes) continue;
      flush();
      const path = picturePath(options.folder, `${item.why === 'formula' ? 'vzorec' : 'obrazek'}-s${label}`, 'image/png', (q) => files.has(q) || options.taken(q));
      files.set(path, bytes);
      if (item.why === 'formula') formulas++;
      else pictures++;
      blocks.push(`![${options.caption(label).replace(/[[\]]/g, '')}](${path})`);
    }
    flush();
    page.cleanup();
    texts.set(p, blocks.join('\n\n'));
  }
  // Chapters and pages as studyNotes arranges them; the text of each page is the laid-out one.
  const text = studyNotes(file.content, file.settings, (p) => texts.get(p) ?? file.content.pages[p - 1] ?? '');
  return { text, files, pictures, formulas };
}
