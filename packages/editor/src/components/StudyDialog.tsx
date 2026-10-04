/**
 * Tools > Study material: the PDF, HTML and Markdown files of the theory
 * folders, and for each which part the AI reads (docs/01-filozofie.md,
 * ch. 9.6). A whole book may stay in the folder; its chapters (from the PDF's
 * table of contents) or pages are chosen here, so the search does not wander
 * into parts that do not belong. The choice goes into the card next to the
 * file, where everyone using the folder finds it.
 */
import { useEffect, useState } from 'react';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { keyOf, parseStudySettings, studyAdvice, type StudySettings } from '@kalketa/sheet';
import { desktop, type TheoryFolder } from '../document.js';
import type { FoundLibrary } from '../theoryLibraries.js';
import { Dialog } from './Dialogs.js';
import { suggestChapters } from '../logic/studySuggest.js';

interface Props {
  readonly catalog: Catalog;
  readonly files: readonly FoundLibrary[];
  readonly sheetPath?: string;
  /** Text of the open calculation, for suggesting the chapters it needs. */
  readonly sheetText?: string;
  onSave(path: string, settings: StudySettings): Promise<void>;
  /** Puts the chosen part of a file into a new sources layer, to be tidied and saved as a library. */
  onImport?(file: FoundLibrary, settings: StudySettings): void;
  onClose(): void;
}

/** The card as the dialog edits it. */
interface Draft {
  readonly title: string;
  readonly key: string;
  readonly chapters: readonly number[];
  readonly pages: string;
}

function draftOf(file: FoundLibrary): Draft {
  const s = file.study!.settings;
  return { title: s.title ?? file.library.manifest.title, key: s.key ?? file.library.manifest.key, chapters: s.chapters ?? [], pages: s.pages ?? '' };
}

/** The card from the draft: title and key are written down, so citations keep their key. */
function settingsOf(file: FoundLibrary, draft: Draft): StudySettings {
  const title = draft.title.trim();
  const key = draft.key.trim().toUpperCase();
  return parseStudySettings({ ...file.study!.settings, ...(title ? { title } : {}), key: key || keyOf(title || file.library.manifest.title), chapters: [...draft.chapters].sort((a, b) => a - b), pages: draft.pages.trim() });
}

export function StudyDialog({ catalog, files, sheetPath, sheetText = '', onSave, onImport, onClose }: Props) {
  const study = files.filter((f) => f.study);
  const [current, setCurrent] = useState(study[0]?.path);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failed, setFailed] = useState<string>();
  // What the suggestion found, said once under the chapters.
  const [suggested, setSuggested] = useState<string>();
  const [folders, setFolders] = useState<readonly { kind: TheoryFolder; dir: string }[]>([]);
  useEffect(() => void desktop?.theoryFolders(sheetPath).then(setFolders), [sheetPath]);

  // The files may arrive after the dialog opens: the first is chosen until the user picks one.
  const file = study.find((f) => f.path === current) ?? study[0];
  const draft = file ? (drafts[file.path] ?? draftOf(file)) : undefined;
  const set = (change: Partial<Draft>) => file && draft && setDrafts((all) => ({ ...all, [file.path]: { ...draft, ...change } }));

  /** Writes the cards that changed; false when one could not be written. */
  const save = async () => {
    try {
      for (const f of study) {
        const d = drafts[f.path];
        if (d) await onSave(f.path, settingsOf(f, d));
      }
      return true;
    } catch (error) {
      setFailed(t(catalog, 'study.saveFailed', { error: error instanceof Error ? error.message : String(error) }));
      return false;
    }
  };

  const nameOf = (f: FoundLibrary) => f.path.split(/[\\/]/).pop() ?? f.path;
  const sizeOf = (f: FoundLibrary) => {
    const c = f.study!.content;
    return c.kind === 'pdf' ? t(catalog, 'study.sizePdf', { pages: String(c.pages.length) }) : t(catalog, 'study.sizeChapters', { kind: c.kind.toUpperCase(), count: String(c.pages.length) });
  };
  const adviceOf = (f: FoundLibrary) => {
    const d = drafts[f.path];
    return studyAdvice(f.study!.content, d ? settingsOf(f, d) : f.study!.settings);
  };

  return (
    <Dialog title={t(catalog, 'study.title')} catalog={catalog} wide onClose={onClose} onOk={() => void save().then((saved) => saved && onClose())}>
      <p className="hint study-intro">{t(catalog, 'study.intro')}</p>
      {study.length === 0 ? (
        <div className="study-none">
          <p>{t(catalog, 'study.none')}</p>
          <ul>
            {folders.map((f) => (
              <li key={f.kind}>
                {t(catalog, `library.folder.${f.kind}` as UiKey)}: <code>{f.dir}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="study-layout">
          <ul className="study-files" role="listbox" aria-label={t(catalog, 'study.files')}>
            {study.map((f) => {
              const advice = adviceOf(f);
              return (
                <li key={f.path} role="option" aria-selected={f.path === file?.path} className={`study-file${f.path === file?.path ? ' active' : ''}`} onClick={() => setCurrent(f.path)}>
                  <span className="study-file-name">{nameOf(f)}</span>
                  <span className="study-file-size">
                    {sizeOf(f)} · {t(catalog, `library.folder.${f.folder}` as UiKey)}
                    {(advice.large || advice.noText) && <span className="study-warn"> ⚠</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {file && draft && (
            <div className="study-edit">
              <div className="study-fields">
                <label className="field">
                  <span>{t(catalog, 'study.name')}</span>
                  <input className="study-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
                </label>
                <label className="field">
                  <span>{t(catalog, 'study.key')}</span>
                  <input className="study-key" value={draft.key} maxLength={6} onChange={(e) => set({ key: e.target.value.toUpperCase() })} />
                </label>
              </div>
              {(() => {
                const advice = adviceOf(file);
                return (
                  <>
                    <p className="study-reads">{t(catalog, 'study.reads', { selected: String(advice.selected), pages: String(advice.pages) })}</p>
                    {advice.large && <p className="study-advice warn">{t(catalog, 'study.large')}</p>}
                    {advice.noText && <p className="study-advice warn">{t(catalog, 'study.noText')}</p>}
                  </>
                );
              })()}
              {(file.study!.content.outline ?? []).length > 0 ? (
                <>
                  <div className="study-chapters-head">
                    <span>{t(catalog, 'study.chapters')}</span>
                    <span className="study-chapter-buttons">
                      {sheetText.trim() && (
                        <button
                          type="button"
                          className="study-suggest secondary"
                          title={t(catalog, 'study.suggestTip')}
                          onClick={() => {
                            const chapters = suggestChapters(file.study!.content, sheetText);
                            if (chapters.length > 0) set({ chapters });
                            setSuggested(chapters.length > 0 ? t(catalog, 'study.suggested', { chapters: chapters.map((i) => file.study!.content.outline![i]!.title).join(', ') }) : t(catalog, 'study.suggestedNone'));
                          }}
                        >
                          {t(catalog, 'study.suggest')}
                        </button>
                      )}
                      <button type="button" className="study-whole secondary" onClick={() => set({ chapters: [], pages: '' })}>
                        {t(catalog, 'study.whole')}
                      </button>
                    </span>
                  </div>
                  {suggested && <p className="study-suggested hint">{suggested}</p>}
                  <ul className="study-chapters">
                    {file.study!.content.outline!.map((c, i) => (
                      <li key={i} style={{ paddingLeft: `${(c.level - 1) * 16}px` }}>
                        <label>
                          <input type="checkbox" checked={draft.chapters.includes(i)} onChange={(e) => set({ chapters: e.target.checked ? [...draft.chapters, i] : draft.chapters.filter((n) => n !== i) })} />
                          <span className="study-chapter-title">{c.title}</span>
                          {file.study!.content.kind === 'pdf' && <span className="study-chapter-page">{file.study!.content.labels?.[c.page - 1] ?? c.page}</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="hint">{t(catalog, 'study.noOutline')}</p>
              )}
              {file.study!.content.kind === 'pdf' && (
                <label className="field">
                  <span>{t(catalog, 'study.pages')}</span>
                  <input className="study-pages" value={draft.pages} placeholder="45–80, 112" onChange={(e) => set({ pages: e.target.value })} />
                </label>
              )}
              {onImport && (
                <div className="study-import">
                  <button
                    type="button"
                    className="study-to-sources secondary"
                    title={t(catalog, 'study.toSourcesTip')}
                    onClick={() =>
                      void save().then((saved) => {
                        if (saved) onImport(file, settingsOf(file, draft));
                      })
                    }
                  >
                    {t(catalog, 'study.toSources')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {failed && <p className="study-advice warn">{failed}</p>}
    </Dialog>
  );
}
