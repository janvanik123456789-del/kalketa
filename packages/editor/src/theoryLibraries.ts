/**
 * Theory libraries in the editor: which ones the searched folders hold, which
 * the calculation uses, and what the model gets from them. A library used by
 * the calculation but not found (another computer, a removed file) still
 * gives the sections the calculation cited, from its copies. Study files
 * (PDF, HTML, Markdown) in the folders are offered as libraries too, made of
 * the chapters or pages their card chooses.
 */
import { useCallback, useEffect, useState } from 'react';
import { CITED_ID } from '@kalketa/ai';
import { librarySections, linkedLibraries, linkFor, parseStudySettings, readTheoryLibrary, studyAdvice, studyContent, studyLibrary, withCitedSections, withLibraryLink, withoutLibraryLink, type LibraryLink, type SheetDocument, type StudyContent, type StudySettings, type TheoryLibrary, type TheorySource } from '@kalketa/sheet';
import { desktop, type TheoryFolder } from './document.js';
export { withoutDuplicates } from './logic/theoryMerge.js';

export interface FoundLibrary {
  readonly library: TheoryLibrary;
  readonly path: string;
  readonly folder: TheoryFolder;
  /** A study file: what it holds and its card. */
  readonly study?: { readonly content: StudyContent; readonly settings: StudySettings };
}

/** One line on a library for the menu: found on disk, used by the calculation, or both. */
export interface LibraryEntry {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly folder?: TheoryFolder;
  readonly linked: boolean;
  readonly found: boolean;
  /** Sections the model gets from it: all when found, else the cited copies. */
  readonly sections: number;
  /** A study file: how much of it is read, and whether it is large and read whole. */
  readonly study?: { readonly kind: 'pdf' | 'html' | 'md'; readonly selected: number; readonly pages: number; readonly large: boolean };
}

type Section = { readonly id?: string; readonly title: string; readonly text: string };

export function sourceText(source: TheorySource): string {
  return [source.title, source.edition, source.publisher, source.year, source.pages ? `s. ${source.pages}` : undefined].filter(Boolean).join(', ');
}

export function useTheoryLibraries(doc: SheetDocument, path: string | undefined, change: (doc: SheetDocument) => void) {
  const [found, setFound] = useState<readonly FoundLibrary[]>([]);

  /** Looks into the folders again (after a library was saved, or when the menu opens). */
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const list = await desktop.theoryList(path);
    const libraries: FoundLibrary[] = [];
    for (const item of list) {
      try {
        if (item.study) {
          const read = await desktop.studyRead(item.path, path);
          const content = studyContent(read.content);
          const settings = parseStudySettings(read.settings);
          const library = studyLibrary(content, settings);
          if (!libraries.some((l) => l.library.manifest.id === library.manifest.id)) libraries.push({ library, path: item.path, folder: item.folder, study: { content, settings } });
          continue;
        }
        const read = await readTheoryLibrary(await desktop.theoryRead(item.path, path));
        // The first folder wins: a project's copy of a library before the company's.
        if ('library' in read && !libraries.some((l) => l.library.manifest.id === read.library.manifest.id)) libraries.push({ library: read.library, path: item.path, folder: item.folder });
      } catch {
        // A file that cannot be read is left out.
      }
    }
    setFound(libraries);
  }, [path]);
  useEffect(() => void refresh(), [refresh]);

  const links = linkedLibraries(doc);
  const byId = new Map(found.map((f) => [f.library.manifest.id, f]));

  const entries: LibraryEntry[] = [
    ...found.map((f) => {
      const advice = f.study && studyAdvice(f.study.content, f.study.settings);
      return {
        id: f.library.manifest.id,
        key: f.library.manifest.key,
        title: f.library.manifest.title,
        folder: f.folder,
        linked: links.some((l) => l.id === f.library.manifest.id),
        found: true,
        sections: librarySections(f.library).length,
        ...(f.study && advice ? { study: { kind: f.study.content.kind, selected: advice.selected, pages: advice.pages, large: advice.large } } : {}),
      };
    }),
    ...links.filter((l) => !byId.has(l.id)).map((l) => ({ id: l.id, key: l.key, title: l.title, linked: true, found: false, sections: l.sections.length })),
  ];

  const toggle = (id: string, on: boolean) => {
    const library = byId.get(id)?.library;
    if (on && library) {
      // A library linked before keeps the copies it has.
      const before = links.find((l) => l.id === id);
      change(withLibraryLink(doc, linkFor(library, before?.sections ?? [])));
    } else if (!on) {
      change(withoutLibraryLink(doc, id));
    }
  };

  /** What the model gets from the libraries the calculation uses. */
  const theory = (): { sections: Section[]; libraries: { key: string; title: string; source: string }[] } => ({
    sections: links.flatMap((l): Section[] => {
      const library = byId.get(l.id)?.library;
      return library ? librarySections(library) : [...l.sections];
    }),
    libraries: links.map((l) => ({ key: l.key, title: l.title, source: sourceText(byId.get(l.id)?.library.manifest.source ?? l.source) })),
  });

  /** Keeps copies of the library sections an answer cited, so the calculation traces them without the library. */
  const recordCited = (answer: string, current: SheetDocument) => {
    const ids = new Set([...answer.matchAll(CITED_ID)].map((m) => m[1]!).filter((id) => id.includes(':')));
    if (ids.size === 0) return current;
    let next = current;
    for (const link of linkedLibraries(current) as LibraryLink[]) {
      const library = byId.get(link.id)?.library;
      if (!library) continue;
      const cited = librarySections(library).filter((s): s is { id: string; title: string; text: string } => !!s.id && ids.has(s.id));
      const updated = withCitedSections(link, cited);
      if (updated !== link) next = withLibraryLink(next, updated);
    }
    return next;
  };

  /** Writes a study file's card and reads the folders again. */
  const saveStudy = async (file: string, settings: StudySettings) => {
    if (!desktop) return;
    await desktop.studySave(file, path, settings);
    await refresh();
  };

  return { found, entries, refresh, toggle, theory, recordCited, saveStudy };
}
