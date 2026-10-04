/**
 * The AI notes printed as a protocol (docs/01-filozofie.md, ch. 9.7): where
 * the AI drew from, and every change it proposed with the user's decision and
 * review. Written as the notes Markdown, so it prints like any notes layer;
 * the conversations and the model's memory stay out of the print.
 */
import { t, type Catalog } from '@kalketa/i18n';
import type { ChangeEntry } from '@kalketa/sheet';
import type { SourceGroup } from './aiSources.js';

export interface AiProtocolInput {
  /** Text a person or the AI wrote into the layer. */
  readonly text?: string;
  readonly sources: readonly SourceGroup[];
  readonly entries: readonly ChangeEntry[];
}

/** A line of the calculation as inline code; one with a backtick stays plain text. */
function code(line: string): string {
  const text = line.trim();
  return text === '' || text.includes('`') ? text : `\`${text}\``;
}

export function aiProtocol(catalog: Catalog, input: AiProtocolInput): string {
  const when = (iso: string | undefined) => {
    const date = iso ? new Date(iso) : undefined;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: 'short', timeStyle: 'short' }).format(date) : '';
  };
  const out: string[] = [];
  if (input.text?.trim()) out.push(input.text.trim(), '');

  out.push(`## ${t(catalog, 'ai.sources')}`, '');
  if (input.sources.length === 0) out.push(t(catalog, 'ai.sourcesEmpty'), '');
  for (const group of input.sources) {
    const title = group.kind === 'sheet' ? t(catalog, 'ai.sourceSheet') : group.kind === 'library' ? t(catalog, 'ai.sourceLibrary', { key: group.key ?? '', title: group.title }) : t(catalog, 'ai.sourceUnknown');
    out.push(`**${title}**${group.source ? ` – ${t(catalog, 'ai.sourceFrom', { source: group.source })}` : ''}`, '');
    for (const s of group.sections) {
      const counts = [s.checked ? t(catalog, 'ai.citedChecked', { count: String(s.checked) }) : '', s.unsupported ? t(catalog, 'ai.citedUnsupported', { count: String(s.unsupported) }) : '', when(s.last)].filter(Boolean).join(' · ');
      out.push(`- ${s.id} ${s.title}${counts ? ` (${counts})` : ''}`);
    }
    out.push('');
  }

  out.push(`## ${t(catalog, 'ai.changes')}`, '');
  if (input.entries.length === 0) out.push(t(catalog, 'protocol.noChanges'), '');
  for (const e of input.entries) {
    const where = e.insert ? t(catalog, 'proposal.insert', { line: String(e.from) }) : e.from === e.to ? t(catalog, 'proposal.line', { line: String(e.from) }) : t(catalog, 'proposal.lines', { from: String(e.from), to: String(e.to) });
    const decision =
      e.state === 'open'
        ? t(catalog, 'protocol.open')
        : e.state === 'rejected'
          ? t(catalog, 'proposal.rejected', { when: when(e.decided) })
          : e.reviewed
            ? t(catalog, 'proposal.acceptedReviewed', { when: when(e.decided), reviewed: when(e.reviewed) })
            : `${t(catalog, 'proposal.accepted', { when: when(e.decided) })}, ${t(catalog, 'protocol.unreviewed')}`;
    out.push(`- **${when(e.time)}${e.model ? ` · ${e.model}` : ''} · ${where}:** ${decision}`);
    for (const line of e.before ?? []) out.push(`  - ${t(catalog, 'protocol.before')} ${code(line)}`);
    for (const line of e.after) out.push(`  - ${t(catalog, 'protocol.after')} ${code(line)}`);
    if (e.after.length === 0) out.push(`  - ${t(catalog, 'proposal.deletes')}`);
  }
  return out.join('\n').trimEnd() + '\n';
}
