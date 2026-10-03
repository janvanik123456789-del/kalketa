/**
 * Finding the theory a question needs (docs/01-filozofie.md, ch. 9.6): small
 * theory goes to the model whole; from larger theory the program picks the
 * sections that share the most words with the question, within a budget.
 * By words, not embeddings: fast, deterministic, offline, with any model.
 *
 * Words are compared by their stem, without diacritics, so Czech inflection
 * meets ("nosník", "nosníku", "nosníky" are one word here).
 */

export interface SearchableSection {
  readonly id?: string;
  readonly title: string;
  readonly text: string;
}

export interface TheorySelection<S extends SearchableSection> {
  /** Sections the model gets, in the order of the theory. */
  readonly sections: readonly S[];
  /** All sections were sent (the theory is small). */
  readonly whole: boolean;
  /** How many sections the theory has. */
  readonly total: number;
}

/** Theory up to this size goes whole. */
export const WHOLE_THEORY_CHARS = 12_000;
/** From larger theory, the chosen sections together stay under this size. */
export const THEORY_BUDGET_CHARS = 12_000;

// Words that say nothing about the subject (Czech and English).
const STOP = new Set(
  'a aby ale ani ano at bez bude budou by byl byla byli bylo byt co coz cz da do ho i jak jake jaky je jeho jej jejich jen jenz jestli jestlize jiz jsem jsi jsme jsou jste k kam kde kdyz ke ktera ktere kteri ktery kterou ma mam mate me mezi mi mit mne mu muze my na nad nam nas ne nebo nejsou neni nez nic o od on ona oni ono pak po pod podle pokud pro proc proto protoze pri s se si sve svym ta tak take takze tam te tedy ten tento teto tim to tohle toho tom tomu tu tuto ty tyto u uz v ve vsak vy z za ze zda the of and to in is it for on as be are by with this that what which how why from an or not can'.split(' '),
);

/** Lower case, without diacritics. */
function plain(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The stem of a word: its first five letters, where Czech endings rarely reach. */
function stem(word: string): string {
  return word.slice(0, 5);
}

/** A short root ("ohyb") meets its longer forms ("ohybem" → "ohybe"). */
function meets(query: string, term: string): boolean {
  return query === term || (query.length === 4 && term.startsWith(query)) || (term.length === 4 && query.startsWith(term));
}

export function terms(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(plain)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

/**
 * The sections for a question. `cited` are ids already cited in the
 * conversation: they go along, so the model can follow up on them.
 */
export function selectTheory<S extends SearchableSection>(sections: readonly S[], query: string, cited: readonly string[] = [], budget = THEORY_BUDGET_CHARS): TheorySelection<S> {
  const size = (s: S) => s.title.length + s.text.length + 8;
  const all = sections.reduce((n, s) => n + size(s), 0);
  if (all <= WHOLE_THEORY_CHARS) return { sections, whole: true, total: sections.length };

  // BM25-like: a word rare in the theory counts more; the title counts twice.
  const docs = sections.map((s) => [...terms(s.title), ...terms(s.title), ...terms(s.text)]);
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
  const wanted = [...new Set(terms(query))];
  const score = docs.map((d) => {
    return wanted.reduce((sum, t) => {
      const f = d.filter((x) => meets(t, x)).length;
      if (f === 0) return sum;
      const n = docs.filter((other) => other.some((x) => meets(t, x))).length;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      return sum + (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / avg)));
    }, 0);
  });

  const chosen = new Set<number>();
  let used = 0;
  const take = (i: number) => {
    if (chosen.has(i) || used + size(sections[i]!) > budget) return;
    chosen.add(i);
    used += size(sections[i]!);
  };
  sections.forEach((s, i) => s.id && cited.includes(s.id) && take(i));
  score
    .map((value, i) => ({ value, i }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .forEach((x) => take(x.i));
  return { sections: sections.filter((_, i) => chosen.has(i)), whole: false, total: sections.length };
}
