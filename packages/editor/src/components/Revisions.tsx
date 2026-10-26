/**
 * File > Revisions: freeze the calculation as revision A, B, …, compare two
 * states (inputs, results, checks) and find which revision a printout shows.
 */

import { useEffect, useState } from 'react';
import { compareSheets, defaultRegistry, type ComparedValue, type CheckState, type SheetComparison, type SheetResult } from '@kalketa/core';
import { formatDate, formatNumber, t, unitGap, type Catalog } from '@kalketa/i18n';
import { evaluateDocument, matchHash, nextRevisionLabel, REVISION_LABEL, revisionDocument, shortHash, type Revision, type RevisionState, type SheetDocument } from '@kalketa/sheet';
import { Dialog } from './Dialogs.js';
import { askConfirm } from './Ask.js';

const CURRENT = '';

export interface RevisionsProps {
  readonly catalog: Catalog;
  readonly doc: SheetDocument;
  /** The calculation as it is now. */
  readonly current: SheetResult;
  readonly state: RevisionState | undefined;
  onFreeze(label: string, note: string): Promise<void>;
  onRemove(label: string): void;
  onOpen(revision: Revision): void;
  onClose(): void;
}

export function RevisionsDialog({ catalog, doc, current, state, onFreeze, onRemove, onOpen, onClose }: RevisionsProps) {
  const revisions = doc.revisions;
  const [label, setLabel] = useState(() => nextRevisionLabel(revisions));
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const last = revisions.at(-1)?.label ?? CURRENT;
  const [from, setFrom] = useState(last);
  const [to, setTo] = useState(CURRENT);
  const [comparison, setComparison] = useState<SheetComparison | undefined>();
  const [printed, setPrinted] = useState('');
  useEffect(() => setLabel(nextRevisionLabel(revisions)), [revisions]);

  const freeze = async () => {
    const wanted = label.trim();
    if (!REVISION_LABEL.test(wanted)) return setProblem(t(catalog, 'rev.badLabel'));
    if (revisions.some((r) => r.label === wanted)) return setProblem(t(catalog, 'rev.exists', { label: wanted }));
    setProblem(undefined);
    await onFreeze(wanted, note.trim());
    setNote('');
    setFrom(wanted);
    setTo(CURRENT);
    setComparison(undefined);
  };

  /** The calculation of a revision, or the current one. */
  const resultOf = async (which: string): Promise<SheetResult | undefined> => {
    if (which === CURRENT) return current;
    const revision = revisions.find((r) => r.label === which);
    const read = revision ? await revisionDocument(revision) : undefined;
    return read?.document ? evaluateDocument(read.document, defaultRegistry).result : undefined;
  };
  const compare = async () => {
    const [a, b] = await Promise.all([resultOf(from), resultOf(to)]);
    if (a && b) setComparison(compareSheets(a, b, defaultRegistry));
  };

  const date = (iso: string) => (iso ? formatDate(Math.floor(Date.parse(iso) / 86_400_000), catalog) : '');
  const stateText = !state?.latest
    ? t(catalog, 'rev.stateNone')
    : state.current
      ? t(catalog, 'rev.stateSame', { label: state.current.label })
      : t(catalog, 'rev.stateChanged', { label: state.latest.label });
  const verified = (() => {
    if (printed.replace(/[^0-9a-f]/gi, '').length < 8) return undefined;
    const found = [...revisions].reverse().find((r) => matchHash(r.hash, printed));
    if (found) return t(catalog, 'rev.verifyRevision', { label: found.label });
    if (state && matchHash(state.hash, printed)) return t(catalog, 'rev.verifyCurrent');
    return t(catalog, 'rev.verifyNone');
  })();
  const choice = (value: string, set: (v: string) => void, name: string) => (
    <select aria-label={name} value={value} onChange={(e) => (set(e.target.value), setComparison(undefined))}>
      {revisions.map((r) => (
        <option key={r.label} value={r.label}>
          {t(catalog, 'rev.colRevision')} {r.label}
        </option>
      ))}
      <option value={CURRENT}>{t(catalog, 'rev.current')}</option>
    </select>
  );

  return (
    <Dialog title={t(catalog, 'rev.title')} catalog={catalog} wide onClose={onClose}>
      <div className="revisions">
        <p className="rev-state">
          {stateText} {state && <span className="rev-hash">{t(catalog, 'rev.fingerprint', { hash: shortHash(state.hash) })}</span>}
        </p>
        <div className="rev-freeze">
          <label>
            {t(catalog, 'rev.label')} <input className="rev-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="grow">
            {t(catalog, 'rev.note')} <input className="rev-note" value={note} placeholder={t(catalog, 'rev.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="rev-freeze-button" onClick={() => void freeze()} disabled={!!state?.current}>
            {t(catalog, 'rev.freeze')}
          </button>
        </div>
        {problem && <p className="rev-problem">{problem}</p>}
        {revisions.length > 0 && (
          <table className="rev-list">
            <thead>
              <tr>
                <th>{t(catalog, 'rev.colRevision')}</th>
                <th>{t(catalog, 'rev.colDate')}</th>
                <th>{t(catalog, 'rev.colAuthor')}</th>
                <th>{t(catalog, 'rev.colNote')}</th>
                <th>{t(catalog, 'rev.colHash')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...revisions].reverse().map((r) => (
                <tr key={r.label}>
                  <td className="rev-name">{r.label}</td>
                  <td>{date(r.created)}</td>
                  <td>{r.author ?? ''}</td>
                  <td>{r.note ?? ''}</td>
                  <td className="rev-hash">{shortHash(r.hash)}</td>
                  <td className="rev-actions">
                    <button type="button" onClick={() => onOpen(r)}>
                      {t(catalog, 'rev.open')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void askConfirm(t(catalog, 'rev.removeAsk', { label: r.label })).then((yes) => yes && onRemove(r.label))}
                    >
                      {t(catalog, 'rev.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {revisions.length > 0 && (
          <div className="rev-compare">
            {t(catalog, 'rev.compare')} {choice(from, setFrom, 'from')} {t(catalog, 'rev.with')} {choice(to, setTo, 'to')}{' '}
            <button type="button" className="rev-compare-button" onClick={() => void compare()} disabled={from === to}>
              {t(catalog, 'rev.compareRun')}
            </button>
          </div>
        )}
        {comparison && <ComparisonView comparison={comparison} catalog={catalog} digits={doc.layout.digits} />}
        <label className="rev-verify">
          {t(catalog, 'rev.verify')} <input value={printed} placeholder="3f9c 21ab" onChange={(e) => setPrinted(e.target.value)} />
          {verified && <span className="rev-verified">{verified}</span>}
        </label>
      </div>
    </Dialog>
  );
}

function ComparisonView({ comparison, catalog, digits }: { comparison: SheetComparison; catalog: Catalog; digits: number }) {
  if (comparison.same) return <p className="rev-same">{t(catalog, 'rev.same')}</p>;
  const none = '—';
  const value = (v: ComparedValue | undefined): string => {
    if (!v) return none;
    switch (v.kind) {
      case 'quantity': {
        if (v.display.unit === 'date') return formatDate(v.display.value, catalog);
        const n = formatNumber(v.display.value, catalog, { digits }).replace('-', '−');
        return v.display.unit ? `${n}${unitGap(v.display.unit)}${v.display.unit}` : n;
      }
      case 'text':
        return v.text;
      case 'boolean':
        return catalog.terms[String(v.value)] ?? String(v.value);
      case 'items':
        return t(catalog, 'rev.items', { count: String(v.count) });
    }
  };
  const check = (c: CheckState | undefined) =>
    c ? `${c.utilization !== undefined ? `${formatNumber(c.utilization * 100, catalog, { digits: 3 })} % ` : ''}${c.passed ? '✓' : '✗'}` : none;
  const percent = (ratio: number | undefined) => {
    if (ratio === undefined || !Number.isFinite(ratio)) return '';
    const change = (ratio - 1) * 100;
    return `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change), catalog, { digits: 3 })} %`;
  };
  // Every value that came out differently, inputs included: the formulas say what was rewritten, this what it gives.
  const results = comparison.values;
  const tableChange = { added: 'rev.tableAdded', removed: 'rev.tableRemoved', changed: 'rev.tableChanged' } as const;
  return (
    <div className="rev-comparison">
      {comparison.formulas.length > 0 && (
        <section>
          <h4>{t(catalog, 'rev.formulas')}</h4>
          <table>
            <tbody>
              {comparison.formulas.map((f) => (
                <tr key={f.name}>
                  <td className="code">{f.before ?? none}</td>
                  <td>→</td>
                  <td className="code">{f.after ?? none}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {results.length > 0 && (
        <section>
          <h4>{t(catalog, 'rev.results')}</h4>
          <table>
            <tbody>
              {results.map((v) => (
                <tr key={v.name}>
                  <td className="code">{v.name}</td>
                  <td>{value(v.before)}</td>
                  <td>→</td>
                  <td>{value(v.after)}</td>
                  <td className="rev-ratio">{percent(v.ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {comparison.checks.length > 0 && (
        <section>
          <h4>{t(catalog, 'rev.checks')}</h4>
          <table>
            <tbody>
              {comparison.checks.map((c) => (
                <tr key={c.label} className={c.after && !c.after.passed ? 'bad' : ''}>
                  <td>{c.label.startsWith('#') ? `${t(catalog, 'checks.check')} ${c.label.slice(1)}` : c.label}</td>
                  <td>{check(c.before)}</td>
                  <td>→</td>
                  <td>{check(c.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {comparison.tables.length > 0 && (
        <section>
          <h4>{t(catalog, 'rev.tables')}</h4>
          <ul>
            {comparison.tables.map((c) => (
              <li key={c.name}>
                {c.name}: {t(catalog, tableChange[c.change])}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
