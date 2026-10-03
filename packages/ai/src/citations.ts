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
const CITATION = /(?:["„“]([^"„“”\n]{3,400})["“”]\s*)?\[(T\d+)\](?:\**\s*:\s*\**\s*["„“]([^"„“”\n]{3,400})["“”])?/g;

/** Letters and digits only, lower case: quotes survive changed spaces, dashes and line breaks. */
function normalized(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Each [Tn] of an answer, in the order it appears. */
export function checkCitations(answer: string, sections: readonly CitableSection[]): Citation[] {
  const byId = new Map(sections.filter((s) => s.id).map((s) => [s.id!, s]));
  return [...answer.matchAll(CITATION)].map((m) => {
    const id = m[2]!;
    const quote = (m[1] ?? m[3])?.trim();
    const section = byId.get(id);
    if (!section) return { id, status: 'unknown', ...(quote ? { quote } : {}) };
    if (quote && !normalized(`${section.title}\n${section.text}`).includes(normalized(quote))) return { id, status: 'misquoted', quote };
    return { id, status: 'ok', ...(quote ? { quote } : {}) };
  });
}
