/**
 * The start screen (File > Start screen, and at a start with no files to open again): a new calculation,
 * a file, a sample to start from with a picture of it, or one of the files opened lately. Any choice
 * closes it; Esc or ✕ closes it and leaves the tab under it as it is.
 */

import { useEffect } from 'react';
import { t, type Catalog } from '@kalketa/i18n';
import type { Sample } from '../samples.js';

export interface StartScreenProps {
  readonly catalog: Catalog;
  readonly samples: readonly Sample[];
  /** The picture of a sample (a data URL), undefined when it has none. */
  readonly picture: (id: string) => string | undefined;
  readonly recent: readonly string[];
  readonly onNew: () => void;
  readonly onOpen: () => void;
  readonly onSample: (id: string) => void;
  readonly onRecent: (path: string) => void;
  readonly onHelp: () => void;
  readonly onClose: () => void;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const folderOf = (path: string) => path.slice(0, Math.max(0, path.length - fileName(path).length - 1));

export function StartScreen(props: StartScreenProps) {
  const { catalog } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // The samples in the language of the program; the guide (field 00) first and larger.
  const own = props.samples.filter((s) => s.language === catalog.locale);
  const shown = own.length > 0 ? own : props.samples;
  const guide = shown.filter((s) => s.field === '00');
  const rest = shown.filter((s) => s.field !== '00');
  const card = (s: Sample, lead = false) => {
    const picture = props.picture(s.id);
    return (
      <button key={s.id} type="button" className={`start-card${lead ? ' lead' : ''}`} data-sample={s.id} onClick={() => props.onSample(s.id)}>
        <span className="start-picture">{picture ? <img src={picture} alt="" /> : <span className="start-no-picture">{s.title.slice(0, 1)}</span>}</span>
        <span className="start-card-text">
          {lead && <span className="start-lead">{t(catalog, 'start.guide')}</span>}
          <span className="start-card-title">{s.title}</span>
          <span className="start-card-field">{t(catalog, `samples.field.${s.field}`)}</span>
        </span>
      </button>
    );
  };
  return (
    <div className="start-screen" role="dialog" aria-label={t(catalog, 'start.title')}>
      <aside className="start-actions">
        <div className="start-brand">
          <span className="start-logo">K</span>
          <span>
            <span className="start-name">Kalketa</span>
            <span className="start-motto">{t(catalog, 'start.motto')}</span>
          </span>
        </div>
        <button type="button" className="start-action primary" data-start="new" onClick={props.onNew}>
          + {t(catalog, 'start.new')}
        </button>
        <button type="button" className="start-action" data-start="open" onClick={props.onOpen}>
          {t(catalog, 'start.open')}
        </button>
        <span className="grow" />
        <button type="button" className="start-link" onClick={props.onHelp}>
          {t(catalog, 'start.help')}
        </button>
      </aside>
      <main className="start-main">
        <button type="button" className="start-close" title={t(catalog, 'start.close')} aria-label={t(catalog, 'start.close')} onClick={props.onClose}>
          ✕
        </button>
        <section>
          <h1>{t(catalog, 'start.samples')}</h1>
          <p className="start-hint">{t(catalog, 'start.samplesHint')}</p>
          <div className="start-cards">
            {guide.map((s) => card(s, true))}
            {rest.map((s) => card(s))}
          </div>
        </section>
        {props.recent.length > 0 && (
          <section>
            <h2>{t(catalog, 'start.recent')}</h2>
            <div className="start-recent">
              {props.recent.map((path) => (
                <button key={path} type="button" className="start-recent-row" data-recent={path} onClick={() => props.onRecent(path)}>
                  <span className="start-recent-name">{fileName(path)}</span>
                  <span className="start-recent-folder">{folderOf(path)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
