/**
 * The CalcCanvas editor: sheet view with live evaluation, table editor,
 * details panel; open, save and print.
 *
 * The document (sheet text + tables + files) is the only state that matters;
 * everything else is derived from it on every change.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultRegistry, SheetSession, type Diagnostic, type Statement } from '@calccanvas/core';
import { catalogFor, CATALOGS, formatDiagnostic, t } from '@calccanvas/i18n';
import { buildPrintDocument, printHtml } from '@calccanvas/render';
import type { SheetDocument } from '@calccanvas/sheet';
import { desktop, emptyDocument, exampleDocument, fileName, fileUri, openBytes, pickAndOpen, saveDocument, tableCache, type FileRef, type OpenedFile } from './document.js';
import { deleteLines, insertLineAfter, replaceLines } from './logic/segments.js';
import { replacePickKey, pickOf } from './logic/pick.js';
import { Inspector } from './components/Inspector.js';
import { SheetView, type EditRange } from './components/SheetView.js';
import { TablesView } from './components/TablesView.js';

const LANGUAGE_KEY = 'calccanvas.language';

function initialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && CATALOGS[stored]) return stored;
  } catch {
    // Storage may be unavailable; fall back to the browser language.
  }
  const browser = navigator.language.slice(0, 2);
  return CATALOGS[browser] ? browser : 'en';
}

export function App() {
  const [doc, setDoc] = useState<SheetDocument>(exampleDocument);
  const [fileRef, setFileRef] = useState<FileRef | undefined>();
  const [dirty, setDirty] = useState(false);
  const [language, setLanguage] = useState(initialLanguage);
  const [tab, setTab] = useState<'sheet' | 'tables'>('sheet');
  const [editing, setEditing] = useState<EditRange | undefined>();
  const [selected, setSelected] = useState<number | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const ui = catalogFor(language);
  const printCatalog = catalogFor(doc.manifest.language ?? language);
  const session = useRef(new SheetSession());
  const buildTables = useRef(tableCache(defaultRegistry));

  const { tables, diagnostics: tableDiagnostics } = useMemo(() => buildTables.current(doc), [doc.tables]);
  const result = useMemo(() => session.current.update(doc.source, { tables }), [doc.source, tables]);
  const resolveFile = useCallback((path: string) => fileUri(doc, path), [doc]);
  const print = useMemo(
    () =>
      buildPrintDocument(result, {
        catalog: printCatalog,
        registry: defaultRegistry,
        digits: doc.layout.digits,
        title: '',
        showHidden: true,
        resolveFile,
      }),
    [result, printCatalog, doc.layout.digits, resolveFile],
  );

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Not remembered; harmless.
    }
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.title = `${doc.manifest.title}${dirty ? ' •' : ''} — CalcCanvas`;
    desktop?.setCloseGuard({ dirty, message: t(ui, 'editor.closeUnsaved'), discard: t(ui, 'editor.discard'), cancel: t(ui, 'editor.cancel') });
    if (!dirty || desktop) return;
    // Closing the window with unsaved changes asks first.
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [doc.manifest.title, dirty, ui]);

  const change = (next: SheetDocument) => {
    setDoc(next);
    setDirty(true);
  };
  const setSource = (source: string) => change({ ...doc, source });

  const replace = (start: number, end: number, text: string) => {
    setSource(replaceLines(doc.source, start, end, text));
    setEditing({ start, end: start + text.split('\n').length - 1 });
  };

  const pick = (statement: Statement, key: string) => {
    const info = pickOf(statement);
    const next = info ? replacePickKey(doc.source, info, key) : undefined;
    if (next !== undefined) setSource(next);
  };

  const show = (opened: OpenedFile | undefined) => {
    if (!opened) return;
    if (!opened.document) {
      setNotice([t(ui, 'editor.openFailed'), ...opened.diagnostics.map((d) => formatDiagnostic(d, ui))].join(' '));
      return;
    }
    replaceDocument(opened.document, opened.ref, opened.diagnostics);
  };
  const open = async () => show(await pickAndOpen({ sheets: t(ui, 'editor.sheetFiles') }));

  // Files opened by double click or from the command line (desktop only).
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    desktop?.onOpenFile((file) => void openBytes(file.name, file.bytes, { kind: 'path', path: file.path }).then((opened) => showRef.current(opened)));
  }, []);

  const replaceDocument = (next: SheetDocument, nextRef: FileRef | undefined, diagnostics: Diagnostic[] = []) => {
    session.current = new SheetSession();
    setDoc(next);
    setFileRef(nextRef);
    setDirty(false);
    setEditing(undefined);
    setSelected(undefined);
    setNotice(diagnostics.length > 0 ? diagnostics.map((d) => formatDiagnostic(d, ui)).join(' ') : undefined);
  };

  const save = async () => {
    const saved = await saveDocument(doc, fileRef);
    if (saved) setFileRef(saved);
    // In a browser without file handles the file is downloaded; it counts as saved.
    if (saved || !desktop) setDirty(false);
  };

  const printoutHtml = () => {
    const title = /^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(doc.source)?.[1] ?? doc.manifest.title;
    return printHtml(result, {
      catalog: printCatalog,
      registry: defaultRegistry,
      title,
      digits: doc.layout.digits,
      paper: doc.layout.paper,
      orientation: doc.layout.orientation,
      resolveFile,
      ...(doc.manifest.author ? { subtitle: doc.manifest.author } : {}),
    });
  };

  const printout = () => {
    const html = printoutHtml();
    if (desktop) {
      void desktop.print(html);
      return;
    }
    // A hidden frame with the printout opens the browser's print dialog
    // ("Save as PDF" included) and is not stopped by pop-up blockers.
    document.querySelector('iframe.print-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.className = 'print-frame';
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    frame.onload = () => frame.contentWindow?.print();
    frame.srcdoc = html;
    document.body.append(frame);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const action = { s: save, o: open, p: printout }[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        void action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const errors = result.diagnostics.filter((d) => d.severity === 'error').length + tableDiagnostics.filter((d) => d.severity === 'error').length;
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">CalcCanvas</span>
        <input
          className="title"
          value={doc.manifest.title}
          onChange={(e) => change({ ...doc, manifest: { ...doc.manifest, title: e.target.value } })}
          aria-label="title"
        />
        <button type="button" onClick={() => replaceDocument(emptyDocument(t(ui, 'editor.untitled'), language), undefined)}>
          {t(ui, 'editor.new')}
        </button>
        <button type="button" onClick={open}>
          {t(ui, 'editor.open')}
        </button>
        <button type="button" onClick={save}>
          {t(ui, 'editor.save')}
        </button>
        <button type="button" onClick={() => replaceDocument(exampleDocument(), undefined)}>
          {t(ui, 'editor.example')}
        </button>
        <button type="button" onClick={printout}>
          {t(ui, 'editor.print')}
        </button>
        {desktop && (
          <button type="button" onClick={() => void desktop!.exportPdf({ html: printoutHtml(), suggestedName: fileName(doc) })}>
            {t(ui, 'editor.exportPdf')}
          </button>
        )}
        <span className="sep" />
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'sheet'} onClick={() => setTab('sheet')}>
            {t(ui, 'editor.sheet')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'tables'} onClick={() => setTab('tables')}>
            {t(ui, 'editor.tables')} ({doc.tables.size})
          </button>
        </div>
        <span className="sep" />
        <label>
          {t(ui, 'editor.printLanguage')}{' '}
          <select value={doc.manifest.language ?? language} onChange={(e) => change({ ...doc, manifest: { ...doc.manifest, language: e.target.value } })}>
            {Object.values(CATALOGS).map((c) => (
              <option key={c.locale} value={c.locale}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(ui, 'editor.language')}{' '}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.values(CATALOGS).map((c) => (
              <option key={c.locale} value={c.locale}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span className={`status${errors > 0 ? ' bad' : ''}`}>
          {ui.severity.error}: {errors} · {ui.severity.warning}: {warnings} · {dirty ? t(ui, 'editor.unsaved') : t(ui, 'editor.saved')}
        </span>
      </header>
      {notice && (
        <div className="notice" role="status" onClick={() => setNotice(undefined)}>
          {notice}
        </div>
      )}
      {tab === 'sheet' ? (
        <div className="workspace">
          <main
            className="sheet-scroll"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditing(undefined);
            }}
          >
            <SheetView
              source={doc.source}
              result={result}
              print={print}
              printCatalog={printCatalog}
              editing={editing}
              selected={selected}
              resolveFile={resolveFile}
              onEdit={setEditing}
              onSelect={setSelected}
              onReplace={replace}
              onInsertAfter={(line) => {
                setSource(insertLineAfter(doc.source, line));
                setEditing({ start: line + 1, end: line + 1 });
              }}
              onDelete={(start, end) => setSource(deleteLines(doc.source, start, end))}
              onPick={pick}
            />
          </main>
          <Inspector
            result={result}
            statement={selected}
            catalog={ui}
            onSelect={(statement) => {
              setSelected(statement);
              const line = result.statements[statement]?.statement.span.line;
              document.querySelector(`.row[data-line="${line}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
          />
        </div>
      ) : (
        <TablesView doc={doc} catalog={ui} diagnostics={tableDiagnostics} resolveFile={resolveFile} onChange={change} />
      )}
    </div>
  );
}
