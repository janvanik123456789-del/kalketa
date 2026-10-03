/**
 * "Save as a theory library": a sources layer becomes a .kalkt file in one of
 * the folders the program searches. The source is required (book, edition,
 * pages), the program checks the rules (headings, section length) and says
 * what is missing before anything is written.
 */
import { useEffect, useState } from 'react';
import { terms } from '@kalketa/ai';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { checkTheoryLibrary, keyOf, libraryFromLayer, readTheoryLibrary, writeTheoryLibrary, type Layer, type LibraryProblem, type TheoryManifest } from '@kalketa/sheet';
import { desktop, type TheoryFolder } from '../document.js';
import { askConfirm } from './Ask.js';
import { Dialog } from './Dialogs.js';

interface Props {
  readonly catalog: Catalog;
  /** The sources layer, its headings with their ids. */
  readonly layer: Layer;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly language: string;
  readonly sheetPath?: string;
  onSaved(path: string): void;
  onClose(): void;
}

export function TheoryLibraryDialog({ catalog, layer, files, language, sheetPath, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(layer.name ?? '');
  const [key, setKey] = useState(keyOf(layer.name ?? ''));
  const [keyEdited, setKeyEdited] = useState(false);
  const [version, setVersion] = useState('1');
  const [source, setSource] = useState({ title: '', edition: '', pages: '', publisher: '', year: '' });
  const [field, setField] = useState('');
  const [shareable, setShareable] = useState(false);
  const [folders, setFolders] = useState<readonly { kind: TheoryFolder; dir: string }[]>([]);
  const [folder, setFolder] = useState<TheoryFolder>('user');
  const [problems, setProblems] = useState<readonly LibraryProblem[]>([]);
  const [failed, setFailed] = useState<string>();
  // Warnings (a long section) are shown once; OK again saves anyway.
  const [warned, setWarned] = useState(false);

  useEffect(() => void desktop?.theoryFolders(sheetPath).then(setFolders), [sheetPath]);

  const meta = (id?: string): Omit<TheoryManifest, 'format' | 'formatVersion' | 'created' | 'modified' | 'contentHash' | 'id'> & { id?: string } => ({
    ...(id ? { id } : {}),
    key: key.trim().toUpperCase(),
    version: version.trim() || '1',
    title: title.trim(),
    source: Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => k === 'title' || v !== '')) as unknown as TheoryManifest['source'],
    language,
    ...(field.trim() ? { field: field.trim() } : {}),
    shareable,
  });

  const save = async () => {
    if (!desktop) return;
    let library = libraryFromLayer(layer, files, meta());
    const found = checkTheoryLibrary(library);
    setProblems(found);
    if (found.some((p) => p.level === 'error')) return;
    if (found.length > 0 && !warned) return setWarned(true);
    let result = await desktop.theorySave({ folder, ...(sheetPath ? { sheetPath } : {}), title: library.manifest.title, bytes: await writeTheoryLibrary(library, terms) });
    if (result.exists) {
      if (!(await askConfirm(t(catalog, 'library.replace', { path: result.path })))) return;
      // A new version of the same library keeps its id, so calculations that use it find it.
      try {
        const old = await readTheoryLibrary(await desktop.theoryRead(result.path, sheetPath));
        if ('library' in old) library = libraryFromLayer(layer, files, { ...meta(old.library.manifest.id), created: old.library.manifest.created });
      } catch {
        // An unreadable file is simply replaced.
      }
      result = await desktop.theorySave({ folder, ...(sheetPath ? { sheetPath } : {}), title: library.manifest.title, bytes: await writeTheoryLibrary(library, terms), replace: true });
    }
    if (!result.path) return setFailed(t(catalog, 'library.failed'));
    onSaved(result.path);
    onClose();
  };

  const field_ = (label: UiKey, value: string, set: (v: string) => void, className = '') => (
    <label className="field">
      <span>{t(catalog, label)}</span>
      <input type="text" className={className} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <Dialog title={t(catalog, 'library.title')} catalog={catalog} onClose={onClose} onOk={() => void save()}>
      <div className="library-dialog">
        {field_('library.name', title, (v) => (setTitle(v), keyEdited ? undefined : setKey(keyOf(v))), 'library-name')}
        <label className="field">
          <span>{t(catalog, 'library.key')}</span>
          <input type="text" className="library-key" value={key} maxLength={6} onChange={(e) => (setKey(e.target.value.toUpperCase()), setKeyEdited(true))} />
        </label>
        {field_('library.version', version, setVersion)}
        <h4>{t(catalog, 'library.source')}</h4>
        {field_('library.sourceTitle', source.title, (v) => setSource({ ...source, title: v }), 'library-source')}
        {field_('library.edition', source.edition, (v) => setSource({ ...source, edition: v }))}
        {field_('library.pages', source.pages, (v) => setSource({ ...source, pages: v }))}
        {field_('library.publisher', source.publisher, (v) => setSource({ ...source, publisher: v }))}
        {field_('library.year', source.year, (v) => setSource({ ...source, year: v }))}
        {field_('library.field', field, setField)}
        <label className="field">
          <span />
          <span>
            <input type="checkbox" checked={shareable} onChange={(e) => setShareable(e.target.checked)} /> {t(catalog, 'library.shareable')}
          </span>
        </label>
        <label className="field">
          <span>{t(catalog, 'library.folder')}</span>
          <select className="library-folder" value={folder} onChange={(e) => setFolder(e.target.value as TheoryFolder)}>
            {folders.map((f) => (
              <option key={f.kind} value={f.kind} title={f.dir}>
                {t(catalog, `library.folder.${f.kind}` as UiKey)}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">{folders.find((f) => f.kind === folder)?.dir}</p>
        {problems.length > 0 && (
          <ul className="library-problems">
            {problems.map((p, i) => (
              <li key={i} className={p.level}>
                {t(catalog, `library.problem.${p.code}` as UiKey, p.code === 'longSection' ? { section: p.section, chars: String(p.chars) } : {})}
              </li>
            ))}
          </ul>
        )}
        {failed && <p className="library-problems error">{failed}</p>}
      </div>
    </Dialog>
  );
}
