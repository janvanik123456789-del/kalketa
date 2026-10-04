/**
 * Which chapters of a study file a calculation needs (docs/01-filozofie.md,
 * ch. 9.6): the chapters are ranked by the words they share with the
 * calculation (its headings, comments, names of checks), the same search the
 * chat uses for a question. Offered as a choice; the user decides.
 */
import { rankSections } from '@kalketa/ai';
import { chapterPages, chapterTexts, type StudyContent } from '@kalketa/sheet';

/** Chapters (indices of the outline) that match the calculation best, at most `max`, in the order of the book. */
export function suggestChapters(content: StudyContent, sheetText: string, max = 3): number[] {
  const outline = content.outline ?? [];
  const scores = rankSections(chapterTexts(content), sheetText);
  const best = Math.max(0, ...scores);
  if (best <= 0) return [];
  const chosen = scores
    .map((score, i) => ({ score, i }))
    .filter((x) => x.score >= best * 0.5)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.i);
  // A chapter is left out when one of its own sections is chosen: the section is the more precise choice.
  const pagesOf = (i: number) => new Set(chapterPages(outline, i, content.pages.length));
  return chosen
    .filter((i) => !chosen.some((j) => j !== i && outline[j]!.level > outline[i]!.level && [...pagesOf(j)].every((p) => pagesOf(i).has(p))))
    .sort((a, b) => a - b);
}
