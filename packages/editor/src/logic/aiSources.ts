/**
 * Where the AI drew from (docs/01-filozofie.md, ch. 9.7): the citations of all
 * kept answers, grouped by source: the sheet's own sources (Podklady), each
 * theory library, and citations that point nowhere (unsupported). The web
 * comes when the model gets a tool to search it.
 */
import type { Conversation, LibraryLink } from '@kalketa/sheet';

export interface CitedSection {
  readonly id: string;
  readonly title: string;
  /** Times it was cited and checked, and cited but not found or misquoted. */
  readonly checked: number;
  readonly unsupported: number;
  /** ISO time of the last answer that cited it. */
  readonly last?: string;
}

export interface SourceGroup {
  readonly kind: 'sheet' | 'library' | 'unknown';
  /** Library key, for kind 'library'. */
  readonly key?: string;
  readonly title: string;
  /** Book, edition, pages of a library. */
  readonly source?: string;
  readonly sections: readonly CitedSection[];
}

export function aiSources(
  conversations: readonly Conversation[],
  sheetSections: readonly { readonly id?: string; readonly title: string }[],
  libraries: readonly (Pick<LibraryLink, 'key' | 'title' | 'sections'> & { readonly source?: string })[],
  /** Section titles of the libraries as they are on disk, by id ("PP:T3"). */
  libraryTitles: ReadonlyMap<string, string> = new Map(),
): SourceGroup[] {
  const counts = new Map<string, { checked: number; unsupported: number; last?: string }>();
  for (const c of conversations) {
    for (const turn of c.turns) {
      for (const cite of turn.citations ?? []) {
        const n = counts.get(cite.id) ?? { checked: 0, unsupported: 0 };
        if (cite.status === 'ok') n.checked++;
        else n.unsupported++;
        if (turn.time && (!n.last || turn.time > n.last)) n.last = turn.time;
        counts.set(cite.id, n);
      }
    }
  }
  const section = (id: string, title: string): CitedSection => ({ id, title, ...counts.get(id)! });
  const used = new Set<string>();
  const groups: SourceGroup[] = [];

  const own = sheetSections.filter((s) => s.id && counts.has(s.id)).map((s) => (used.add(s.id!), section(s.id!, s.title)));
  if (own.length) groups.push({ kind: 'sheet', title: '', sections: own });

  for (const library of libraries) {
    const ids = [...counts.keys()].filter((id) => id.startsWith(`${library.key}:`)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!ids.length) continue;
    ids.forEach((id) => used.add(id));
    const title = (id: string) => libraryTitles.get(id) ?? library.sections.find((s) => s.id === id)?.title ?? '';
    groups.push({ kind: 'library', key: library.key, title: library.title, ...(library.source ? { source: library.source } : {}), sections: ids.map((id) => section(id, title(id))) });
  }

  // Cited, but no source of the sheet has it: what the model made up.
  const rest = [...counts.keys()].filter((id) => !used.has(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (rest.length) groups.push({ kind: 'unknown', title: '', sections: rest.map((id) => section(id, '')) });
  return groups;
}
