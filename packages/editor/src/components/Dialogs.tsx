/**
 * Classic modal dialogs: Settings, Calculation properties, Customize
 * toolbars, Keyboard shortcuts, Functions, About.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { builtinFunctions, FUNCTION_MODULES, signature } from '@kalketa/core';
import { CATALOGS, t, type Catalog } from '@kalketa/i18n';
import type { SheetDocument } from '@kalketa/sheet';
import { plainLabel, type Command, type CommandCategory } from '../commands.js';
import { commandIcon } from '../icons.js';
import {
  addToolbar,
  defaultLayout,
  removeToolbar,
  renameToolbar,
  SEPARATOR,
  setItems,
  setVisible,
  type ToolbarLayout,
} from '../logic/toolbars.js';
import { toolbarName } from './Toolbars.js';
import { ask } from './Ask.js';
import { AiSettingsSection, type AiDraft } from './AiSettings.js';
import type { AiSettings } from '@kalketa/ai';

interface DialogProps {
  readonly title: string;
  readonly catalog: Catalog;
  readonly children: ReactNode;
  readonly wide?: boolean;
  /** "huge": nearly the whole window, for showing a page. */
  readonly size?: 'huge';
  onClose(): void;
  /** OK button; without it the dialog only has Close. */
  onOk?(): void;
}

export function Dialog({ title, catalog, children, wide, size, onClose, onOk }: DialogProps) {
  const own = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog answers keys (a question may open over another dialog).
      const dialogs = document.querySelectorAll('.dialog-backdrop');
      if (dialogs[dialogs.length - 1] !== own.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && onOk && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onOk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onOk]);

  return (
    <div ref={own} className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' wide' : ''}${size ? ` ${size}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-title">
          <span>{title}</span>
          <button type="button" onClick={onClose} aria-label={t(catalog, 'dlg.close')}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          {onOk ? (
            <>
              <button type="button" className="default" onClick={onOk}>
                {t(catalog, 'dlg.ok')}
              </button>
              <button type="button" onClick={onClose}>
                {t(catalog, 'dlg.cancel')}
              </button>
            </>
          ) : (
            <button type="button" className="default" onClick={onClose}>
              {t(catalog, 'dlg.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface Settings {
  readonly language: string;
  /** Saving a larger file shows a warning (megabytes). */
  readonly sizeLimit: number;
  /** Where a canvas is edited by a double click: right in the sheet, or in a large window. */
  readonly canvasMode: 'inline' | 'window';
  readonly ai: AiSettings;
  /** A newly typed API key, handed to the desktop application on OK. */
  readonly aiKey?: { readonly key: string; readonly remember: boolean };
}

export function SettingsDialog({
  catalog,
  language,
  sizeLimit,
  canvasMode,
  ai,
  aiOn = true,
  onApply,
  onClose,
}: {
  catalog: Catalog;
  language: string;
  sizeLimit: number;
  canvasMode: 'inline' | 'window';
  ai: AiSettings;
  /** The AI is switched on for this run: only then may the dialog look for servers by itself. */
  aiOn?: boolean;
  onApply(settings: Settings): void;
  onClose(): void;
}) {
  const [value, setValue] = useState(language);
  const [limit, setLimit] = useState(String(sizeLimit));
  const [canvas, setCanvas] = useState(canvasMode);
  const [aiDraft, setAiDraft] = useState<AiDraft>({ settings: ai, key: '', remember: true });
  const apply = () => {
    const mb = Number(limit.replace(',', '.'));
    onApply({
      language: value,
      sizeLimit: Number.isFinite(mb) && mb > 0 ? mb : sizeLimit,
      canvasMode: canvas,
      ai: aiDraft.settings,
      ...(aiDraft.key.trim() ? { aiKey: { key: aiDraft.key, remember: aiDraft.remember } } : {}),
    });
    onClose();
  };
  return (
    <Dialog title={t(catalog, 'settings.title')} catalog={catalog} onClose={onClose} onOk={apply}>
      <label className="field">
        <span>{t(catalog, 'settings.language')}</span>
        <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
          {Object.values(CATALOGS).map((c) => (
            <option key={c.locale} value={c.locale}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{t(catalog, 'settings.hint')}</p>
      <label className="field">
        <span>{t(catalog, 'settings.sizeLimit')}</span>
        <input type="number" min="1" step="1" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </label>
      <label className="field">
        <span>{t(catalog, 'settings.canvasMode')}</span>
        <select value={canvas} onChange={(e) => setCanvas(e.target.value === 'window' ? 'window' : 'inline')}>
          <option value="inline">{t(catalog, 'settings.canvasInline')}</option>
          <option value="window">{t(catalog, 'settings.canvasWindow')}</option>
        </select>
      </label>
      <AiSettingsSection catalog={catalog} draft={aiDraft} onChange={setAiDraft} aiOn={aiOn} />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function PropertiesDialog({ catalog, doc, onApply, onClose }: { catalog: Catalog; doc: SheetDocument; onApply(doc: SheetDocument): void; onClose(): void }) {
  const [title, setTitle] = useState(doc.manifest.title);
  const [author, setAuthor] = useState(doc.manifest.author ?? '');
  const [language, setLanguage] = useState(doc.manifest.language ?? catalog.locale);
  const [layout, setLayout] = useState(doc.layout);

  const apply = () => {
    const { author: _old, ...manifest } = doc.manifest;
    onApply({
      ...doc,
      manifest: { ...manifest, title: title.trim() || doc.manifest.title, language, ...(author.trim() ? { author: author.trim() } : {}) },
      layout: { ...layout, digits: Math.max(1, Math.min(15, Math.round(layout.digits) || 4)) },
    });
    onClose();
  };

  return (
    <Dialog title={t(catalog, 'props.title')} catalog={catalog} onClose={onClose} onOk={apply}>
      <label className="field">
        <span>{t(catalog, 'props.docTitle')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>{t(catalog, 'props.author')}</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <label className="field">
        <span>{t(catalog, 'props.printLanguage')}</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {Object.values(CATALOGS).map((c) => (
            <option key={c.locale} value={c.locale}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t(catalog, 'props.paper')}</span>
        <select value={layout.paper} onChange={(e) => setLayout({ ...layout, paper: e.target.value as typeof layout.paper })}>
          {(['A4', 'A3', 'Letter'] as const).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t(catalog, 'props.orientation')}</span>
        <select value={layout.orientation} onChange={(e) => setLayout({ ...layout, orientation: e.target.value as typeof layout.orientation })}>
          <option value="portrait">{t(catalog, 'props.portrait')}</option>
          <option value="landscape">{t(catalog, 'props.landscape')}</option>
        </select>
      </label>
      <label className="field">
        <span>{t(catalog, 'props.digits')}</span>
        <input type="number" min={1} max={15} value={layout.digits} onChange={(e) => setLayout({ ...layout, digits: Number(e.target.value) })} />
      </label>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

const CATEGORIES: readonly { readonly category: CommandCategory; readonly label: (c: Catalog) => string }[] = [
  { category: 'file', label: (c) => t(c, 'menu.file') },
  { category: 'edit', label: (c) => t(c, 'menu.edit') },
  { category: 'view', label: (c) => t(c, 'menu.view') },
  { category: 'insert', label: (c) => t(c, 'menu.insert') },
  { category: 'tools', label: (c) => t(c, 'menu.tools') },
  { category: 'window', label: (c) => t(c, 'menu.window') },
  { category: 'help', label: (c) => t(c, 'menu.help') },
  { category: 'symbol', label: (c) => t(c, 'customize.symbols') },
];

export function CustomizeDialog({
  catalog,
  layout: initial,
  commands,
  onApply,
  onClose,
}: {
  catalog: Catalog;
  layout: ToolbarLayout;
  commands: ReadonlyMap<string, Command>;
  onApply(layout: ToolbarLayout): void;
  onClose(): void;
}) {
  const [layout, setLayout] = useState(initial);
  const [selected, setSelected] = useState(initial.toolbars[0]?.id);
  const [item, setItem] = useState<number | undefined>();
  const [category, setCategory] = useState<CommandCategory>('file');
  const [command, setCommand] = useState<string | undefined>();
  const toolbar = layout.toolbars.find((tb) => tb.id === selected);

  const editItems = (change: (items: string[]) => string[], nextItem?: number) => {
    if (!toolbar) return;
    setLayout(setItems(layout, toolbar.id, change([...toolbar.items])));
    setItem(nextItem);
  };
  const move = (d: -1 | 1) =>
    item !== undefined &&
    toolbar &&
    item + d >= 0 &&
    item + d < toolbar.items.length &&
    editItems((items) => {
      [items[item], items[item + d]] = [items[item + d]!, items[item]!];
      return items;
    }, item + d);

  const describe = (id: string) => (id === SEPARATOR ? '────────' : plainLabel(commands.get(id)?.label ?? id));

  return (
    <Dialog title={t(catalog, 'customize.title')} catalog={catalog} wide onClose={onClose} onOk={() => (onApply(layout), onClose())}>
      <div className="customize">
        <section>
          <h4>{t(catalog, 'customize.toolbars')}</h4>
          <div className="listbox">
            {layout.toolbars.map((tb) => (
              // The checkbox shows or hides the toolbar; clicking the name only selects it.
              <div key={tb.id} className={tb.id === selected ? 'selected' : ''} onClick={() => (setSelected(tb.id), setItem(undefined))}>
                <input
                  type="checkbox"
                  checked={tb.visible}
                  aria-label={toolbarName(tb, catalog)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setLayout(setVisible(layout, tb.id, e.target.checked))}
                />
                {toolbarName(tb, catalog)}
              </div>
            ))}
          </div>
          <div className="button-column">
            <button
              type="button"
              onClick={async () => {
                const name = (await ask(t(catalog, 'customize.newName')))?.trim();
                if (!name) return;
                const added = addToolbar(layout, name);
                setLayout(added.layout);
                setSelected(added.id);
              }}
            >
              {t(catalog, 'customize.new')}
            </button>
            <button
              type="button"
              disabled={!toolbar}
              onClick={async () => {
                if (!toolbar) return;
                const name = await ask(t(catalog, 'customize.rename'), toolbarName(toolbar, catalog));
                if (name !== undefined) setLayout(renameToolbar(layout, toolbar.id, name));
              }}
            >
              {t(catalog, 'customize.rename')}
            </button>
            <button type="button" disabled={!toolbar || toolbar.builtin} onClick={() => toolbar && (setLayout(removeToolbar(layout, toolbar.id)), setSelected(layout.toolbars[0]?.id))}>
              {t(catalog, 'customize.delete')}
            </button>
            <button type="button" onClick={() => setLayout(defaultLayout())}>
              {t(catalog, 'customize.reset')}
            </button>
          </div>
        </section>
        <section>
          <h4>{t(catalog, 'customize.buttons')}</h4>
          <div className="listbox">
            {toolbar?.items.map((id, i) => (
              <div key={i} className={i === item ? 'selected' : ''} onClick={() => setItem(i)}>
                <span className="cmd-icon">{commandIcon(id) ?? commands.get(id)?.glyph ?? ''}</span>
                {describe(id)}
              </div>
            ))}
          </div>
          <div className="button-row">
            <button type="button" disabled={item === undefined} onClick={() => move(-1)}>
              {t(catalog, 'customize.up')}
            </button>
            <button type="button" disabled={item === undefined} onClick={() => move(1)}>
              {t(catalog, 'customize.down')}
            </button>
            <button type="button" disabled={item === undefined} onClick={() => item !== undefined && editItems((items) => items.filter((_, i) => i !== item))}>
              {t(catalog, 'customize.remove')}
            </button>
            <button type="button" disabled={!toolbar} onClick={() => editItems((items) => [...items, SEPARATOR])}>
              {t(catalog, 'customize.separator')}
            </button>
          </div>
        </section>
        <section>
          <h4>{t(catalog, 'customize.commands')}</h4>
          <select value={category} onChange={(e) => setCategory(e.target.value as CommandCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.category} value={c.category}>
                {plainLabel(c.label(catalog))}
              </option>
            ))}
          </select>
          <div className="listbox">
            {[...commands.values()]
              .filter((cmd) => cmd.category === category)
              .map((cmd) => (
                <div key={cmd.id} className={cmd.id === command ? 'selected' : ''} onClick={() => setCommand(cmd.id)} onDoubleClick={() => editItems((items) => [...items, cmd.id])}>
                  <span className="cmd-icon">{commandIcon(cmd.id) ?? cmd.glyph ?? ''}</span>
                  {plainLabel(cmd.label)}
                </div>
              ))}
          </div>
          <div className="button-row">
            <button type="button" disabled={!command || !toolbar} onClick={() => command && editItems((items) => [...items, command])}>
              {t(catalog, 'customize.add')}
            </button>
          </div>
        </section>
      </div>
      <p className="hint">{t(catalog, 'customize.hint')}</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function ShortcutsDialog({ catalog, commands, onClose }: { catalog: Catalog; commands: ReadonlyMap<string, Command>; onClose(): void }) {
  const rows = [...commands.values()].filter((c) => c.shortcut);
  return (
    <Dialog title={t(catalog, 'help.shortcutsTitle')} catalog={catalog} onClose={onClose}>
      <table className="shortcuts">
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{plainLabel(c.label)}</td>
              <td>
                <kbd>{c.shortcut}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

/** Help on the built-in functions, generated from the function registry. */
export function FunctionsDialog({ catalog, separator, onInsert, onClose }: { catalog: Catalog; separator: string; onInsert(text: string): void; onClose(): void }) {
  const [filter, setFilter] = useState('');
  const wanted = filter.trim().toLowerCase();
  const all = builtinFunctions.all();
  const shown = all.filter((def) => !wanted || def.name.toLowerCase().includes(wanted) || (catalog.functions[def.name] ?? '').toLowerCase().includes(wanted));
  return (
    <Dialog title={t(catalog, 'help.functionsTitle')} catalog={catalog} wide onClose={onClose}>
      <input className="functions-filter" type="search" autoFocus placeholder={t(catalog, 'help.functionsFilter')} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="functions-list">
        {FUNCTION_MODULES.map((module) => {
          const defs = shown.filter((def) => def.module === module);
          if (defs.length === 0) return null;
          return (
            <section key={module}>
              <h4>{catalog.functionModules[module]}</h4>
              <table className="functions">
                <tbody>
                  {defs.map((def) => (
                    <tr key={def.name} onClick={() => onInsert(`${def.name}(`)} title={t(catalog, 'help.functionsInsert')}>
                      <td>
                        <code>{signature(def, separator)}</code>
                      </td>
                      <td>{catalog.functions[def.name] ?? CATALOGS['en']?.functions[def.name] ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
      <p className="hint">{t(catalog, 'help.functionsInsert')}</p>
    </Dialog>
  );
}

export function AboutDialog({ catalog, onClose }: { catalog: Catalog; onClose(): void }) {
  const [notices, setNotices] = useState<string | undefined>();
  if (notices !== undefined) {
    return (
      <Dialog title={t(catalog, 'about.thirdParty')} catalog={catalog} wide onClose={() => setNotices(undefined)}>
        <pre className="notices">{notices}</pre>
      </Dialog>
    );
  }
  return (
    <Dialog title={plainLabel(t(catalog, 'cmd.help.about'))} catalog={catalog} onClose={onClose}>
      <div className="about">
        <img src="./icon.svg" alt="" width="64" height="64" />
        <div>
          <strong>Kalketa 0.1</strong>
          <p>{t(catalog, 'about.text')}</p>
          <p className="hint">{t(catalog, 'about.thirdPartyHint')}</p>
          {/* Loaded when asked for: the notices are long and not needed otherwise. */}
          <button type="button" data-about="notices" onClick={() => void import('../generated/third-party-notices.txt?raw').then((m) => setNotices(m.default))}>
            {t(catalog, 'about.thirdParty')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
