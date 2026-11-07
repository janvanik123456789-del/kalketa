/** Finding entries by what people type: a word of the title or field, a quantity (σ), its name ("výkon"). */

import { text, type Entry, type Language } from './entry.js';

/** Lower case without accents: "Ohybové" and "ohybove" are found alike. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Everything an entry can be found by, in the language given and in English. */
function haystack(entry: Entry, language: Language, fieldName: string): string {
  const words = [
    text(entry.title, language), entry.title.en, text(entry.group, language), entry.group.en, fieldName,
    ...Object.entries(entry.quantities).flatMap(([q, info]) => [q, text(info.name, language), info.name.en]),
    ...(entry.keywords?.[language] ?? []), ...(entry.keywords?.en ?? []),
  ];
  return fold(words.join('\n'));
}

/**
 * The entries every word of the query is found in, the ones with it in the title first; all of them, in their
 * order, for an empty query. fieldName names the field of an entry in the language of the program.
 */
export function search(entries: readonly Entry[], query: string, language: Language, fieldName: (field: string) => string = (f) => f): Entry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  const found = entries.filter((e) => {
    const hay = haystack(e, language, fieldName(e.field));
    return words.every((w) => hay.includes(w));
  });
  const inTitle = (e: Entry) => words.every((w) => fold(text(e.title, language)).includes(w));
  return [...found.filter(inTitle), ...found.filter((e) => !inTitle(e))];
}
