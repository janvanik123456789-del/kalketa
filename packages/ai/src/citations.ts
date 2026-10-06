/**
 * Checking what the model cites (docs/01-filozofie.md, ch. 9.6): every [T3]
 * must name a section of the theory the sheet has, and a quotation right
 * before it ("…" [T3]) must really be in that section. A citation that fails
 * is shown as unsupported, so the user always sees what the model took from
 * the theory and what it made up.
 */

export interface CitableSection {
  readonly id?: string;
  readonly title: string;
  readonly text: string;
}

export type CitationStatus = 'ok' | 'unknown' | 'misquoted';

export interface Citation {
  readonly id: string;
  readonly status: CitationStatus;
  /** The words quoted with it (before it, or after it behind a colon), if any. */
  readonly quote?: string;
}

// A quotation ("…", „…“ or “…”) right before [T3], or after it behind a colon:
// "…" [T3], [T3]: "…", **[T3]:** „…“.
// A section of the sheet's sources is "T3", one of a theory library "PP:T3". Quoted words
// neither start nor end with a space: in sheet code, check "A": x ≤ y  source "[T3]" holds
// no quotation ": x ≤ y  source " between its strings.
const CITATION = /(?:["„“]([^\s"„“”][^"„“”\n]{1,398}[^\s"„“”])["“”]\s*)?\[((?:[A-Z][A-Z0-9]{0,5}:)?T\d+)\](?:\**\s*:\s*\**\s*["„“]([^"„“”\n]{3,400})["“”])?/g;

/** Every [T3] and [PP:T3] in a text: the ids, in order. */
export const CITED_ID = /\[((?:[A-Z][A-Z0-9]{0,5}:)?T\d+)\]/g;

/**
 * Letters and digits only, lower case, no spaces: quotes survive changed spaces, dashes and
 * line breaks, and words glued by the text recognition of a scan ("máv tomto").
 */
function normalized(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** A short reference in brackets, "(viz Obr. 28)", "(33)": a quote may leave it out. */
const REFERENCE = /\s*\([^()\n]{1,30}\)/g;

/** Each [Tn] of an answer, in the order it appears. */
export function checkCitations(answer: string, sections: readonly CitableSection[]): Citation[] {
  const byId = new Map(sections.filter((s) => s.id).map((s) => [s.id!, s]));
  return [...answer.matchAll(CITATION)].map((m) => {
    const id = m[2]!;
    const quote = (m[1] ?? m[3])?.trim();
    const section = byId.get(id);
    if (!section) return { id, status: 'unknown', ...(quote ? { quote } : {}) };
    const text = `${section.title}\n${section.text}`;
    const found = (q: string) => normalized(text).includes(q) || normalized(text.replace(REFERENCE, '')).includes(q);
    if (quote && !found(normalized(quote))) return { id, status: 'misquoted', quote };
    return { id, status: 'ok', ...(quote ? { quote } : {}) };
  });
}
