/**
 * The CalcCanvas editor window: classic menu bar, dockable toolbars, the sheet
 * on pages, a side panel and a status bar.
 *
 * The document (sheet text + tables + files) is the only state that matters;
 * it lives in an undo history and everything else is derived from it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { defaultRegistry, rowLabel, SheetSession, type Diagnostic, type Statement } from '@calccanvas/core';
import { catalogFor, CATALOGS, formatDiagnostic, formatNumber, t } from '@calccanvas/i18n';
import { buildPrintDocument, printHtml } from '@calccanvas/render';
import type { SheetDocument } from '@calccanvas/sheet';
import { buildCommands, shortcutOf, type Command } from './commands.js';
import { desktop, emptyDocument, exampleDocument, fileName, fileUri, openBytes, pickAndOpen, saveDocument, tableCache, type FileRef, type OpenedFile } from './document.js';
import { createHistory, record, redo, reset, undo } from './logic/history.js';
import { pageGeometry } from './logic/pages.js';
import { pickOf, replacePickKey } from './logic/pick.js';
import { deleteLines, insertLineAfter, replaceLines, segments } from './logic/segments.js';
import { parseLayout, setVisible, type ToolbarLayout } from './logic/toolbars.js';
import { createTable, importTableFile, type TableChange } from './tableActions.js';
import { AboutDialog, CustomizeDialog, PropertiesDialog, SettingsDialog, ShortcutsDialog } from './components/Dialogs.js';
import { Inspector } from './components/Inspector.js';
import { MenuBar, type Menu, type MenuItem } from './components/MenuBar.js';
import { SheetView, type EditRange } from './components/SheetView.js';
import { TablesView } from './components/TablesView.js';
import { ToolbarFrame, toolbarName } from './components/Toolbars.js';

type Pane = 'details' | 'tables' | 'none';
type DialogKind = 'settings' | 'properties' | 'customize' | 'shortcuts' | 'about';

const MM_TO_PX = 96 / 25.4;
const PAGE_GAP_PX = 24;
const ZOOM_STEPS = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const LANGUAGE_KEY = 'calccanvas.uiLanguage';
const TOOLBARS_KEY = 'calccanvas.toolbars';
const RECENT_KEY = 'calccanvas.recent';
const RECENT_LIMIT = 8;

// Small remembered preferences; storage may be unavailable.
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; harmless.
  }
}

function initialLanguage(): string {
  const saved = stored(LANGUAGE_KEY);
  if (saved && CATALOGS[saved]) return saved;
  // The desktop app passes the system language; a browser has its own.
  const system = (new URLSearchParams(location.search).get('lang') ?? navigator.language).slice(0, 2);
  return CATALOGS[system] ? system : 'en';
}

function recentFiles(): string[] {
  try {
    const list = JSON.parse(stored(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [history, setHistory] = useState(() => createHistory(exampleDocument()));
  const doc = history.present;
  const [savedDoc, setSavedDoc] = useState<SheetDocument>(doc);
  const dirty = doc !== savedDoc;
  const [fileRef, setFileRef] = useState<FileRef | undefined>();
  const [recent, setRecent] = useState(recentFiles);
  const [language, setLanguage] = useState(initialLanguage);
  const [tableEditor, setTableEditor] = useState(false);
  const [editing, setEditing] = useState<EditRange | undefined>();
  const [selected, setSelected] = useState<number | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [dialog, setDialog] = useState<DialogKind | undefined>();
  const [zoomChoice, setZoomChoice] = useState(() => stored('calccanvas.zoom') ?? 'fit2');
  const [pane, setPane] = useState<Pane>(() => (['details', 'tables', 'none'].includes(stored('calccanvas.pane') ?? '') ? (stored('calccanvas.pane') as Pane) : 'details'));
  const [paneWidth, setPaneWidth] = useState(() => Number(stored('calccanvas.paneWidth')) || 380);
  const [toolbars, setToolbars] = useState<ToolbarLayout>(() => parseLayout(stored(TOOLBARS_KEY)));
  const [scrollWidth, setScrollWidth] = useState(1000);
  const scrollRef = useRef<HTMLElement>(null);

  const ui = catalogFor(language);
  // The user writes numbers the way the program language does: 50,5 in Czech.
  const decimalComma = formatNumber(1.5, ui).includes(',');
  const printCatalog = catalogFor(doc.manifest.language ?? language);
  const session = useRef(new SheetSession());
  const buildTables = useRef(tableCache(defaultRegistry));

  const { tables, diagnostics: tableDiagnostics } = useMemo(() => buildTables.current(doc), [doc.tables]);
  const result = useMemo(() => session.current.update(doc.source, { tables }), [doc.source, tables]);
  const resolveFile = useCallback((path: string) => fileUri(doc, path), [doc]);
  const print = useMemo(
    () => buildPrintDocument(result, { catalog: printCatalog, registry: defaultRegistry, digits: doc.layout.digits, title: '', showHidden: true, resolveFile }),
    [result, printCatalog, doc.layout.digits, resolveFile],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScrollWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.title = `${doc.manifest.title}${dirty ? ' •' : ''} — CalcCanvas`;
    desktop?.setCloseGuard({ dirty, message: t(ui, 'editor.closeUnsaved'), discard: t(ui, 'editor.discard'), cancel: t(ui, 'editor.cancel') });
    if (!dirty || desktop) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [doc.manifest.title, dirty, ui]);

  // ------------------------------------------------------------------------
  // Document changes (all go through the undo history)
  // ------------------------------------------------------------------------

  /** `group` merges quick successive changes (typing in one line) into one undo step. */
  const change = (next: SheetDocument, group?: string) => setHistory((h) => record(h, next, group));
  const setSource = (source: string, group?: string) => change({ ...doc, source }, group);

  const replace = (start: number, end: number, text: string) => {
    setSource(replaceLines(doc.source, start, end, text), `line:${start}`);
    setEditing({ start, end: start + text.split('\n').length - 1 });
  };

  const pick = (statement: Statement, key: string) => {
    const info = pickOf(statement);
    const next = info ? replacePickKey(doc.source, info, key) : undefined;
    if (next !== undefined) setSource(next);
  };

  const replaceDocument = (next: SheetDocument, ref: FileRef | undefined, diagnostics: Diagnostic[] = []) => {
    session.current = new SheetSession();
    setHistory(reset(next));
    setSavedDoc(next);
    setFileRef(ref);
    setEditing(undefined);
    setSelected(undefined);
    setNotice(diagnostics.length > 0 ? diagnostics.map((d) => formatDiagnostic(d, ui)).join(' ') : undefined);
    if (ref?.kind === 'path') addRecent(ref.path);
  };

  const addRecent = (path: string) =>
    setRecent((list) => {
      const next = [path, ...list.filter((p) => p !== path)].slice(0, RECENT_LIMIT);
      remember(RECENT_KEY, JSON.stringify(next));
      return next;
    });

  const show = (opened: OpenedFile | undefined) => {
    if (!opened) return;
    if (!opened.document) {
      setNotice([t(ui, 'editor.openFailed'), ...opened.diagnostics.map((d) => formatDiagnostic(d, ui))].join(' '));
      return;
    }
    replaceDocument(opened.document, opened.ref, opened.diagnostics);
  };

  // Files opened by double click or from the command line (desktop only).
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    desktop?.onOpenFile((file) => void openBytes(file.name, file.bytes, { kind: 'path', path: file.path }).then((opened) => showRef.current(opened)));
  }, []);

  const save = async (as = false) => {
    const target = await saveDocument(doc, as ? undefined : fileRef);
    if (target) {
      setFileRef(target);
      if (target.kind === 'path') addRecent(target.path);
    }
    // In a browser without file handles the file is downloaded; it counts as saved.
    if (target || !desktop) setSavedDoc(doc);
  };

  const printoutHtml = () =>
    printHtml(result, {
      catalog: printCatalog,
      registry: defaultRegistry,
      title: /^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(doc.source)?.[1] ?? doc.manifest.title,
      digits: doc.layout.digits,
      paper: doc.layout.paper,
      orientation: doc.layout.orientation,
      resolveFile,
      ...(doc.manifest.author ? { subtitle: doc.manifest.author } : {}),
    });

  const printout = () => {
    const html = printoutHtml();
    if (desktop) {
      void desktop.print(html);
      return;
    }
    // A hidden frame opens the browser's print dialog ("Save as PDF" included).
    document.querySelector('iframe.print-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.className = 'print-frame';
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    frame.onload = () => frame.contentWindow?.print();
    frame.srcdoc = html;
    document.body.append(frame);
  };

  // ------------------------------------------------------------------------
  // Line operations used by Edit and Insert
  // ------------------------------------------------------------------------

  /** Lines of the current line: the one being edited, else the selected statement. */
  const currentRange = (): EditRange | undefined => {
    if (editing) return editing;
    const s = selected !== undefined ? result.statements[selected]?.statement : undefined;
    if (!s) return undefined;
    return segments(doc.source, result.sheet.statements).find((seg) => seg.statement === selected);
  };

  const lineCount = doc.source.split('\n').length;

  const insertLine = (text: string, cursor?: number, edit = true) => {
    const after = currentRange()?.end ?? lineCount;
    setSource(insertLineAfter(doc.source, after, text));
    setEditing(edit ? { start: after + 1, end: after + 1, ...(cursor !== undefined ? { cursor } : {}) } : undefined);
  };

  const uniqueName = (base: string) => {
    const names = new Set(result.statements.flatMap((r) => (r.statement.kind === 'definition' ? [r.statement.name] : [])));
    let n = 1;
    while (names.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  };

  const insert = (kind: 'heading' | 'text' | 'definition' | 'check' | 'pick' | 'pageBreak') => {
    switch (kind) {
      case 'heading':
        return insertLine('## ');
      case 'text':
        return insertLine('""', 1);
      case 'definition':
        return insertLine(`${uniqueName('x')} := `);
      case 'check':
        return insertLine('check "": ', 7);
      case 'pick': {
        const table = tables[0];
        if (!table) return setPane('tables');
        const key = table.rows.length > 0 ? rowLabel(table, 0) : '';
        return insertLine(`${uniqueName('r')} := pick(${table.name}, "${key}")`);
      }
      case 'pageBreak':
        return insertLine('@page', undefined, false);
    }
  };

  const insertSymbol = (symbol: string) => {
    const area = document.querySelector<HTMLTextAreaElement>('textarea.row-editor');
    if (area) {
      area.focus();
      area.setRangeText(symbol, area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      insertLine(symbol);
    }
  };

  const clipboard = (action: 'cut' | 'copy' | 'paste') => {
    const area = document.querySelector<HTMLTextAreaElement>('textarea.row-editor');
    if (!area) return;
    area.focus();
    if (action === 'paste') void navigator.clipboard.readText().then((text) => insertSymbol(text));
    else document.execCommand(action);
  };

  // ------------------------------------------------------------------------
  // View
  // ------------------------------------------------------------------------

  const geometry = pageGeometry(doc.layout.paper, doc.layout.orientation);
  const pageWidthPx = geometry.width * MM_TO_PX;
  const fitPages = zoomChoice.startsWith('fit') ? Number(zoomChoice.slice(3)) : 0;
  const zoom = fitPages > 0 ? Math.max(0.3, Math.min(2, (scrollWidth - 48 - PAGE_GAP_PX * (fitPages - 1)) / (fitPages * pageWidthPx))) : Number(zoomChoice) || 1;

  const setZoom = (choice: string) => {
    setZoomChoice(choice);
    remember('calccanvas.zoom', choice);
  };
  const zoomBy = (direction: 1 | -1) => {
    const next = direction > 0 ? ZOOM_STEPS.find((z) => z > zoom + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.01);
    if (next) setZoom(String(next));
  };
  const choosePane = (next: Pane) => {
    setPane(next);
    remember('calccanvas.pane', next);
  };
  const changeToolbars = (layout: ToolbarLayout) => {
    setToolbars(layout);
    remember(TOOLBARS_KEY, JSON.stringify(layout));
  };

  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = paneWidth;
    let width = startWidth;
    const move = (m: MouseEvent) => {
      width = Math.max(260, Math.min(window.innerWidth - 400, startWidth + startX - m.clientX));
      setPaneWidth(width);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      remember('calccanvas.paneWidth', String(width));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const applyTable = (change_: TableChange | undefined) => {
    if (!change_) return;
    change(change_.doc);
    choosePane('tables');
    if (change_.messages.length > 0) setNotice(change_.messages.join(' '));
  };

  // ------------------------------------------------------------------------
  // Commands, menus, shortcuts
  // ------------------------------------------------------------------------

  const commands: Map<string, Command> = buildCommands({
    catalog: ui,
    desktop: !!desktop,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    zoomChoice,
    pane,
    tableEditor,
    actions: {
      newDocument: () => replaceDocument(emptyDocument(t(ui, 'editor.untitled'), language), undefined),
      open: () => void pickAndOpen({ sheets: t(ui, 'editor.sheetFiles') }).then(show),
      save: () => void save(),
      saveAs: () => void save(true),
      properties: () => setDialog('properties'),
      print: printout,
      exportPdf: () => void desktop?.exportPdf({ html: printoutHtml(), suggestedName: fileName(doc) }),
      example: () => replaceDocument(exampleDocument(), undefined),
      exit: () => window.close(),
      undo: () => {
        setEditing(undefined);
        setHistory(undo);
      },
      redo: () => {
        setEditing(undefined);
        setHistory(redo);
      },
      clipboard,
      duplicateLine: () => {
        const range = currentRange();
        if (!range) return;
        const text = doc.source.split('\n').slice(range.start - 1, range.end).join('\n');
        setSource(insertLineAfter(doc.source, range.end, text));
      },
      deleteLine: () => {
        const range = currentRange();
        if (!range) return;
        setSource(deleteLines(doc.source, range.start, range.end));
        setEditing(undefined);
        setSelected(undefined);
      },
      setZoom,
      zoomBy,
      setPane: choosePane,
      toggleTableEditor: () => setTableEditor((v) => !v),
      customize: () => setDialog('customize'),
      insert,
      newTable: () => applyTable(createTable(doc, ui)),
      importTable: () => void importTableFile(doc, ui).then(applyTable),
      settings: () => setDialog('settings'),
      shortcuts: () => setDialog('shortcuts'),
      about: () => setDialog('about'),
      insertSymbol,
    },
  });

  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || !(e.ctrlKey || e.metaKey)) return;
      const key = shortcutOf(e);
      const target = e.target as HTMLElement;
      const inRow = target.matches?.('textarea.row-editor');
      const inField = !inRow && target.matches?.('input, select, textarea');
      // Clipboard keys stay native; in other fields undo/redo stay native too.
      if (['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+A'].includes(key)) return;
      if (inField && ['Ctrl+Z', 'Ctrl+Y'].includes(key)) return;
      const aliases: Readonly<Record<string, string>> = { 'Ctrl+Shift+Z': 'Ctrl+Y', 'Ctrl+=': 'Ctrl++' };
      const wanted = aliases[key] ?? key;
      const command = [...commandsRef.current.values()].find((c) => c.shortcut === wanted);
      if (command?.enabled) {
        e.preventDefault();
        command.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const cmd = (id: string): MenuItem => ({ kind: 'command', id });
  const sep: MenuItem = { kind: 'separator' };
  const menus: Menu[] = [
    {
      label: t(ui, 'menu.file'),
      items: [
        cmd('file.new'),
        cmd('file.open'),
        {
          kind: 'submenu',
          label: t(ui, 'menu.recent'),
          items: recent.length
            ? recent.map((path, i) => ({
                kind: 'action' as const,
                label: `&${i + 1} ${path}`,
                run: () => void desktop?.openPath(path).then((file) => (file ? openBytes(file.name, file.bytes, { kind: 'path', path: file.path }).then(show) : undefined)),
              }))
            : [{ kind: 'action' as const, label: t(ui, 'menu.noRecent'), enabled: false, run: () => undefined }],
        },
        sep,
        cmd('file.save'),
        cmd('file.saveAs'),
        sep,
        cmd('file.properties'),
        sep,
        cmd('file.print'),
        ...(desktop ? [cmd('file.pdf')] : []),
        sep,
        cmd('file.example'),
        ...(desktop ? [sep, cmd('file.exit')] : []),
      ],
    },
    {
      label: t(ui, 'menu.edit'),
      items: [cmd('edit.undo'), cmd('edit.redo'), sep, cmd('edit.cut'), cmd('edit.copy'), cmd('edit.paste'), sep, cmd('edit.duplicateLine'), cmd('edit.deleteLine')],
    },
    {
      label: t(ui, 'menu.view'),
      items: [
        cmd('view.fit1'),
        cmd('view.fit2'),
        cmd('view.fit3'),
        sep,
        cmd('view.zoomIn'),
        cmd('view.zoomOut'),
        cmd('view.zoom100'),
        sep,
        { kind: 'submenu', label: t(ui, 'menu.pane'), items: [cmd('view.paneDetails'), cmd('view.paneTables'), cmd('view.paneNone')] },
        cmd('view.tableEditor'),
        sep,
        {
          kind: 'submenu',
          label: t(ui, 'menu.toolbars'),
          items: toolbars.toolbars.map((tb) => ({
            kind: 'action' as const,
            label: toolbarName(tb, ui),
            checked: tb.visible,
            run: () => changeToolbars(setVisible(toolbars, tb.id, !tb.visible)),
          })),
        },
        cmd('view.customize'),
      ],
    },
    {
      label: t(ui, 'menu.insert'),
      items: [cmd('insert.heading'), cmd('insert.text'), cmd('insert.definition'), cmd('insert.check'), cmd('insert.pick'), cmd('insert.pageBreak'), sep, cmd('insert.newTable'), cmd('insert.importTable')],
    },
    { label: t(ui, 'menu.tools'), items: [cmd('tools.settings')] },
    { label: t(ui, 'menu.help'), items: [cmd('help.shortcuts'), sep, cmd('help.about')] },
  ];

  const errors = result.diagnostics.filter((d) => d.severity === 'error').length + tableDiagnostics.filter((d) => d.severity === 'error').length;
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning').length;
  const failedChecks = result.checks.filter((c) => !c.passed).length;

  return (
    <div className="app">
      <MenuBar menus={menus} commands={commands} />
      <ToolbarFrame
        layout={toolbars}
        commands={commands}
        catalog={ui}
        onLayout={changeToolbars}
        aside={
          !tableEditor && pane !== 'none' && (
            <>
              <div className="pane-divider" onMouseDown={startResize} role="separator" aria-orientation="vertical" />
              <div className="side-pane" style={{ width: paneWidth }}>
                {pane === 'details' ? (
                  <Inspector
                    result={result}
                    statement={selected}
                    catalog={ui}
                    decimalComma={decimalComma}
                    onSelect={(statement) => {
                      setSelected(statement);
                      const line = result.statements[statement]?.statement.span.line;
                      document.querySelector(`.row[data-line="${line}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }}
                  />
                ) : (
                  <TablesView doc={doc} catalog={ui} diagnostics={tableDiagnostics} resolveFile={resolveFile} onChange={(next) => change(next)} compact />
                )}
              </div>
            </>
          )
        }
      >
        {notice && (
          <div className="notice" role="status" onClick={() => setNotice(undefined)}>
            {notice}
          </div>
        )}
        {tableEditor ? (
          <TablesView doc={doc} catalog={ui} diagnostics={tableDiagnostics} resolveFile={resolveFile} onChange={(next) => change(next)} />
        ) : (
          <div className="workspace">
            <main
              ref={scrollRef}
              className="sheet-scroll"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('pages')) setEditing(undefined);
              }}
              onWheel={(e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                zoomBy(e.deltaY < 0 ? 1 : -1);
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
                geometry={geometry}
                zoom={zoom}
                title={/^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(doc.source)?.[1] ?? doc.manifest.title}
                uiCatalog={printCatalog}
                decimalComma={decimalComma}
              />
            </main>
          </div>
        )}
      </ToolbarFrame>
      <footer className="statusbar">
        <span className={errors > 0 ? 'bad' : ''}>
          {ui.severity.error}: {errors}
        </span>
        <span className={warnings > 0 ? 'warn' : ''}>
          {ui.severity.warning}: {warnings}
        </span>
        <span className={failedChecks > 0 ? 'bad' : ''}>
          {t(ui, 'checks.title')}: {result.checks.length - failedChecks}/{result.checks.length} ✓
        </span>
        <span className="grow" />
        <span>{Math.round(zoom * 100)} %</span>
        <span>{dirty ? t(ui, 'editor.unsaved') : t(ui, 'editor.saved')}</span>
      </footer>
      {dialog === 'settings' && (
        <SettingsDialog
          catalog={ui}
          language={language}
          onApply={(next) => {
            setLanguage(next);
            remember(LANGUAGE_KEY, next);
          }}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'properties' && <PropertiesDialog catalog={ui} doc={doc} onApply={(next) => change(next)} onClose={() => setDialog(undefined)} />}
      {dialog === 'customize' && <CustomizeDialog catalog={ui} layout={toolbars} commands={commands} onApply={changeToolbars} onClose={() => setDialog(undefined)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog catalog={ui} commands={commands} onClose={() => setDialog(undefined)} />}
      {dialog === 'about' && <AboutDialog catalog={ui} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
