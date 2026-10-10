/**
 * The paragraphs of the sources read again from the pages of their PDF, each with the text
 * there now beside it: the user checks which replace it (all are checked at first).
 */
import { useState } from 'react';
import { t, type Catalog } from '@kalketa/i18n';
import type { RereadChange } from '../logic/pdfReread.js';
import { Dialog } from './Dialogs.js';

interface Props {
  readonly catalog: Catalog;
  readonly changes: readonly RereadChange[];
  onApply(chosen: readonly RereadChange[]): void;
  onClose(): void;
}

export function RereadDialog({ catalog, changes, onApply, onClose }: Props) {
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set(changes.map((_, i) => i)));
  const apply = () => {
    onApply(changes.filter((_, i) => chosen.has(i)));
    onClose();
  };
  return (
    <Dialog title={t(catalog, 'reread.title')} catalog={catalog} wide onClose={onClose}>
      <p className="help">{t(catalog, 'reread.intro')}</p>
      <div className="reread-list">
        {changes.map((c, i) => (
          <label key={i} className="reread-change">
            <input
              type="checkbox"
              checked={chosen.has(i)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(i);
                else next.delete(i);
                setChosen(next);
              }}
            />
            <div className="reread-texts">
              <div className="reread-old">
                <span className="reread-head">{t(catalog, 'reread.old')}</span>
                {c.old}
              </div>
              <div className="reread-new">
                <span className="reread-head">{t(catalog, 'reread.new')}</span>
                {c.text}
              </div>
            </div>
          </label>
        ))}
      </div>
      <div className="dialog-buttons">
        <button type="button" className="default reread-apply" disabled={chosen.size === 0} onClick={apply}>
          {t(catalog, 'reread.apply')} ({chosen.size})
        </button>
        <button type="button" onClick={onClose}>
          {t(catalog, 'dlg.cancel')}
        </button>
      </div>
    </Dialog>
  );
}
