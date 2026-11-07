/**
 * Insert → Formula… (docs/navrhy/KNIHOVNA-VZORCU.md): a formula of the library found by a word, a quantity or its
 * field; a click on the quantity sought rearranges it, and the lines that go into the sheet are shown before they do.
 */

import { useMemo, useState } from 'react';
import { toDecimalComma } from '@kalketa/core';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { insertion, search, text, type Entry, type Language, type SheetNames } from '@kalketa/library';
import { Dialog } from './Dialogs.js';

export interface FormulaLibraryDialogProps {
  readonly catalog: Catalog;
  readonly entries: readonly Entry[];
  /** The language of the sheet: the comments of the inputs are written in it. */
  readonly language: Language;
  readonly decimalComma: boolean;
  /** What the sheet has above the place the lines go to. */
  readonly sheet: SheetNames;
  /** Ids of the formulas the user starred: offered by the right button on a line and by "/". */
  readonly favourites: readonly string[];
  /** The formula it opens on. */
  readonly initial?: string;
  onToggleFavourite(id: string): void;
  onInsert(lines: readonly string[]): void;
  onClose(): void;
}

export function FormulaLibraryDialog({ catalog, entries, language, decimalComma, sheet, favourites, initial, onToggleFavourite, onInsert, onClose }: FormulaLibraryDialogProps) {
  const ui: Language = catalog.locale.startsWith('cs') ? 'cs' : 'en';
  const [query, setQuery] = useState('');
  const fieldName = (field: string) => t(catalog, `samples.field.${field}` as UiKey);
  const found = useMemo(() => search(entries, query, ui, fieldName), [entries, query, ui]);
  const [chosenId, setChosenId] = useState<string | undefined>(initial);
  const chosen = found.find((e) => e.id === chosenId) ?? found[0];
  const [targets, setTargets] = useState<Readonly<Record<string, string>>>({});
  const target = chosen ? (targets[chosen.id] ?? Object.keys(chosen.quantities)[0]!) : undefined;
  const planned = useMemo(() => (chosen && target ? insertion(chosen, target, sheet, language) : undefined), [chosen, target, sheet, language]);
  const shown = (s: string) => (decimalComma ? toDecimalComma(s) : s);
  const insert = () => planned && onInsert(planned.lines);

  // Field, then its group, then the formulas, in the order found (titles that match first within a group).
  const tree = new Map<string, Map<string, Entry[]>>();
  for (const e of found) {
    const groups = tree.get(e.field) ?? new Map<string, Entry[]>();
    const group = text(e.group, ui);
    groups.set(group, [...(groups.get(group) ?? []), e]);
    tree.set(e.field, groups);
  }

  return (
    <Dialog
      title={t(catalog, 'formulaLib.title')}
      catalog={catalog}
      wide
      onClose={onClose}
      onOk={insert}
      buttons={[
        { label: t(catalog, 'formulaLib.insert'), run: insert, isDefault: true },
        { label: t(catalog, 'dlg.cancel'), run: onClose },
      ]}
    >
      <div className="formula-library">
        <div className="formula-library-list">
          <input
            className="functions-filter"
            type="search"
            autoFocus
            placeholder={t(catalog, 'formulaLib.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="functions-list" role="listbox" aria-label={t(catalog, 'formulaLib.title')}>
            {found.length === 0 && <p className="hint">{t(catalog, 'formulaLib.none')}</p>}
            {[...tree].map(([field, groups]) => (
              <section key={field}>
                <h4>{fieldName(field)}</h4>
                {[...groups].map(([group, items]) => (
                  <div key={group} className="formula-library-group">
                    <h5>{group}</h5>
                    {items.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        role="option"
                        aria-selected={e.id === chosen?.id}
                        data-formula={e.id}
                        className={`function-help-name formula-library-item${e.id === chosen?.id ? ' active' : ''}`}
                        onClick={() => setChosenId(e.id)}
                        onDoubleClick={() => onInsert(insertion(e, targets[e.id] ?? Object.keys(e.quantities)[0]!, sheet, language).lines)}
                      >
                        {favourites.includes(e.id) && <span className="formula-library-star">★ </span>}
                        {text(e.title, ui)}
                      </button>
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
        {chosen && target && planned && (
          <article className="formula-library-detail">
            <h3>
              {text(chosen.title, ui)}
              <button
                type="button"
                className={`formula-library-favourite${favourites.includes(chosen.id) ? ' active' : ''}`}
                aria-pressed={favourites.includes(chosen.id)}
                title={t(catalog, 'formulaLib.favouriteTip')}
                onClick={() => onToggleFavourite(chosen.id)}
              >
                {favourites.includes(chosen.id) ? `★ ${t(catalog, 'formulaLib.favourite')}` : `☆ ${t(catalog, 'formulaLib.toFavourites')}`}
              </button>
            </h3>
            <p className="formula-library-formula">
              <code>{shown(chosen.formula.replace('==', '='))}</code>
            </p>
            <p className="formula-library-source">
              {t(catalog, 'formulaLib.source', { source: text(chosen.source.text, ui) })}
              <span className={`formula-library-status ${chosen.status}`}>
                {chosen.status === 'verified' ? '✓ ' : ''}
                {t(catalog, `formulaLib.status.${chosen.status}` as UiKey)}
              </span>
            </p>
            <div className="formula-library-sought">
              <span>{t(catalog, 'formulaLib.sought')}</span>
              {Object.entries(chosen.quantities).map(([q, info]) => (
                <button
                  key={q}
                  type="button"
                  data-quantity={q}
                  className={q === target ? 'active' : undefined}
                  aria-pressed={q === target}
                  title={text(info.name, ui)}
                  onClick={() => setTargets({ ...targets, [chosen.id]: q })}
                >
                  {q}
                </button>
              ))}
              <span className="hint">{text(chosen.quantities[target]!.name, ui)}</span>
            </div>
            <p>{t(catalog, 'formulaLib.preview')}</p>
            <pre className="formula-library-preview">{planned.lines.map(shown).join('\n')}</pre>
            <ul className="formula-library-notes">
              {planned.reused.map((name) => (
                <li key={`r${name}`}>{t(catalog, 'formulaLib.reused', { name })}</li>
              ))}
              {planned.renamed.map(({ from, to }) => (
                <li key={`n${from}`}>{t(catalog, 'formulaLib.renamed', { from, to })}</li>
              ))}
              {planned.inputs.length > 0 && <li>{t(catalog, 'formulaLib.examples')}</li>}
              {planned.numeric && <li>{t(catalog, 'formulaLib.numeric')}</li>}
            </ul>
          </article>
        )}
      </div>
    </Dialog>
  );
}
