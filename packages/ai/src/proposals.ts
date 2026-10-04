/**
 * Changes the model proposes to the calculation (docs/01-filozofie.md, ch. 9.3):
 * nothing changes until a person accepts. The model writes a proposal as a
 * block of the new lines with the lines they replace:
 *
 *   ```change 8          replaces line 8
 *   ```change 12-14      replaces lines 12 to 14 (an empty block deletes them)
 *   ```change after 14   inserts after line 14 (after 0: at the top)
 *
 * The program checks the lines are there, works out what the change does to
 * the calculation, and the user accepts or rejects it.
 */

export interface ChangeProposal {
  /** First line replaced (1-based); for an insertion, the line it goes after (0: at the top). */
  readonly from: number;
  /** Last line replaced; from - 1 ... for an insertion it equals `from` and `insert` is set. */
  readonly to: number;
  /** The proposal inserts after `from` instead of replacing lines. */
  readonly insert?: boolean;
  /** The new lines. */
  readonly lines: readonly string[];
}

const BLOCK = /^```change\s+(after\s+)?(\d+)(?:\s*-\s*(\d+))?\s*\n([\s\S]*?)^```\s*$/gm;

/** The proposals in an answer, in order; blocks that do not make sense are left out. */
export function parseProposals(answer: string): ChangeProposal[] {
  const proposals: ChangeProposal[] = [];
  for (const m of answer.matchAll(BLOCK)) {
    const insert = !!m[1];
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    if (to < from || (!insert && from < 1)) continue;
    const body = m[4]!.replace(/\n$/, '');
    // The model may copy the numbering of the briefing ("  8 | text"): it is not part of the line.
    const lines = body === '' ? [] : body.split('\n').map((l) => l.replace(/^\s*\d+\s*\|\s?/, ''));
    proposals.push({ from, to: insert ? from : to, ...(insert ? { insert: true } : {}), lines });
  }
  return proposals;
}

/** The answer without its proposal blocks, for showing it with the proposals apart. */
export function withoutProposals(answer: string, placeholder: (n: number) => string): string {
  let n = 0;
  return answer.replace(BLOCK, () => placeholder(++n));
}

/** The lines a proposal replaces, as they are in `source` now; undefined when they are not there. */
export function replacedLines(source: string, proposal: ChangeProposal): string[] | undefined {
  const lines = source.split('\n');
  if (proposal.insert) return proposal.from <= lines.length ? [] : undefined;
  if (proposal.to > lines.length) return undefined;
  return lines.slice(proposal.from - 1, proposal.to);
}

/**
 * The source with several proposals of one answer applied together, their line
 * numbers all meant for `source`; undefined when they overlap. Applied from the
 * bottom up, so the lines above keep their numbers.
 */
export function applyProposals(source: string, proposals: readonly ChangeProposal[]): string | undefined {
  // An insertion after line n comes before a replacement of line n, so the replacement does not move it.
  const order = [...proposals].sort((a, b) => b.from - a.from || Number(!!b.insert) - Number(!!a.insert));
  const replaced = proposals.filter((p) => !p.insert);
  for (let i = 0; i < replaced.length; i++)
    for (let j = i + 1; j < replaced.length; j++) if (replaced[i]!.from <= replaced[j]!.to && replaced[j]!.from <= replaced[i]!.to) return undefined;
  // An insertion inside lines another proposal replaces has no place.
  if (proposals.some((p) => p.insert && replaced.some((r) => p.from >= r.from && p.from < r.to))) return undefined;
  return order.reduce(applyProposal, source);
}

/** The source with the proposal applied. */
export function applyProposal(source: string, proposal: ChangeProposal): string {
  const lines = source.split('\n');
  if (proposal.insert) lines.splice(proposal.from, 0, ...proposal.lines);
  else lines.splice(proposal.from - 1, proposal.to - proposal.from + 1, ...proposal.lines);
  return lines.join('\n');
}
