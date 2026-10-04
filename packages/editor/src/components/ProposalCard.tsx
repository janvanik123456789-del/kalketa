/**
 * A change of the calculation the model proposed, under its answer: the lines
 * it replaces and the new ones, what it does to the errors and checks, and
 * Accept / Reject. Nothing changes until the user accepts (ch. 9.3); a
 * proposal whose lines have changed since can no longer be accepted.
 */
import { t, type Catalog } from '@kalketa/i18n';
import type { ChangeEntry } from '@kalketa/sheet';
import type { ProposalEffect } from '../logic/proposalEffect.js';

export interface ProposalView {
  readonly entry: ChangeEntry;
  /** 'stale': the lines are no longer as they were; 'missing': they never were there. */
  readonly fits: 'yes' | 'stale' | 'missing';
  readonly effect?: ProposalEffect;
}

function percent(u: number | undefined, catalog: Catalog): string {
  return u === undefined ? '' : `${new Intl.NumberFormat(catalog.locale, { maximumFractionDigits: 0 }).format(u * 100)} %`;
}

export function ProposalCard({ view, n, catalog, onDecide }: { view: ProposalView; n: number; catalog: Catalog; onDecide(id: string, accept: boolean): void }) {
  const { entry, fits, effect } = view;
  const where = entry.insert
    ? t(catalog, 'proposal.insert', { line: String(entry.from) })
    : entry.from === entry.to
      ? t(catalog, 'proposal.line', { line: String(entry.from) })
      : t(catalog, 'proposal.lines', { from: String(entry.from), to: String(entry.to) });
  const when = (iso?: string) => (iso ? new Intl.DateTimeFormat(catalog.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '');
  const check = (c: { passed: boolean; utilization?: number } | undefined) => (c ? `${percent(c.utilization, catalog)} ${c.passed ? '✓' : '✗'}`.trim() : '–');
  return (
    <div className={`proposal ${entry.state}${fits === 'yes' ? '' : ' stale'}`} data-proposal={entry.id}>
      <div className="proposal-head">
        {t(catalog, 'proposal.title', { n: String(n) })} · {where}
      </div>
      <pre className="proposal-diff">
        {(entry.before ?? []).map((l, i) => (
          <div key={`b${i}`} className="del">
            − {l}
          </div>
        ))}
        {entry.after.map((l, i) => (
          <div key={`a${i}`} className="add">
            + {l}
          </div>
        ))}
        {entry.after.length === 0 && <div className="add muted">{t(catalog, 'proposal.deletes')}</div>}
      </pre>
      {effect && entry.state === 'open' && fits === 'yes' && (
        <div className="proposal-effect">
          {effect.errors.before !== effect.errors.after && (
            <div className={effect.errors.after > effect.errors.before ? 'worse' : 'better'}>{t(catalog, 'proposal.errors', { before: String(effect.errors.before), after: String(effect.errors.after) })}</div>
          )}
          {effect.checks.map((c) => (
            <div key={c.label} className={c.after?.passed === false ? 'worse' : 'better'}>
              {c.label}: {check(c.before)} → {check(c.after)}
            </div>
          ))}
          {effect.errors.before === effect.errors.after && effect.checks.length === 0 && <div className="muted">{t(catalog, 'proposal.noEffect')}</div>}
        </div>
      )}
      <div className="proposal-actions">
        {entry.state === 'open' ? (
          fits === 'yes' ? (
            <>
              <button type="button" className="proposal-accept default" onClick={() => onDecide(entry.id, true)}>
                {t(catalog, 'proposal.accept')}
              </button>
              <button type="button" className="proposal-reject" onClick={() => onDecide(entry.id, false)}>
                {t(catalog, 'proposal.reject')}
              </button>
            </>
          ) : (
            <span className="muted">{t(catalog, fits === 'stale' ? 'proposal.stale' : 'proposal.missing')}</span>
          )
        ) : (
          <span className="proposal-state">{t(catalog, entry.state === 'accepted' ? 'proposal.accepted' : 'proposal.rejected', { when: when(entry.decided) })}</span>
        )}
      </div>
    </div>
  );
}
