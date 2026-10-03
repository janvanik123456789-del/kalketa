/**
 * The Kalketa editor window: classic menu bar, dockable toolbars, the sheet
 * on pages, a side panel and a status bar.
 *
 * The document (sheet text + tables + files) is the only state that matters;
 * it lives in an undo history and everything else is derived from it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { defaultRegistry, formatPicture, parsePicture, rowLabel, toDecimalComma, type Diagnostic, type Statement } from '@kalketa/core';
import { catalogFor, CATALOGS, formatDiagnostic, formatNumber, t, type Catalog } from '@kalketa/i18n';
import { buildPrintDocument, printHtml, revisionFooter } from '@kalketa/render';
import { emptyScene, readScene, writeScene, type CanvasScene } from '@kalketa/canvas';
import { CanvasEditor } from '@kalketa/canvas/editor';
import { addLayer, allDiagnostics, appendixLayers, blockAppendices, documentBlocks, isRemovable, LayerSessions, MAIN_LAYER, removeLayer, freezeRevision, removeRevision, revisionDocument, revisionState, shortHash, tablesByLayer, theorySections, updateLayer, withTheoryIds, type AddableLayerKind, type Layer, type RevisionState, type SheetDocument } from '@kalketa/sheet';
import { buildCommands, shortcutOf, type Command } from './commands.js';
import { DEFAULT_AI_SETTINGS, parseAiSettings, type AiSettings, type ChatTurn } from '@kalketa/ai';
import { ChatPane } from './components/ChatPane.js';
import { languageGuide, sheetContext } from './logic/aiContext.js';
import { chooseFile, desktop, emptyDocument, exampleDocument, fileName, fileUri, largestParts, openBytes, pickAndOpen, saveDocument, tableCache, type FileRef, type OpenedFile } from './document.js';
import { record, redo, undo, type History } from './logic/history.js';
import { closeTab, cycleTab, fileNameOf, isDirty, newTab, openTab, type DocTab, type Tabs } from './logic/documents.js';
import { pageGeometry } from './logic/pages.js';
import { pickOf, replacePickKey } from './logic/pick.js';
import { deleteLines, insertLineAfter, moveLines, replaceLines, segments } from './logic/segments.js';
import { parseLayout, setVisible, templateParts, type ToolbarLayout } from './logic/toolbars.js';
import { createTable, importTableFile, type TableChange } from './tableActions.js';
import { captionOf, fromFile, pictureLine, picturePath, pixelWidth, widthFor, type IncomingPicture } from './logic/pictures.js';
import { importBlockFile } from './blockActions.js';
import { AboutDialog, CustomizeDialog, FunctionsDialog, PropertiesDialog, SettingsDialog, ShortcutsDialog } from './components/Dialogs.js';
import { DocumentTabs } from './components/DocumentTabs.js';
import { RevisionsDialog } from './components/Revisions.js';
import { Inspector } from './components/Inspector.js';
import { ask, askConfirm, AskHost } from './components/Ask.js';
import { LAYER_GLYPH, LayersPane, LayerTabs } from './components/LayersPane.js';
import { NotesView } from './components/NotesView.js';
import { MenuBar, type Menu, type MenuItem } from './components/MenuBar.js';
import { SheetView, type EditRange } from './components/SheetView.js';
import { TablesView } from './components/TablesView.js';
import { ToolbarFrame, toolbarName } from './components/Toolbars.js';

type Pane = 'details' | 'tables' | 'layers' | 'chat' | 'none';
type Tab = DocTab<SheetDocument, FileRef>;
type DialogKind = 'settings' | 'properties' | 'revisions' | 'customize' | 'shortcuts' | 'functions' | 'about';

const MM_TO_PX = 96 / 25.4;
const PAGE_GAP_PX = 24;
const ZOOM_STEPS = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const LANGUAGE_KEY = 'kalketa.uiLanguage';
const TOOLBARS_KEY = 'kalketa.toolbars';
const RECENT_KEY = 'kalketa.recent';
const RECENT_LIMIT = 8;
const SIZE_LIMIT_KEY = 'kalketa.sizeLimitMb';
const CANVAS_MODE_KEY = 'kalketa.canvasMode';
/** Provider and model of the AI; keys are kept by the desktop application, not here. */
const AI_SETTINGS_KEY = 'kalketa.ai';
const DEFAULT_SIZE_LIMIT_MB = 50;
/** Layers open side by side at most. */
const MAX_PANES = 3;

// Small remembered preferences; storage may be unavailable.
function stored(key: string): string | null {
  try {
    // Settings saved before the program was renamed (calccanvas.*) are read as well.
    return localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^kalketa\./, 'calccanvas.'));
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

/** Name of a layer: its own, or the name of its kind in the given language. */
function layerName(layer: Layer, catalog: Catalog): string {
  return layer.name ?? t(catalog, `layer.kind.${layer.kind}`);
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
  // Open calculations, one tab each. Everything below that belongs to one
  // document (history, file, open layers) is read from the active tab.
  const [docs, setDocs] = useState<Tabs<SheetDocument, FileRef>>(() => {
    // Another window (Window > New window) starts empty; the first one shows the example.
    const blank = new URLSearchParams(location.search).has('blank');
    const language = initialLanguage();
    const first = blank
      ? newTab<SheetDocument, FileRef>(emptyDocument(t(catalogFor(language), 'editor.untitled'), language), MAIN_LAYER, undefined, true)
      : newTab<SheetDocument, FileRef>(exampleDocument(), MAIN_LAYER);
    return { tabs: [first], active: first.id };
  });
  const tab = docs.tabs.find((d) => d.id === docs.active) ?? docs.tabs[0]!;
  /** A saved calculation is called by its file name; a new one by its title. */
  const docLabel = (d: Tab) =>
    d.path !== undefined ? fileNameOf(d.path) : d.fileRef?.kind === 'handle' ? d.fileRef.handle.name : d.history.present.manifest.title;
  const label = docLabel(tab);
  /** Changes the active document's tab; later changes of the same event build on earlier ones. */
  const updateTab = (f: (d: Tab) => Tab) => {
    const id = tab.id;
    setDocs((s) => ({ ...s, tabs: s.tabs.map((d) => (d.id === id ? f(d) : d)) }));
  };
  const history = tab.history;
  const setHistory = (f: (h: History<SheetDocument>) => History<SheetDocument>) => updateTab((d) => ({ ...d, history: f(d.history) }));
  const doc = history.present;
  const dirty = isDirty(tab);
  const anyDirty = docs.tabs.some(isDirty);
  const fileRef = tab.fileRef;
  const setSavedDoc = (saved: SheetDocument) => updateTab((d) => ({ ...d, savedDoc: saved }));
  const setFileRef = (ref: FileRef) => updateTab((d) => ({ ...d, fileRef: ref, ...(ref.kind === 'path' ? { path: ref.path } : {}) }));
  const [recent, setRecent] = useState(recentFiles);
  const [language, setLanguage] = useState(initialLanguage);
  const [tableEditor, setTableEditor] = useState(false);
  const [editing, setEditing] = useState<EditRange | undefined>();
  const [selected, setSelected] = useState<number | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [dialog, setDialog] = useState<DialogKind | undefined>();
  const [zoomChoice, setZoomChoice] = useState(() => stored('kalketa.zoom') ?? 'fit2');
  // The layer tabs do what the Layers panel did, so the panel no longer opens by itself at start.
  const [pane, setPane] = useState<Pane>(() => (['details', 'tables', 'chat', 'none'].includes(stored('kalketa.pane') ?? '') ? (stored('kalketa.pane') as Pane) : stored('kalketa.pane') === 'layers' ? 'none' : 'details'));
  const [paneWidth, setPaneWidth] = useState(() => Number(stored('kalketa.paneWidth')) || 380);
  // Layers open side by side in this document, and which of them is being worked on.
  const panes = tab.panes;
  const setPanes = (next: readonly string[]) => updateTab((d) => ({ ...d, panes: next }));
  const activePane = tab.activePane;
  const setActivePane = (index: number) => updateTab((d) => ({ ...d, activePane: index }));
  const [sizeLimit, setSizeLimit] = useState(() => Number(stored(SIZE_LIMIT_KEY)) || DEFAULT_SIZE_LIMIT_MB);
  const [toolbars, setToolbars] = useState<ToolbarLayout>(() => parseLayout(stored(TOOLBARS_KEY)));
  const [scrollWidth, setScrollWidth] = useState(1000);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ui = catalogFor(language);
  // The user writes numbers the way the program language does: 50,5 in Czech.
  const decimalComma = formatNumber(1.5, ui).includes(',');
  const printCatalog = catalogFor(doc.manifest.language ?? language);
  // Incremental calculation state of each open document.
  const engines = useRef(new Map<number, { sessions: LayerSessions; tables: ReturnType<typeof tableCache> }>());
  let engine = engines.current.get(tab.id);
  if (!engine) {
    engine = { sessions: new LayerSessions(defaultRegistry), tables: tableCache(defaultRegistry) };
    engines.current.set(tab.id, engine);
  }
  const { sessions, tables: buildTables } = engine;
  useEffect(() => {
    for (const id of engines.current.keys()) if (!docs.tabs.some((d) => d.id === id)) engines.current.delete(id);
  }, [docs.tabs]);

  const { tables, diagnostics: tableDiagnostics } = useMemo(() => buildTables(doc), [buildTables, doc.tables]);
  const blocks = useMemo(() => documentBlocks(doc), [doc.blocks]);
  const evaluation = useMemo(() => sessions.evaluate(doc.source, doc.layers, tables, blocks), [sessions, doc.source, doc.layers, tables, blocks]);

  // Open layers side by side; the active one is being worked on. The printed
  // sheet and auxiliary calculations are edited as pages, data layers as
  // tables, notes as text.
  const layerById = (id: string) => doc.layers.find((l) => l.id === id);
  const firstVisible = (layers: readonly Layer[]) => (layers.find((l) => l.visible) ?? layers[0]!).id;
  const openPanes = panes.filter((id) => layerById(id));
  if (openPanes.length === 0) openPanes.push(firstVisible(doc.layers));
  const activeIndex = Math.min(activePane, openPanes.length - 1);
  const layer = layerById(openPanes[activeIndex]!)!;
  const textOf = (l: Layer) => (l.kind === 'sheet' ? doc.source : (l.text ?? ''));
  const resultOf = (l: Layer) => (l.kind === 'calc' ? evaluation.aux.get(l.id) : undefined) ?? evaluation.main;
  const text = textOf(layer);
  const result = resultOf(layer);
  const nameOf = (l: Layer) => layerName(l, ui);
  const layerTables = useMemo(() => tablesByLayer(doc.layers, doc.tables.keys()), [doc.layers, doc.tables]);
  /**
   * Space by importance: most calculations are just the sheet. A layer gets a
   * tab once it is in use (a data layer with tables, AI notes with text, any
   * layer the user added or opened); the strip appears only when there is
   * more than the sheet, or when the sheet is hidden and must be shown again.
   */
  const inUse = (l: Layer): boolean =>
    l.kind === 'sheet' || l.kind === 'calc' || l.kind === 'sources' || (l.kind === 'data' ? (layerTables.get(l.id)?.length ?? 0) > 0 : Boolean(l.text?.trim()));
  const resolveFile = useCallback((path: string) => fileUri(doc, path), [doc]);
  const openKey = openPanes.join('|');
  const prints = useMemo(
    () =>
      new Map(
        openPanes.flatMap((id) => {
          const l = layerById(id);
          if (l?.kind !== 'sheet' && l?.kind !== 'calc') return [];
          return [[id, buildPrintDocument(resultOf(l), { catalog: printCatalog, registry: defaultRegistry, digits: doc.layout.digits, title: '', showHidden: true, resolveFile })] as const];
        }),
      ),
    [evaluation, openKey, printCatalog, doc.layout.digits, resolveFile],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // "Fit pages" needs the width pages really get: inside a panel, without its scroll bar.
    const measure = () => {
      const sheet = element.querySelector<HTMLElement>('.sheet-scroll');
      setScrollWidth(sheet ? sheet.clientWidth : element.clientWidth / Math.max(1, element.children.length));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('.sheet-scroll').forEach((sheet) => observer.observe(sheet));
    measure();
    return () => observer.disconnect();
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.title = `${label}${dirty ? ' •' : ''} — Kalketa`;
    desktop?.setCloseGuard({ dirty: anyDirty, message: t(ui, 'editor.closeUnsaved'), discard: t(ui, 'editor.discard'), cancel: t(ui, 'editor.cancel') });
    if (!anyDirty || desktop) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [label, dirty, anyDirty, ui]);

  // ------------------------------------------------------------------------
  // Document changes (all go through the undo history)
  // ------------------------------------------------------------------------

  /** `group` merges quick successive changes (typing in one line) into one undo step. */
  const change = (next: SheetDocument, group?: string) => setHistory((h) => record(h, next, group));
  /** Changes the text of a layer; the AI notes and locked layers stay as they are. */
  const setLayerText = (l: Layer, source: string, group?: string, files?: ReadonlyMap<string, Uint8Array>) => {
    if (l.kind === 'ai') return setNotice(t(ui, 'notes.aiReadOnly'));
    if (l.locked) return setNotice(t(ui, 'layers.lockedNotice'));
    const withFiles = files ? { ...doc, files: new Map([...doc.files, ...files]) } : doc;
    change(l.kind === 'sheet' ? { ...withFiles, source } : { ...withFiles, layers: updateLayer(doc.layers, l.id, { text: source }) }, group);
  };
  /** Changes the text of the active layer. */
  const setSource = (source: string, group?: string, files?: ReadonlyMap<string, Uint8Array>) => setLayerText(layer, source, group, files);

  const setLayers = (layers: Layer[]) => {
    change({ ...doc, layers });
    // A layer the user just hid leaves the workspace.
    const hidden = layers.filter((l) => !l.visible && layerById(l.id)?.visible).map((l) => l.id);
    if (hidden.length > 0) {
      const rest = openPanes.filter((id) => !hidden.includes(id));
      setPanes(rest.length > 0 ? rest : [firstVisible(layers)]);
      setActivePane(0);
    }
  };

  const leaveEditing = () => {
    setEditing(undefined);
    setSelected(undefined);
  };

  /** Shows a layer in the active panel, or switches to the panel that has it. */
  const activate = (id: string) => {
    const open = openPanes.indexOf(id);
    if (open >= 0) setActivePane(open);
    else setPanes(openPanes.map((p, i) => (i === activeIndex ? id : p)));
    leaveEditing();
  };

  /** Opens a layer in a panel of its own next to the others. */
  const openBeside = (id: string) => {
    const open = openPanes.indexOf(id);
    if (open >= 0) {
      setActivePane(open);
    } else {
      const next = openPanes.length < MAX_PANES ? [...openPanes, id] : [...openPanes.slice(0, -1), id];
      setPanes(next);
      setActivePane(next.length - 1);
    }
    leaveEditing();
  };

  const closePane = (index: number) => {
    if (openPanes.length <= 1) return;
    setPanes(openPanes.filter((_, i) => i !== index));
    setActivePane(index < activeIndex || (index === activeIndex && index > 0) ? activeIndex - 1 : activeIndex);
    leaveEditing();
  };

  const toggleBeside = (id: string) => {
    const open = openPanes.indexOf(id);
    if (open >= 0) closePane(open);
    else openBeside(id);
  };

  const newLayer = async (kind: AddableLayerKind) => {
    const name = (await ask(t(ui, 'layers.newName'), t(ui, `layer.kind.${kind}`)))?.trim();
    if (!name) return;
    const added = addLayer(doc.layers, kind, name);
    setLayers(added.layers);
    activate(added.id);
  };

  /** Takes a calculation from a file as a block and inserts a line that uses it. */
  const insertBlock = async () => {
    const added = await importBlockFile(doc, ui);
    if (!added) return;
    if ('failed' in added) return setNotice(t(ui, 'blocks.openFailed', { name: added.failed }));
    // Into the calculation being worked on, else at the end of the printed sheet.
    const target = layer.kind === 'sheet' || layer.kind === 'calc' ? layer : doc.layers[0]!;
    const text = textOf(target);
    const after = target === layer ? (currentRange()?.end ?? text.split('\n').length) : text.split('\n').length;
    const line = `${uniqueName(added.name.slice(0, 1).toUpperCase())} := ${added.call}`;
    const source = insertLineAfter(text, after, line);
    change(target.kind === 'sheet' ? { ...added.doc, source } : { ...added.doc, layers: updateLayer(added.doc.layers, target.id, { text: source }) });
    if (target !== layer) activate(target.id);
  };

  const deleteBlock = async (name: string) => {
    if (!(await askConfirm(t(ui, 'blocks.deleteConfirm', { name })))) return;
    const remaining = new Map(doc.blocks);
    remaining.delete(name);
    change({ ...doc, blocks: remaining });
  };

  const deleteLayer = async (id: string) => {
    const target = doc.layers.find((l) => l.id === id);
    if (!target || !isRemovable(target) || !(await askConfirm(t(ui, 'layers.deleteConfirm', { name: nameOf(target) })))) return;
    // Pictures of the layer go with it; tables of a data layer move to another data layer.
    const files = new Map([...doc.files].filter(([path]) => !path.startsWith(`layers/${id}/`)));
    change({ ...doc, layers: removeLayer(doc.layers, id), files });
    setPanes(openPanes.filter((p) => p !== id));
  };

  /** A new table belongs to the active data layer, else to the first one. */
  const assignTable = (next: SheetDocument, name: string): SheetDocument => {
    const target = layer.kind === 'data' ? next.layers.find((l) => l.id === layer.id) : next.layers.find((l) => l.kind === 'data');
    if (!target || target.tables?.includes(name)) return next;
    return { ...next, layers: updateLayer(next.layers, target.id, { tables: [...(target.tables ?? []), name] }) };
  };

  /** Replaces lines of a layer; a line being edited keeps its editor over all its lines. */
  const replaceIn = (target: Layer, start: number, end: number, lines: string) => {
    setLayerText(target, replaceLines(textOf(target), start, end, lines), `${target.id}:line:${start}`);
    if (target.id === layer.id && editing?.start === start) setEditing({ start, end: start + lines.split('\n').length - 1 });
  };

  const pickIn = (l: Layer, statement: Statement, key: string) => {
    const info = pickOf(statement);
    const next = info ? replacePickKey(textOf(l), info, key) : undefined;
    if (next !== undefined) setLayerText(l, next);
  };

  /** Shows a document in a tab of its own (or switches to it when that file is already open). */
  const openDocument = (next: SheetDocument, ref: FileRef | undefined, diagnostics: Diagnostic[] = [], blank = false) => {
    const path = ref?.kind === 'path' ? ref.path : undefined;
    const added = newTab<SheetDocument, FileRef>(next, firstVisible(next.layers), ref ? { ref, ...(path !== undefined ? { path } : {}) } : undefined, blank);
    setDocs((s) => openTab(s, added));
    leaveEditing();
    setNotice(diagnostics.length > 0 ? diagnostics.map((d) => formatDiagnostic(d, ui)).join(' ') : undefined);
    if (path) addRecent(path);
  };

  const switchDocument = (id: number) => {
    if (id === tab.id) return;
    setDocs((s) => ({ ...s, active: id }));
    leaveEditing();
    setNotice(undefined);
  };

  const closeDocument = async (id: number) => {
    const target = docs.tabs.find((d) => d.id === id);
    if (!target) return;
    if (isDirty(target) && !(await askConfirm(t(ui, 'docs.closeUnsaved', { name: docLabel(target) })))) return;
    setDocs((s) => closeTab(s, id, () => newTab<SheetDocument, FileRef>(emptyDocument(t(ui, 'editor.untitled'), language), MAIN_LAYER, undefined, true)));
    leaveEditing();
  };

  const closeAllDocuments = async () => {
    for (const d of docs.tabs) await closeDocument(d.id);
  };

  const addRecent = (path: string) =>
    setRecent((list) => {
      const next = [path, ...list.filter((p) => p !== path)].slice(0, RECENT_LIMIT);
      remember(RECENT_KEY, JSON.stringify(next));
      return next;
    });

  const show = (opened: OpenedFile | undefined) => {
    if (!opened) return;
    // A file that did not end up in a tab of its own is not open here.
    if (!opened.document || !opened.ref) desktop?.setOpenFiles(openPaths ? openPaths.split('\n') : []);
    if (!opened.document) {
      setNotice([t(ui, 'editor.openFailed'), ...opened.diagnostics.map((d) => formatDiagnostic(d, ui))].join(' '));
      return;
    }
    openDocument(opened.document, opened.ref, opened.diagnostics);
  };

  // Files opened by double click or from the command line (desktop only).
  const showRef = useRef(show);
  showRef.current = show;
  // A file another window wanted to open is open here: show it.
  const revealRef = useRef((path: string) => {});
  revealRef.current = (path: string) => {
    const open = docs.tabs.find((d) => d.path !== undefined && d.path.toLowerCase() === path.toLowerCase());
    if (!open) return;
    switchDocument(open.id);
    setNotice(t(ui, 'docs.alreadyOpen'));
  };
  useEffect(() => {
    desktop?.onOpenFile((file) => void openBytes(file.name, file.bytes, { kind: 'path', path: file.path }).then((opened) => showRef.current(opened)));
    desktop?.onShowFile((path) => revealRef.current(path));
  }, []);

  // The application keeps each file in one window only; it needs to know which files are open here.
  const openPaths = docs.tabs.flatMap((d) => (d.path !== undefined ? [d.path] : [])).join('\n');
  useEffect(() => {
    desktop?.setOpenFiles(openPaths ? openPaths.split('\n') : []);
  }, [openPaths]);

  const save = async (as = false) => {
    let size = 0;
    const target = await saveDocument(doc, as ? undefined : fileRef, (bytes) => (size = bytes.length), {
      openElsewhere: t(ui, 'docs.openElsewhere'),
      ...(tab.path !== undefined ? { current: tab.path } : {}),
    });
    if (size > sizeLimit * 1024 * 1024) {
      const mb = (bytes: number) => formatNumber(Math.round(bytes / 104857.6) / 10, ui);
      const items = largestParts(doc).map((p) => t(ui, 'size.largest', { name: p.name, size: mb(p.bytes) }));
      setNotice(t(ui, 'size.warning', { size: mb(size), items: items.join(', ') }));
    }
    if (target) {
      setFileRef(target);
      if (target.kind === 'path') addRecent(target.path);
    }
    // In a browser without file handles the file is downloaded; it counts as saved.
    if (target || !desktop) setSavedDoc(doc);
  };

  // Where the content stands among its revisions; its fingerprint goes into the footer of the printout.
  const [revState, setRevState] = useState<RevisionState | undefined>();
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => void revisionState(doc).then((s) => live && setRevState(s)), 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [doc]);
  const footer = revState
    ? revisionFooter(printCatalog, {
        hash: shortHash(revState.hash),
        ...(revState.current ? { revision: { label: revState.current.label, created: revState.current.created } } : revState.latest ? { after: revState.latest.label } : {}),
      })
    : undefined;

  const printoutHtml = () =>
    printHtml(evaluation.main, {
      catalog: printCatalog,
      registry: defaultRegistry,
      title: /^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(doc.source)?.[1] ?? doc.manifest.title,
      digits: doc.layout.digits,
      paper: doc.layout.paper,
      orientation: doc.layout.orientation,
      resolveFile,
      ...(doc.manifest.author ? { subtitle: doc.manifest.author } : {}),
      appendices: [...appendixLayers(doc.layers, evaluation, (l) => layerName(l, printCatalog)), ...blockAppendices(evaluation.main)],
      ...(footer ? { footer } : {}),
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
    return segments(text, result.sheet.statements).find((seg) => seg.statement === selected);
  };

  const lineCount = text.split('\n').length;

  const insertLine = (line: string, cursor?: number, edit = true) => {
    const after = currentRange()?.end ?? lineCount;
    setSource(insertLineAfter(text, after, line));
    setEditing(edit ? { start: after + 1, end: after + 1, ...(cursor !== undefined ? { cursor } : {}) } : undefined);
  };

  /**
   * Puts pictures into a layer: after `afterLine`, else after the line being
   * edited, else at the end. The picture files go into the calculation file.
   * AI notes and data layers take no pictures; they go to the printed sheet.
   */
  const insertPictures = async (pictures: readonly IncomingPicture[], target: Layer = layer, afterLine?: number) => {
    if (pictures.length === 0) return;
    const into = target.kind === 'ai' || target.kind === 'data' ? doc.layers[0]! : target;
    const folder = into.kind === 'sheet' ? 'images/sheet' : `layers/${into.id}/images`;
    const files = new Map<string, Uint8Array>();
    const taken = (path: string) => doc.files.has(path) || files.has(path);
    const textWidth = geometry.width - geometry.margin.left - geometry.margin.right;
    const lines: string[] = [];
    for (const picture of pictures) {
      const path = picturePath(folder, picture.name || 'obrazek', picture.type, taken);
      files.set(path, picture.bytes);
      // A picture in notes flows with the text; in a calculation it gets a width to drag.
      const width = into.kind === 'sheet' || into.kind === 'calc' ? widthFor(await pixelWidth(picture), textWidth) : undefined;
      lines.push(pictureLine(captionOf(picture.name), path, width));
    }
    const current = textOf(into);
    if (into.kind === 'sources') {
      setLayerText(into, `${current.trimEnd()}\n\n${lines.join('\n\n')}\n`, undefined, files);
      return;
    }
    // Without a place given: after the row being edited or selected, else after the last row in view.
    const at = afterLine ?? (into.id === layer.id ? currentRange()?.end : undefined) ?? lastRowInView(into.id) ?? current.split('\n').length;
    setLayerText(into, insertLineAfter(current, at, lines.join('\n')), undefined, files);
    setEditing(undefined);
    reveal.current = { layer: into.id, line: at + 1 };
  };

  /** The new picture is scrolled into view and briefly highlighted. */
  const reveal = useRef<{ layer: string; line: number } | undefined>(undefined);
  useEffect(() => {
    const wanted = reveal.current;
    if (!wanted) return;
    const row = document.querySelector(`.layer-view[data-layer="${wanted.layer}"] .row[data-line="${wanted.line}"]`);
    if (!row) return;
    reveal.current = undefined;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('just-inserted');
    window.setTimeout(() => row.classList.remove('just-inserted'), 1600);
  });

  const layerRows = (layerId: string) => [...document.querySelectorAll<HTMLElement>(`.layer-view[data-layer="${layerId}"] .row[data-line]`)];
  /** Last line of the row that starts at `row` (a statement may span several lines). */
  const rowEnd = (rows: readonly HTMLElement[], row: HTMLElement, total: number) => {
    const next = rows[rows.indexOf(row) + 1];
    return next ? Number(next.dataset['line']) - 1 : total;
  };
  const lastRowInView = (layerId: string): number | undefined => {
    const view = document.querySelector(`.layer-view[data-layer="${layerId}"] .sheet-scroll`)?.getBoundingClientRect();
    const rows = layerRows(layerId);
    const last = rows
      .filter((r) => {
        const box = r.getBoundingClientRect();
        return view !== undefined && box.top >= view.top && box.bottom <= view.bottom;
      })
      .at(-1);
    const target = doc.layers.find((l) => l.id === layerId);
    return last && target ? rowEnd(rows, last, textOf(target).split('\n').length) : undefined;
  };
  /** The line after which something dropped at (x, y) goes: after the row at or above the pointer on that page. */
  const lineAtPoint = (layerId: string, x: number, y: number): number | undefined => {
    const rows = layerRows(layerId);
    const target = doc.layers.find((l) => l.id === layerId);
    if (!target || rows.length === 0) return undefined;
    const pages = [...new Set(rows.map((r) => r.closest('.page')))].filter((p): p is Element => p !== null);
    // The page under the pointer, or the last page that starts above it (pages side by side or below each other).
    const page = pages.filter((p) => {
      const box = p.getBoundingClientRect();
      return box.top <= y && box.left <= x;
    }).at(-1);
    const above = rows.filter((r) => r.closest('.page') === page && r.getBoundingClientRect().top <= y).at(-1) ?? (page ? rows.filter((r) => r.closest('.page') === page)[0] : undefined);
    return above ? rowEnd(rows, above, textOf(target).split('\n').length) : 0;
  };
  const lineAtRef = useRef(lineAtPoint);
  lineAtRef.current = lineAtPoint;

  /** Another file for an existing picture; caption and width stay. */
  const replacePictureFile = async (target: Layer, start: number, end: number) => {
    const file = await chooseFile('image/*');
    const picture = file ? await fromFile(file) : undefined;
    const current = textOf(target);
    const line = current.split('\n').slice(start - 1, end).join('\n');
    const old = parsePicture(line);
    if (!picture || !old) return;
    const folder = target.kind === 'sheet' ? 'images/sheet' : `layers/${target.id}/images`;
    const path = picturePath(folder, picture.name, picture.type, (p) => doc.files.has(p));
    setLayerText(target, replaceLines(current, start, end, formatPicture({ ...old, path })), undefined, new Map([[path, picture.bytes]]));
  };

  /** The canvas open in the canvas window (its path in the calculation file). */
  const [canvasEdit, setCanvasEdit] = useState<{ path: string; mode: 'inline' | 'window' } | undefined>();
  const canvasPath = canvasEdit?.path;
  /** Where a canvas is edited by default (Tools > Settings): right in the sheet, or in a large window. */
  const [canvasMode, setCanvasMode] = useState<'inline' | 'window'>(() => (stored(CANVAS_MODE_KEY) === 'window' ? 'window' : 'inline'));
  // Conversations with the AI by document tab; kept until the tab closes (not saved yet).
  const [chats, setChats] = useState<Readonly<Record<string, readonly ChatTurn[]>>>({});
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    try {
      return parseAiSettings(JSON.parse(stored(AI_SETTINGS_KEY) ?? 'null'));
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  });
  const openCanvas = (path: string, mode: 'inline' | 'window' = canvasMode) => {
    // Whatever was selected in the sheet steps back while the drawing is edited.
    setSelected(undefined);
    setEditing(undefined);
    setCanvasEdit({ path, mode });
  };
  const saveCanvas = (path: string, scene: CanvasScene, files: ReadonlyMap<string, Uint8Array>) =>
    change({ ...doc, files: new Map([...doc.files, ...files, [path, writeScene(scene)]]) });
  const canvasEditor = (path: string, mode: 'inline' | 'window') => (
    <CanvasEditor
      key={`${mode}:${path}`}
      mode={mode}
      scene={readScene(doc.files.get(path))}
      language={ui.locale}
      ask={ask}
      chooseImage={() => chooseFile('image/*')}
      area={() => document.querySelector('.layer-view.active .sheet-scroll')?.getBoundingClientRect()}
      resolveFile={resolveFile}
      folder={path.replace(/\.json$/, '')}
      taken={(p) => doc.files.has(p)}
      onDone={(scene, files) => {
        saveCanvas(path, scene, files);
        setCanvasEdit(undefined);
      }}
      onCancel={() => setCanvasEdit(undefined)}
      onExpand={(scene, files) => {
        saveCanvas(path, scene, files);
        setCanvasEdit({ path, mode: 'window' });
      }}
    />
  );

  /** Insert > Canvas: an empty drawing as wide as the text, put in like a picture, opened at once. */
  const insertCanvas = () => {
    const into = layer.kind === 'sheet' || layer.kind === 'calc' ? layer : doc.layers[0]!;
    let n = 1;
    while (doc.files.has(`canvases/platno-${n}.json`)) n++;
    const path = `canvases/platno-${n}.json`;
    const textWidth = geometry.width - geometry.margin.left - geometry.margin.right;
    const scene = emptyScene(Math.round(textWidth * 0.9), Math.round(textWidth * 0.45));
    const current = textOf(into);
    const at = (into.id === layer.id ? currentRange()?.end : undefined) ?? lastRowInView(into.id) ?? current.split('\n').length;
    setLayerText(into, insertLineAfter(current, at, formatPicture({ caption: '', path, width: 90 })), undefined, new Map([[path, writeScene(scene)]]));
    setEditing(undefined);
    reveal.current = { layer: into.id, line: at + 1 };
    openCanvas(path);
  };

  const insertPictureFile = async () => {
    const file = await chooseFile('image/*');
    const picture = file ? await fromFile(file) : undefined;
    if (picture) await insertPictures([picture]);
  };

  const uniqueName = (base: string) => {
    const names = new Set(result.statements.flatMap((r) => (r.statement.kind === 'definition' ? [r.statement.name] : [])));
    let n = 1;
    while (names.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  };

  const insert = (kind: 'heading' | 'text' | 'definition' | 'check' | 'pick' | 'pageBreak' | 'clear' | 'chart') => {
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
      case 'clear':
        return insertLine('@clear', undefined, false);
      case 'chart': {
        // A chart of the last function of one variable in the sheet, else an example to rewrite.
        const fn = [...result.statements].reverse().find((r) => r.statement.kind === 'definition' && r.statement.params?.length === 1)?.statement;
        if (fn?.kind === 'definition' && fn.params) {
          const p = fn.params[0]!.name;
          return insertLine(`plot(${fn.name}(${p}), ${p}: 0 .. 10)`);
        }
        return insertLine('plot(sin(x), x: 0 .. 2·π)');
      }
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

  /** A function from the Functions toolbar: into the line being edited at the cursor, else as a new line. */
  const insertTemplate = (template: string, line = false) => {
    const { text: source, cursor } = templateParts(template);
    const area = document.querySelector<HTMLTextAreaElement>('textarea.row-editor');
    if (area && !line) {
      // The line shows decimal-comma notation; commas become semicolons, lengths stay.
      const shown = decimalComma ? toDecimalComma(source) : source;
      const start = area.selectionStart;
      area.focus();
      area.setRangeText(shown, start, area.selectionEnd, 'end');
      area.setSelectionRange(start + cursor, start + cursor);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      insertLine(source, cursor);
    }
  };

  const clipboard = (action: 'cut' | 'copy' | 'paste') => {
    // Edit > Paste puts a picture from the clipboard into the sheet too.
    if (action === 'paste' && desktop) {
      void desktop.clipboardPictures().then((pictures) => {
        if (pictures.length > 0) void insertPictures(pictures);
        else void navigator.clipboard.readText().then((text) => document.querySelector('textarea.row-editor') && insertSymbol(text));
      });
      return;
    }
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
  // Panels side by side share the width; "fit" fits pages into one panel.
  const panelWidth = scrollWidth;
  // The chosen number of pages side by side is kept even in a narrow panel (down to 20 %).
  const zoom = fitPages > 0 ? Math.max(0.2, Math.min(2, (panelWidth - 48 - PAGE_GAP_PX * (fitPages - 1)) / (fitPages * pageWidthPx))) : Number(zoomChoice) || 1;

  const setZoom = (choice: string) => {
    setZoomChoice(choice);
    remember('kalketa.zoom', choice);
  };
  const zoomBy = (direction: 1 | -1) => {
    const next = direction > 0 ? ZOOM_STEPS.find((z) => z > zoom + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.01);
    if (next) setZoom(String(next));
  };
  const choosePane = (next: Pane) => {
    setPane(next);
    remember('kalketa.pane', next);
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
      remember('kalketa.paneWidth', String(width));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const applyTable = (change_: TableChange | undefined) => {
    if (!change_) return;
    const next = assignTable(change_.doc, change_.name);
    change(next);
    // The table opens in its data layer next to the sheet.
    const home = next.layers.find((l) => l.kind === 'data' && l.tables?.includes(change_.name));
    if (home) openBeside(home.id);
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
    documents: docs.tabs.length,
    actions: {
      newDocument: () => openDocument(emptyDocument(t(ui, 'editor.untitled'), language), undefined, [], true),
      open: () => void pickAndOpen({ sheets: t(ui, 'editor.sheetFiles') }).then(show),
      save: () => void save(),
      saveAs: () => void save(true),
      closeDocument: () => void closeDocument(tab.id),
      closeAllDocuments: () => void closeAllDocuments(),
      newWindow: () => void desktop?.newWindow(),
      cycleDocument: (direction) => switchDocument(cycleTab(docs, direction)),
      properties: () => setDialog('properties'),
      revisions: () => setDialog('revisions'),
      print: printout,
      exportPdf: () => void desktop?.exportPdf({ html: printoutHtml(), suggestedName: fileName(doc) }),
      example: () => openDocument(exampleDocument(), undefined),
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
        const lines = text.split('\n').slice(range.start - 1, range.end).join('\n');
        setSource(insertLineAfter(text, range.end, lines));
      },
      deleteLine: () => {
        const range = currentRange();
        if (!range) return;
        setSource(deleteLines(text, range.start, range.end));
        setEditing(undefined);
        setSelected(undefined);
      },
      setZoom,
      zoomBy,
      setPane: choosePane,
      toggleTableEditor: () => setTableEditor((v) => !v),
      customize: () => setDialog('customize'),
      insert,
      newTable: () => void createTable(doc, ui).then(applyTable),
      importTable: () => void importTableFile(doc, ui).then(applyTable),
      addLayer: (kind) => void newLayer(kind),
      insertBlock: () => void insertBlock(),
      settings: () => setDialog('settings'),
      shortcuts: () => setDialog('shortcuts'),
      functions: () => setDialog('functions'),
      about: () => setDialog('about'),
      insertSymbol,
      insertTemplate,
      insertPicture: () => void insertPictureFile(),
      insertCanvas,
    },
  });

  // Pictures come by dropping files on the sheet or by pasting (Ctrl+V): a
  // screenshot, a picture copied in another program, or a picture file copied
  // in Explorer or a Linux file manager.
  const dialogOpen = useRef(false);
  dialogOpen.current = dialog !== undefined || canvasPath !== undefined;
  const picturesRef = useRef(insertPictures);
  picturesRef.current = insertPictures;
  const layerOfElement = (element: EventTarget | null): Layer | undefined => {
    const id = (element as Element | null)?.closest?.('.layer-view')?.getAttribute('data-layer');
    return id ? doc.layers.find((l) => l.id === id) : undefined;
  };
  const layerOfRef = useRef(layerOfElement);
  layerOfRef.current = layerOfElement;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Without this the window would open the dropped file instead of the sheet.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      const target = layerOfRef.current(e.target);
      const line = target ? lineAtRef.current(target.id, e.clientX, e.clientY) : undefined;
      void Promise.all(files.map(fromFile)).then((pictures) => {
        const found = pictures.filter((p): p is IncomingPicture => p !== undefined);
        void picturesRef.current(found, target, line);
      });
    };
    const paste = (e: ClipboardEvent) => {
      if (dialogOpen.current) return;
      const data = e.clipboardData;
      const files = [...(data?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length > 0) {
        e.preventDefault();
        // A copied picture (a screenshot) comes as "image.png": it has no name of its own.
        const named = (p: IncomingPicture | undefined) => (p && /^image\.\w+$/.test(p.name) ? { ...p, name: '' } : p);
        void Promise.all(files.map(fromFile)).then((pictures) => void picturesRef.current(pictures.map(named).filter((p): p is IncomingPicture => p !== undefined)));
        return;
      }
      // A file copied in a file manager arrives as its path (or nothing); the desktop reads it.
      const text = data?.getData('text/plain') ?? '';
      const looksLikeFile = /^(file:\/\/|\/|[A-Za-z]:\\).*\.(png|jpe?g|gif|webp|svg|bmp)\s*$/i.test(text.trim());
      if (!desktop || (text !== '' && !looksLikeFile)) return;
      e.preventDefault();
      const area = document.activeElement;
      void desktop.clipboardPictures().then((pictures) => {
        if (pictures.length > 0) void picturesRef.current(pictures);
        else if (text && area instanceof HTMLTextAreaElement) {
          area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
          area.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);

  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Function keys work alone (F1 help); other shortcuts need Ctrl.
      if (dialogOpen.current || !(e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key))) return;
      const key = shortcutOf(e);
      const target = e.target as HTMLElement;
      const inRow = target.matches?.('textarea.row-editor');
      // The word-processor editor of the sources is an editable element, not a textarea: its own
      // clipboard, undo and editing keys (Ctrl+Enter, Ctrl+D…) stay with it.
      const inRich = !!target.closest?.('[contenteditable="true"]');
      if (inRich && !['Ctrl+N', 'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+P', 'Ctrl+W', 'Ctrl+Shift+N', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl++', 'Ctrl+=', 'Ctrl+-', 'Ctrl+0', 'F1'].includes(key)) return;
      const inField = !inRow && target.matches?.('input, select, textarea');
      // Outside text fields Ctrl+V takes pictures from the clipboard directly (no paste event there to rely on).
      if (key === 'Ctrl+V' && !inRow && !inField && desktop) {
        e.preventDefault();
        void desktop.clipboardPictures().then((pictures) => void picturesRef.current(pictures));
        return;
      }
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
        cmd('file.close'),
        sep,
        cmd('file.properties'),
        cmd('file.revisions'),
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
        { kind: 'submenu', label: t(ui, 'menu.pane'), items: [cmd('view.paneDetails'), cmd('view.paneTables'), cmd('view.paneLayers'), cmd('view.paneChat'), cmd('view.paneNone')] },
        cmd('view.tableEditor'),
        {
          kind: 'submenu',
          label: t(ui, 'menu.sideBySide'),
          items: doc.layers.map((l) => ({
            kind: 'action' as const,
            label: `${LAYER_GLYPH[l.kind]} ${nameOf(l)}`,
            checked: openPanes.includes(l.id) && openPanes.length > 1,
            run: () => toggleBeside(l.id),
          })),
        },
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
      items: [cmd('insert.heading'), cmd('insert.text'), cmd('insert.definition'), cmd('insert.check'), cmd('insert.pick'), cmd('insert.pageBreak'), cmd('insert.clear'), sep, cmd('insert.picture'), cmd('insert.canvas'), cmd('insert.chart'), cmd('insert.newTable'), cmd('insert.importTable'), cmd('insert.block'),
        ...(doc.blocks.size > 0
          ? [
              {
                kind: 'submenu' as const,
                label: t(ui, 'blocks.title'),
                items: [...doc.blocks].map(([name, b]) => ({
                  kind: 'action' as const,
                  label: `${t(ui, 'blocks.delete')} „${name}“ (${t(ui, 'blocks.version', { version: b.version })}${b.origin ? `, ${t(ui, 'blocks.origin', { origin: b.origin })}` : ''})`,
                  run: () => void deleteBlock(name),
                })),
              },
            ]
          : []),
        sep,
        { kind: 'submenu', label: t(ui, 'menu.layer'), items: [cmd('insert.layerCalc'), cmd('insert.layerData'), cmd('insert.layerSources')] },
      ],
    },
    { label: t(ui, 'menu.tools'), items: [cmd('tools.settings')] },
    {
      label: t(ui, 'menu.window'),
      items: [
        ...(desktop ? [cmd('window.new'), sep] : []),
        cmd('window.next'),
        cmd('window.previous'),
        sep,
        cmd('window.closeAll'),
        sep,
        ...docs.tabs.map((d, i) => ({
          kind: 'action' as const,
          label: `&${i + 1} ${docLabel(d)}${isDirty(d) ? ' •' : ''}`,
          checked: d.id === tab.id,
          run: () => switchDocument(d.id),
        })),
      ],
    },
    { label: t(ui, 'menu.help'), items: [cmd('help.functions'), cmd('help.shortcuts'), sep, cmd('help.about')] },
  ];

  const layerContent = (l: Layer, active: boolean) => {
    if (l.kind === 'data') {
      return (
        <TablesView
          key={l.id}
          doc={doc}
          catalog={ui}
          diagnostics={tableDiagnostics}
          resolveFile={resolveFile}
          names={layerTables.get(l.id) ?? []}
          assign={assignTable}
          onChange={(next) => (l.locked ? setNotice(t(ui, 'layers.lockedNotice')) : change(next))}
        />
      );
    }
    if (l.kind === 'ai' || l.kind === 'sources') {
      return (
        <NotesView
          key={l.id}
          layer={l}
          title={nameOf(l)}
          catalog={ui}
          readOnly={l.locked}
          resolveFile={resolveFile}
          onChange={(next, files) => setLayerText(l, next, `${l.id}:notes`, files)}
          onSettle={() => {
            // New headings get their theory ids once the user stops typing in them.
            const layers = withTheoryIds(doc.layers);
            if (layers.some((x, i) => x !== doc.layers[i])) change({ ...doc, layers }, `${l.id}:notes`);
          }}
        />
      );
    }
    const source = textOf(l);
    return (
      <main
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
          key={l.id}
          source={source}
          result={resultOf(l)}
          print={prints.get(l.id)!}
          printCatalog={printCatalog}
          {...(footer && l.kind === 'sheet' ? { footer } : {})}
          editing={active ? editing : undefined}
          selected={active ? selected : undefined}
          resolveFile={resolveFile}
          onEdit={(range) => (l.locked && range ? setNotice(t(ui, 'layers.lockedNotice')) : setEditing(range))}
          onSelect={setSelected}
          onReplace={(start, end, lines) => replaceIn(l, start, end, lines)}
          onInsertAfter={(line) => {
            setLayerText(l, insertLineAfter(source, line));
            setEditing({ start: line + 1, end: line + 1 });
          }}
          onDelete={(start, end) => setLayerText(l, deleteLines(source, start, end))}
          onPick={(statement, key) => pickIn(l, statement, key)}
          onReplacePicture={(start, end) => void replacePictureFile(l, start, end)}
          onEditCanvas={(path) => openCanvas(path)}
          onEditCanvasWindow={(path) => openCanvas(path, 'window')}
          {...(canvasEdit?.mode === 'inline' ? { inlineCanvas: { path: canvasEdit.path, render: () => canvasEditor(canvasEdit.path, 'inline') } } : {})}
          onMoveLines={(start, end, after) => {
            setLayerText(l, moveLines(source, start, end, after));
            // The selection is kept by statement order, which the move changes.
            setSelected(undefined);
          }}
          geometry={geometry}
          zoom={zoom}
          title={l.kind === 'calc' ? nameOf(l) : (/^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(doc.source)?.[1] ?? doc.manifest.title)}
          uiCatalog={printCatalog}
          decimalComma={decimalComma}
        />
      </main>
    );
  };

  // The status bar counts all calculation layers: an error in an auxiliary layer matters too.
  const diagnostics = allDiagnostics(evaluation);
  const checks = [evaluation.main, ...evaluation.aux.values()].flatMap((r) => r.checks);
  const errors = diagnostics.filter((d) => d.severity === 'error').length + tableDiagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const failedChecks = checks.filter((c) => !c.passed).length;

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
                {pane === 'chat' ? (
                  <ChatPane
                    catalog={ui}
                    settings={aiSettings}
                    turns={chats[tab.id] ?? []}
                    onTurns={(turns) => setChats((all) => ({ ...all, [tab.id]: turns }))}
                    theory={theorySections(doc.layers)}
                    context={() => {
                      // Headings still without an id get one before the model sees them, so its citations stay valid.
                      const layers = withTheoryIds(doc.layers);
                      if (layers.some((x, i) => x !== doc.layers[i])) change({ ...doc, layers });
                      return { sheet: { ...sheetContext(doc.manifest.title, evaluation.main), theory: theorySections(layers) }, languageGuide: languageGuide() };
                    }}
                    onOpenSettings={() => setDialog('settings')}
                  />
                ) : pane === 'layers' ? (
                  <LayersPane
                    layers={doc.layers}
                    active={layer.id}
                    catalog={ui}
                    used={evaluation.used}
                    nameOf={nameOf}
                    open={openPanes}
                    onActivate={activate}
                    onOpenBeside={openBeside}
                    onChange={setLayers}
                    onAdd={(kind) => void newLayer(kind)}
                    onDelete={(id) => void deleteLayer(id)}
                    blocks={[...doc.blocks].map(([name, b]) => ({ name, version: b.version, ...(b.origin !== undefined ? { origin: b.origin } : {}) }))}
                    onDeleteBlock={(name) => void deleteBlock(name)}
                  />
                ) : pane === 'details' ? (
                  <Inspector
                    result={result}
                    statement={selected}
                    catalog={ui}
                    decimalComma={decimalComma}
                    onLayer={activate}
                    onSelect={(statement) => {
                      setSelected(statement);
                      const line = result.statements[statement]?.statement.span.line;
                      document.querySelector(`.layer-view.active .row[data-line="${line}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }}
                  />
                ) : (
                  <TablesView doc={doc} catalog={ui} diagnostics={tableDiagnostics} resolveFile={resolveFile} onChange={(next) => change(next)} assign={assignTable} compact />
                )}
              </div>
            </>
          )
        }
      >
        <DocumentTabs
          tabs={docs.tabs.map((d) => ({ id: d.id, title: docLabel(d), dirty: isDirty(d), ...(d.path !== undefined ? { path: d.path } : {}) }))}
          active={tab.id}
          catalog={ui}
          onSelect={switchDocument}
          onClose={(id) => void closeDocument(id)}
          onNew={() => commands.get('file.new')?.run()}
        />
        {notice && (
          <div className="notice" role="status" onClick={() => setNotice(undefined)}>
            {notice}
          </div>
        )}
        {tableEditor ? (
          <TablesView doc={doc} catalog={ui} diagnostics={tableDiagnostics} resolveFile={resolveFile} onChange={(next) => change(next)} assign={assignTable} />
        ) : (
          <div ref={scrollRef} className="workspace">
            {openPanes.map((id, i) => {
              const l = layerById(id)!;
              return (
                <section
                  key={`${tab.id}:${id}`}
                  className={`layer-view${i === activeIndex ? ' active' : ''}`}
                  data-layer={id}
                  onMouseDownCapture={() => {
                    if (i === activeIndex) return;
                    setActivePane(i);
                    leaveEditing();
                  }}
                >
                  {openPanes.length > 1 && (
                    <header className="layer-view-head">
                      <span className="glyph">{LAYER_GLYPH[l.kind]}</span> {nameOf(l)}
                      <span className="grow" />
                      <button type="button" title={t(ui, 'layers.closePane')} onClick={() => closePane(i)}>
                        ✕
                      </button>
                    </header>
                  )}
                  {l.locked && l.kind !== 'ai' && <div className="notice locked">{t(ui, 'layers.lockedNotice')}</div>}
                  {!l.visible && <div className="notice">{t(ui, 'layers.hiddenNotice')}</div>}
                  {layerContent(l, i === activeIndex)}
                </section>
              );
            })}
          </div>
        )}
        {!tableEditor && (doc.layers.some((l) => l.kind !== 'sheet' && (inUse(l) || openPanes.includes(l.id))) || !doc.layers[0]!.visible) && (
          <LayerTabs
            shown={new Set(doc.layers.filter((l) => inUse(l) || openPanes.includes(l.id)).map((l) => l.id))}
            layers={doc.layers}
            active={layer.id}
            open={openPanes}
            catalog={ui}
            used={evaluation.used}
            commands={commands}
            nameOf={nameOf}
            onActivate={activate}
            onOpenBeside={openBeside}
            onChange={setLayers}
            onAdd={(kind) => void newLayer(kind)}
            onDelete={(id) => void deleteLayer(id)}
          />
        )}
      </ToolbarFrame>
      <footer className="statusbar">
        <span className={errors > 0 ? 'bad' : ''}>
          {ui.severity.error}: {errors}
        </span>
        <span className={warnings > 0 ? 'warn' : ''}>
          {ui.severity.warning}: {warnings}
        </span>
        {checks.length > 0 && (
          <span className={failedChecks > 0 ? 'bad' : ''}>
            {t(ui, 'checks.title')}: {checks.length - failedChecks}/{checks.length} ✓
          </span>
        )}
        {revState?.latest && (
          <button type="button" className={`status-revision${revState.current ? '' : ' changed'}`} onClick={() => setDialog('revisions')}>
            {t(ui, revState.current ? 'rev.status' : 'rev.statusChanged', { label: (revState.current ?? revState.latest).label })}
          </button>
        )}
        <span className="grow" />
        <span>{Math.round(zoom * 100)} %</span>
        <span>{dirty ? t(ui, 'editor.unsaved') : t(ui, 'editor.saved')}</span>
      </footer>
      {dialog === 'settings' && (
        <SettingsDialog
          catalog={ui}
          language={language}
          sizeLimit={sizeLimit}
          canvasMode={canvasMode}
          ai={aiSettings}
          onApply={(next) => {
            setAiSettings(next.ai);
            remember(AI_SETTINGS_KEY, JSON.stringify(next.ai));
            if (next.aiKey && desktop) void desktop.aiSetKey({ provider: next.ai.provider, ...next.aiKey });
            setCanvasMode(next.canvasMode);
            remember(CANVAS_MODE_KEY, next.canvasMode);
            setLanguage(next.language);
            remember(LANGUAGE_KEY, next.language);
            setSizeLimit(next.sizeLimit);
            remember(SIZE_LIMIT_KEY, String(next.sizeLimit));
          }}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'revisions' && (
        <RevisionsDialog
          catalog={ui}
          doc={doc}
          current={evaluation.main}
          state={revState}
          onFreeze={async (label, note) => change(await freezeRevision(doc, { label, ...(note ? { note } : {}) }))}
          onRemove={(label) => change(removeRevision(doc, label))}
          onOpen={(revision) =>
            void revisionDocument(revision).then((read) => {
              if (!read.document) return;
              setDialog(undefined);
              const title = t(ui, 'rev.openedTitle', { title: read.document.manifest.title, label: revision.label });
              openDocument({ ...read.document, manifest: { ...read.document.manifest, title } }, undefined, read.diagnostics);
            })
          }
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'properties' && <PropertiesDialog catalog={ui} doc={doc} onApply={(next) => change(next)} onClose={() => setDialog(undefined)} />}
      {dialog === 'customize' && <CustomizeDialog catalog={ui} layout={toolbars} commands={commands} onApply={changeToolbars} onClose={() => setDialog(undefined)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog catalog={ui} commands={commands} onClose={() => setDialog(undefined)} />}
      {canvasEdit?.mode === 'window' && canvasEditor(canvasEdit.path, 'window')}
      {dialog === 'functions' && (
        <FunctionsDialog
          catalog={ui}
          separator={decimalComma ? ';' : ','}
          onInsert={(text) => {
            setDialog(undefined);
            insertSymbol(text);
          }}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'about' && <AboutDialog catalog={ui} onClose={() => setDialog(undefined)} />}
      <AskHost catalog={ui} title="Kalketa" />
    </div>
  );
}
