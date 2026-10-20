/**
 * The Kalketa editor window: classic menu bar, dockable toolbars, the sheet
 * on pages, a side panel and a status bar.
 *
 * The document (sheet text + tables + files) is the only state that matters;
 * it lives in an undo history and everything else is derived from it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { defaultRegistry, formatPicture, parsePicture, rowLabel, TEXT_COLORS, toDecimalComma, type Diagnostic, type Expr, type Statement } from '@kalketa/core';
import { catalogFor, CATALOGS, formatDate, formatDiagnostic, formatNumber, t, type Catalog, type UiKey } from '@kalketa/i18n';
import { buildPrintDocument, printHtml, renderBlockHtml, revisionFooter, type PrintAppendix, type PrintBlock } from '@kalketa/render';
import { emptyScene, readScene, writeScene, type CanvasScene } from '@kalketa/canvas';
import { CanvasEditor } from '@kalketa/canvas/editor';
import { withAiLayer, compareWithSheet, sheetHas, readOutput, addLayer, allDiagnostics, appendixLayers, blockAppendices, documentBlocks, isRemovable, LayerSessions, MAIN_LAYER, removeLayer, freezeRevision, removeRevision, revisionDocument, revisionState, shortHash, tablesByLayer, theorySections, updateLayer, withTheoryIds, conversationsOf, hasConversations, withConversation, withoutConversation, aiMemoryOf, withAiMemory, linkedLibraries, librarySections, entriesOf, newSheetsOf, withEntries, studyAdvice, studyNotes, LARGE_STUDY_PAGES, type StudySettings, aiMadeLines, type SheetEntry, evaluateDocument, type ChangeEntry, type Conversation, type AddableLayerKind, type Layer, type RevisionState, type SheetDocument } from '@kalketa/sheet';
import { buildCommands, shortcutOf, type Command } from './commands.js';
import { applyProposal, applyProposals, cleanFigureDescription, cleanFormula, cleanReread, cleanMemory, parseNewSheets, DEFAULT_AI_SETTINGS, parseAiSettings, parseProposals, providerById, replacedLines, type ChangeProposal, type AiSettings, type ChatTurn, type CheckReport, type ChoiceBlock, type NoteBlock, DETAIL_LEVELS, isRoundResult, loneNumbers, noteText, proseOf, pythonLines, reportedNames, type SheetCheck } from '@kalketa/ai';
import { ChatPane } from './components/ChatPane.js';
import { TheoryLibraryDialog } from './components/TheoryLibraryDialog.js';
import { sourceText, useTheoryLibraries, withoutDuplicates, type FoundLibrary } from './theoryLibraries.js';
import { aiSources } from './logic/aiSources.js';
import { aiProtocol } from './logic/aiProtocol.js';
import { StudyDialog } from './components/StudyDialog.js';
import { PdfCropDialog, type CutAnchor } from './components/PdfCropDialog.js';
import { studyImport } from './logic/studyImport.js';
import { RereadDialog } from './components/RereadDialog.js';
import { cutOut, loadPdf, pageContent } from './logic/pdfDocs.js';
import { pageLayout } from './logic/pdfLayout.js';
import { matchRun, sourcePageLabels, textRuns, type RereadChange, type TextRun } from './logic/pdfReread.js';
import { proposalEffect, type ProposalEffect } from './logic/proposalEffect.js';
import type { NewSheetView, ProposalView } from './components/ProposalCard.js';
import type { AnswerProposals } from './components/ChatPane.js';
import { languageGuide, sheetContext } from './logic/aiContext.js';
import { exampleDocument, SAMPLE_FIELDS, samples, savedSampleTitle, subfieldName, type Sample } from './samples.js';
import { chooseFile, desktop, emptyDocument, fileName, fileUri, largestParts, openBytes, pickAndOpen, saveDocument, tableCache, type FileRef, type OpenedFile } from './document.js';
import { record, redo, undo, type History } from './logic/history.js';
import { closeTab, cycleTab, fileNameOf, isDirty, newTab, openTab, type DocTab, type Tabs } from './logic/documents.js';
import { pageGeometry } from './logic/pages.js';
import { pickOf, replacePickKey } from './logic/pick.js';
import { deleteLineRanges, deleteLines, insertLineAfter, moveLines, replaceLines, segments } from './logic/segments.js';
import { parseLayout, setVisible, templateParts, type ToolbarLayout } from './logic/toolbars.js';
import { createTable, importTableFile, type TableChange } from './tableActions.js';
import { captionOf, fromFile, pictureLine, picturePath, pixelWidth, widthFor, type IncomingPicture } from './logic/pictures.js';
import { importBlockFile } from './blockActions.js';
import { AboutDialog, CustomizeDialog, FunctionsDialog, PropertiesDialog, SettingsDialog, ShortcutsDialog } from './components/Dialogs.js';
import { FitDialog } from './components/FitDialog.js';
import { ChartDialog } from './components/ChartDialog.js';
import type { ChartFunction, ChartRelation, ChartSources } from './logic/chartInsert.js';
import { ChartLookDialog } from './components/ChartLookDialog.js';
import { chartLookText, lookDifference, parseChartLook } from '@kalketa/chart';
import { PythonRunnerContext, type PythonRunner } from './components/PythonCheck.js';
import { applyEdits, fitCharts, fitSeries, readFit, type FitChoice, type LineEdit } from './logic/curveFit.js';
import { DocumentTabs } from './components/DocumentTabs.js';
import { RevisionsDialog } from './components/Revisions.js';
import { Inspector } from './components/Inspector.js';
import { TextProperties, TEXT_FONT_KINDS, TEXT_SIZES } from './components/TextProperties.js';
import type { TextFormat } from './components/TextRowEditor.js';
import { fontValue, useSystemFonts } from './logic/systemFonts.js';
import { ask, askChoice, askConfirm, AskHost } from './components/Ask.js';
import { LAYER_GLYPH, LayersPane, LayerTabs } from './components/LayersPane.js';
import { NotesView } from './components/NotesView.js';
import { MenuBar, type Menu, type MenuItem } from './components/MenuBar.js';
import { SheetView, type EditRange } from './components/SheetView.js';
import { TablesView } from './components/TablesView.js';
import { ToolbarFrame, toolbarName } from './components/Toolbars.js';

type Pane = 'details' | 'tables' | 'layers' | 'chat' | 'none';
/** The side pane's tabs and their labels. */
const PANE_TABS: readonly (readonly [Exclude<Pane, 'none'>, Parameters<typeof t>[1]])[] = [
  ['details', 'cmd.view.paneDetails'],
  ['tables', 'cmd.view.paneTables'],
  ['layers', 'cmd.view.paneLayers'],
  ['chat', 'pane.chatTab'],
];
type Tab = DocTab<SheetDocument, FileRef>;
/** Rows copied by Ctrl+C with what they use (pictures, tables), for Ctrl+V in any calculation of the window. */
let rowClipboard: { readonly text: string; readonly files: ReadonlyMap<string, Uint8Array>; readonly tables: SheetDocument['tables'] } | undefined;

type DialogKind = 'settings' | 'properties' | 'revisions' | 'customize' | 'shortcuts' | 'functions' | 'about' | 'study' | 'fit' | 'chart';

const MM_TO_PX = 96 / 25.4;
const PAGE_GAP_PX = 24;
const ZOOM_STEPS = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const LANGUAGE_KEY = 'kalketa.uiLanguage';
const TOOLBARS_KEY = 'kalketa.toolbars';
const RECENT_KEY = 'kalketa.recent';
/** The files open in the first window when it was last used: open again at the start. */
const SESSION_KEY = 'kalketa.session';
const RECENT_LIMIT = 8;
const SIZE_LIMIT_KEY = 'kalketa.sizeLimitMb';
const CANVAS_MODE_KEY = 'kalketa.canvasMode';
const PYTHON_ENGINE_KEY = 'kalketa.pythonEngine';
/** Provider and model of the AI; keys are kept by the desktop application, not here. */
const AI_SETTINGS_KEY = 'kalketa.ai';
const DEFAULT_SIZE_LIMIT_MB = 50;
/** A sheet whose calculation takes longer than this (ms) waits with it until values stop changing. */
const SLOW_CALCULATION_MS = 100;
/** How long after the last key or slider step such a sheet is calculated (ms). */
const SETTLE_MS = 600;
const linesIn = (text: string) => text.split('\n').length;
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

function sessionFiles(): string[] {
  try {
    const list = JSON.parse(stored(SESSION_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function recentFiles(): string[] {
  try {
    const list = JSON.parse(stored(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** A conversation without a question for this long has ended: its memory is rewritten. */
const IDLE_ENDS_CONVERSATION = 3 * 60 * 1000;

/** Equation numbers: as set, else in the book style those of formulas (as textbooks number them). */
/** A drawing (SVG) as a PNG on white, at most 1600 px on its longer side: what a model that reads pictures takes. */
async function svgToPng(svg: Uint8Array): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg as BlobPart], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('svg'));
      image.src = url;
    });
    const [w, h] = [image.naturalWidth || 800, image.naturalHeight || 600];
    const scale = Math.min(2, 1600 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('png');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function equationNumbers(layout: SheetDocument['layout']): SheetDocument['layout']['equations'] {
  return layout.equations ?? (layout.style === 'book' ? 'formulas' : undefined);
}

export function App() {
  // Open calculations, one tab each. Everything below that belongs to one
  // document (history, file, open layers) is read from the active tab.
  const [docs, setDocs] = useState<Tabs<SheetDocument, FileRef>>(() => {
    // Another window (Window > New window) starts empty. The first one opens again the files
    // open when it was last closed (an empty tab waits for them); the first start shows a sample.
    const blank = new URLSearchParams(location.search).has('blank') || (!!desktop && sessionFiles().length > 0);
    const language = initialLanguage();
    const first = blank
      ? newTab<SheetDocument, FileRef>(emptyDocument(t(catalogFor(language), 'editor.untitled'), language), MAIN_LAYER, undefined, true)
      : newTab<SheetDocument, FileRef>(exampleDocument(undefined, t(catalogFor(language), 'samples.prefix')), MAIN_LAYER);
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
  // The line of text being edited as in a word processor: what the Format menu and the pane change.
  const [textFormat, setTextFormat] = useState<TextFormat | undefined>();
  const systemFonts = useSystemFonts();
  // More colours…: the palette of the Properties pane opens (the pane shown if hidden).
  const [paletteRequest, setPaletteRequest] = useState(0);
  const morePaletteColors = () => {
    if (pane === 'none' || pane === 'chat') choosePane('details');
    setPaletteRequest((n) => n + 1);
  };
  // Each Edit > Select all (Ctrl+A) counts up: the active sheet marks all its rows.
  const [selectAll, setSelectAll] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const [dialog, setDialog] = useState<DialogKind | undefined>();
  const [zoomChoice, setZoomChoice] = useState(() => stored('kalketa.zoom') ?? 'fit2');
  // The layer tabs do what the Layers panel did, so the panel no longer opens by itself at start.
  // The chat pane is not opened at start: the AI is off until the user switches it on.
  const [pane, setPane] = useState<Pane>(() => (['details', 'tables', 'none'].includes(stored('kalketa.pane') ?? '') ? (stored('kalketa.pane') as Pane) : stored('kalketa.pane') === 'layers' ? 'none' : 'details'));
  // Switched on by the user for this run of the program only: until then nothing is sent to any server.
  const [aiOn, setAiOn] = useState(false);
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
  /** Numbers of the ticks of a chart as the print writes them (4 digits, decimal comma of the language). */
  const chartNumber = useCallback((v: number) => formatNumber(v, printCatalog, { digits: 4 }).replace('-', '−'), [printCatalog]);
  // Incremental calculation state of each open document.
  // cost: how long its last calculation took (ms), lastSource: the sheet it was done for.
  const engines = useRef(new Map<number, { sessions: LayerSessions; tables: ReturnType<typeof tableCache>; cost: number; lastSource?: string }>());
  let engine = engines.current.get(tab.id);
  if (!engine) {
    engine = { sessions: new LayerSessions(defaultRegistry), tables: tableCache(defaultRegistry), cost: 0 };
    engines.current.set(tab.id, engine);
  }
  const { sessions, tables: buildTables } = engine;
  useEffect(() => {
    for (const id of engines.current.keys()) if (!docs.tabs.some((d) => d.id === id)) engines.current.delete(id);
  }, [docs.tabs]);

  const { tables, diagnostics: tableDiagnostics } = useMemo(() => buildTables(doc), [buildTables, doc.tables]);
  const blocks = useMemo(() => documentBlocks(doc), [doc.blocks]);
  // A sheet that takes long to calculate (integrals, charts, solvers) is not calculated at every key or every
  // step of a slider: while values change and the lines stay the same, it waits until the change stops
  // (a pause, the line left), and is then calculated whole. A quick sheet answers every key as before.
  const [settledSource, setSettledSource] = useState<{ readonly tab: number; readonly source: string } | undefined>();
  const lastCalculated = engine.lastSource;
  const waiting =
    engine.cost > SLOW_CALCULATION_MS &&
    lastCalculated !== undefined &&
    lastCalculated !== doc.source &&
    !(settledSource?.tab === tab.id && settledSource.source === doc.source) &&
    linesIn(lastCalculated) === linesIn(doc.source);
  const calcSource = waiting ? lastCalculated : doc.source;
  const evaluation = useMemo(() => {
    const start = performance.now();
    const result = sessions.evaluate(calcSource, doc.layers, tables, blocks);
    engine.cost = performance.now() - start;
    engine.lastSource = calcSource;
    return result;
  }, [sessions, calcSource, doc.layers, tables, blocks]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSettledSource({ tab: tab.id, source: doc.source }), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [waiting, doc.source, tab.id]);
  // The line left (Enter, a click elsewhere): calculated at once.
  useEffect(() => {
    if (!editing && engine.lastSource !== doc.source) setSettledSource({ tab: tab.id, source: doc.source });
  }, [editing]);

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
    l.kind === 'sheet' ||
    l.kind === 'calc' ||
    l.kind === 'sources' ||
    // AI notes are in use with notes or with conversations kept in them.
    (l.kind === 'ai' && hasConversations(doc.files, l.id)) ||
    (l.kind === 'data' ? (layerTables.get(l.id)?.length ?? 0) > 0 : Boolean(l.text?.trim()));
  // What a canvas shows for {L}: the value of L in the sheet, as its line shows it (5 m).
  const liveValues = useMemo(() => {
    const shown = new Map<string, string>();
    for (const r of evaluation.main.statements) {
      if (r.statement.kind !== 'definition' || !r.display) continue;
      shown.set(r.statement.name, `${formatNumber(r.display.value, ui, { digits: 4 })}${r.display.unit ? ` ${r.display.unit}` : ''}`.replace('-', '−'));
    }
    return (name: string) => shown.get(name);
  }, [evaluation.main, ui]);
  const resolveFile = useCallback((path: string) => fileUri(doc, path, liveValues), [doc, liveValues]);
  const openKey = openPanes.join('|');
  const prints = useMemo(
    () =>
      new Map(
        openPanes.flatMap((id) => {
          const l = layerById(id);
          if (l?.kind !== 'sheet' && l?.kind !== 'calc') return [];
          return [[id, buildPrintDocument(resultOf(l), { catalog: printCatalog, registry: defaultRegistry, digits: doc.layout.digits, title: '', showHidden: true, resolveFile, ...(doc.layout.summary ? { summary: doc.layout.summary } : {}), ...(equationNumbers(doc.layout) ? { equations: equationNumbers(doc.layout)! } : {}), ...(doc.layout.verdict ? { verdict: doc.layout.verdict } : {}), ...(doc.layout.chartStyle ? { chartStyle: doc.layout.chartStyle } : {}) })] as const];
        }),
      ),
    [evaluation, openKey, printCatalog, doc.layout.digits, doc.layout.summary, doc.layout.equations, doc.layout.style, doc.layout.verdict, doc.layout.chartStyle, resolveFile],
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
    // The message names the documents: an unsaved one in another tab is no mystery then.
    const names = docs.tabs
      .filter(isDirty)
      .map((d) => t(ui, d.fileRef === undefined ? 'editor.unsavedNew' : 'editor.unsavedFile', { name: docLabel(d) }))
      .join(', ');
    desktop?.setCloseGuard({ dirty: anyDirty, message: t(ui, 'editor.closeUnsaved', { names }), save: t(ui, 'editor.save'), discard: t(ui, 'editor.dontSave'), cancel: t(ui, 'editor.cancel') });
    if (!anyDirty || desktop) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [label, dirty, anyDirty, ui, docs.tabs]);

  // ------------------------------------------------------------------------
  // Document changes (all go through the undo history)
  // ------------------------------------------------------------------------

  /** `group` merges quick successive changes (typing in one line) into one undo step. */
  const change = (next: SheetDocument, group?: string) => setHistory((h) => record(h, next, group));
  /**
   * A change made from the document as it is when it lands, in this tab: for
   * answers that arrive later, while the user may have changed the calculation.
   */
  const changeWith = (f: (present: SheetDocument) => SheetDocument, group?: string) => setHistory((h) => record(h, f(h.present), group));
  const libraries = useTheoryLibraries(doc, tab.path, change);
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

  /**
   * The chosen part of a study file into a new sources layer: a heading per
   * chapter, the text of its pages under it. There it is tidied (Clean up PDF
   * text), given pictures, and saved as a theory library (ch. 9.6).
   */
  const importStudy = async (file: FoundLibrary, settings: StudySettings) => {
    if (!file.study) return;
    const content = file.study.content;
    const pages = studyAdvice(content, settings).selected;
    if (pages > LARGE_STUDY_PAGES && !(await askConfirm(t(ui, 'study.toSourcesLarge', { pages: String(pages) })))) return;
    const name = file.library.manifest.title;
    const planned = addLayer(doc.layers, 'sources', name).id;
    setDialog(undefined);
    // A PDF: its pictures and scattered formulas cut out at their place. Else (or if the PDF cannot be drawn) the text alone.
    let made: { text: string; files: ReadonlyMap<string, Uint8Array>; pictures: number; formulas: number } = { text: studyNotes(content, settings), files: new Map(), pictures: 0, formulas: 0 };
    if (content.kind === 'pdf' && desktop) {
      try {
        made = await studyImport(
          { path: file.path, title: name, content, settings },
          {
            ...(tab.path ? { sheetPath: tab.path } : {}),
            folder: `layers/${planned}/images`,
            caption: (page) => t(ui, 'crop.caption', { title: name, page }),
            taken: (path) => doc.files.has(path),
            progress: (page, of) => setNotice(t(ui, 'study.importing', { page: String(page), of: String(of) })),
          },
        );
      } catch {
        setNotice(t(ui, 'study.importNoCuts'));
      }
    }
    let id = planned;
    changeWith((present) => {
      const added = addLayer(present.layers, 'sources', name);
      id = added.id;
      // The layer got another id meanwhile: the paths of its pictures follow it.
      const move = (s: string) => (added.id === planned ? s : s.split(`layers/${planned}/`).join(`layers/${added.id}/`));
      const files = new Map(present.files);
      for (const [path, bytes] of made.files) files.set(move(path), bytes);
      // The study file is remembered: its pages can be read again (Read text again from the PDF).
      return { ...present, files, layers: updateLayer(added.layers, added.id, { text: move(made.text), ...(content.kind === 'pdf' ? { source: file.path } : {}) }) };
    });
    activate(id);
    setNotice(t(ui, made.pictures + made.formulas > 0 ? 'study.toSourcesCuts' : 'study.toSourcesDone', { name, pictures: String(made.pictures), formulas: String(made.formulas) }));
  };

  /**
   * A formula block for a picture of the sheet: the model reads the picture (it must
   * read images) and writes the formula in the calculation language; a note says the
   * AI wrote it, until the user reviews it and deletes the note.
   */
  /**
   * A picture of the sheet read by the model (it must read images): a formula written in the
   * calculation language, or a figure described for search. Passing failures are tried again.
   */
  const askAboutPicture = async (path: string, purpose: 'formula' | 'figure', context = ''): Promise<{ text: string; model: string } | undefined> => {
    const bytes = doc.files.get(path);
    if (!bytes) return undefined;
    // A drawing (SVG) is shown to the model as a picture: models read PNG and JPEG, not SVG.
    if (/\.svg$/i.test(path)) {
      const png = await svgToPng(bytes).catch(() => undefined);
      return png ? askAboutImage(png, 'image/png', purpose, context) : undefined;
    }
    return askAboutImage(bytes, path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg' : 'image/png', purpose, context);
  };
  /** A picture given as bytes (a part of a page of a PDF, a picture of the sheet) read by the model. */
  const askAboutImage = async (bytes: Uint8Array, type: string, purpose: 'formula' | 'figure' | 'text', context = ''): Promise<{ text: string; model: string } | undefined> => {
    if (!desktop) return undefined;
    if (!aiOn) {
      setNotice(t(ui, 'formula.aiOff'));
      return undefined;
    }
    const provider = providerById(aiSettings.provider);
    if (!provider) return undefined;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    try {
      const ask = {
        provider: provider.id,
        model: aiSettings.model,
        ...(aiSettings.url ? { url: aiSettings.url } : {}),
        ...(aiSettings.effort ? { effort: aiSettings.effort } : {}),
        purpose,
        ...(context ? { context } : {}),
        // The description is written in the language of the user, who searches with it.
        language: language === 'cs' ? 'Czech' : 'English',
        image: { type, data: btoa(binary) },
      };
      // A busy or restarting server fails now and then: tried again after a pause, twice.
      let result = await desktop.aiFormula(ask);
      for (const pause of [3000, 10000]) {
        const passing = !result.ok && (result.problem === 'notRunning' || result.problem === 'empty' || (result.problem === 'provider' && /^5\d\d/.test(result.detail ?? '')));
        if (!passing) break;
        await new Promise((resolve) => setTimeout(resolve, pause));
        result = await desktop.aiFormula(ask);
      }
      if (!result.ok) {
        setNotice(t(ui, 'formula.failed', { problem: result.problem }));
        return undefined;
      }
      return { text: result.text, model: result.model };
    } catch (error) {
      setNotice(t(ui, 'formula.failed', { problem: error instanceof Error ? error.message : String(error) }));
      return undefined;
    }
  };
  /** A formula block for a picture: a note says the AI wrote it, until the user reviews it. */
  const readFormula = async (path: string): Promise<string | undefined> => {
    const answer = await askAboutPicture(path, 'formula');
    const lines = answer ? cleanFormula(answer.text) : undefined;
    // ✦ marks the note of the AI in any language, until the user confirms the formula.
    return lines ? [`' ✦ ${t(ui, 'formula.byAi', { model: answer!.model })}`, ...lines].join('\n') : undefined;
  };
  // Text of the sources read again from the pages of its PDF: how far it is, and the changes to confirm.
  const [rereading, setRereading] = useState<{ done: number; of: number }>();
  const stopReread = useRef(false);
  const [reread, setReread] = useState<{ layer: string; changes: readonly RereadChange[] }>();
  /**
   * Every run of text of the pages the sources took, cut out of its PDF and written again by the
   * model, the old text as a hint; each changed paragraph goes to the user to confirm. The PDF is
   * the one the layer was taken from, else the study file named as the layer.
   */
  const rereadSources = async (layerId: string) => {
    const target = doc.layers.find((l) => l.id === layerId);
    if (!target || !desktop) return;
    if (!aiOn) return setNotice(t(ui, 'formula.aiOff'));
    const sheetPath = tab.path;
    const plain = (s: string) => s.toLowerCase().replace(/\.pdf$/, '').replace(/[^\p{L}\p{N}]+/gu, '');
    let path = target.source;
    if (!path) {
      const list = await desktop.theoryList(sheetPath);
      path = list.find((e) => e.study && /\.pdf$/i.test(e.path) && plain(e.path.split(/[\\/]/).pop() ?? '') === plain(target.name ?? ''))?.path;
    }
    if (!path) return setNotice(t(ui, 'reread.noPdf'));
    const study = await desktop.studyRead(path, sheetPath);
    const labels = study.content.labels;
    const pages = sourcePageLabels(target.text ?? '')
      .map((label) => (labels ? labels.indexOf(label) + 1 : Number(label)))
      .filter((p) => Number.isInteger(p) && p > 0);
    if (pages.length === 0) return setNotice(t(ui, 'reread.noPages'));
    const pdf = await loadPdf(path, sheetPath);
    const sources = target.text ?? '';
    const changes: RereadChange[] = [];
    stopReread.current = false;
    // The runs of all pages first: the count is known, and the progress says it.
    const runs: { page: number; run: TextRun }[] = [];
    for (const p of pages) {
      const page = await pdf.getPage(p);
      const { lines, pictures, drawn, width, height } = await pageContent(page);
      for (const run of textRuns(pageLayout(lines, pictures, { width, height }, drawn))) runs.push({ page: p, run });
    }
    setRereading({ done: 0, of: runs.length });
    for (const [n, { page: p, run }] of runs.entries()) {
      if (stopReread.current) break;
      const page = await pdf.getPage(p);
      // A little room around the lines, so no letter is cut.
      const box = { top: run.box.top - 4, bottom: run.box.bottom + 4, left: run.box.left - 6, right: run.box.right + 6 };
      const answer = await askAboutImage(await cutOut(page, box), 'image/png', 'text', run.text);
      setRereading({ done: n + 1, of: runs.length });
      const text = answer ? cleanReread(answer.text) : undefined;
      const match = text ? matchRun(sources, run.text) : undefined;
      if (!text || !match || text.replace(/\s+/g, ' ') === match.old.replace(/\s+/g, ' ')) continue;
      // A paragraph two runs share is changed once.
      if (changes.some((c) => c.from <= match.to && match.from <= c.to)) continue;
      changes.push({ ...match, text });
    }
    setRereading(undefined);
    if (changes.length === 0) return setNotice(t(ui, 'reread.nothing'));
    setReread({ layer: layerId, changes });
  };

  /** What a figure shows, for search: none for a picture of a formula. */
  const describeFigure = async (path: string, context: string): Promise<string | undefined> => {
    const answer = await askAboutPicture(path, 'figure', context);
    return answer ? cleanFigureDescription(answer.text) : undefined;
  };
  // A cut-out from a study PDF being chosen: the sources wait for it.
  const [cropping, setCropping] = useState<(picture: IncomingPicture, caption: string, anchor: CutAnchor) => void>();
  const pickPdfCrop = (place: (picture: IncomingPicture, caption: string, anchor: CutAnchor) => void) => setCropping(() => place);

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
    // The AI notes take their conversations, memory and journal with them: the lines the AI made lose their mark.
    const asked = target?.kind === 'ai' ? t(ui, 'layers.deleteAiConfirm') : t(ui, 'layers.deleteConfirm', { name: target ? nameOf(target) : '' });
    if (!target || !isRemovable(target) || !(await askConfirm(asked))) return;
    // Pictures of the layer go with it; tables of a data layer move to another data layer.
    const files = new Map([...doc.files].filter(([path]) => !path.startsWith(`layers/${id}/`)));
    change({ ...doc, layers: removeLayer(doc.layers, id), files });
    setPanes(openPanes.filter((p) => p !== id));
    // A conversation kept in them is gone: the chat starts a new one.
    if (target.kind === 'ai') setActiveChat((all) => ({ ...all, [tab.id]: '' }));
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

  const pickIn = (l: Layer, statement: Statement, key: string, column?: string) => {
    const info = pickOf(statement);
    const next = info ? replacePickKey(textOf(l), info, key, column) : undefined;
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
    // Unsaved: Save (then close), Don't save, or Cancel, as a word processor asks.
    if (isDirty(target)) {
      const choice = await askChoice(t(ui, 'docs.closeUnsaved', { name: docLabel(target) }), [t(ui, 'editor.save'), t(ui, 'editor.dontSave'), t(ui, 'editor.cancel')]);
      if (choice === 0 && !(await saveTab(target))) return;
      if (choice !== 0 && choice !== 1) return;
    }
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
  // The first window remembers its files for the next start; closing a file forgets it.
  const firstWindow = !new URLSearchParams(location.search).has('blank');
  const restored = useRef(false);
  useEffect(() => {
    desktop?.setOpenFiles(openPaths ? openPaths.split('\n') : []);
    if (firstWindow && restored.current) remember(SESSION_KEY, JSON.stringify(openPaths ? openPaths.split('\n') : []));
  }, [openPaths]);
  useEffect(() => {
    if (!firstWindow || !desktop) return void (restored.current = true);
    void (async () => {
      const paths = sessionFiles();
      let opened = 0;
      for (const path of paths) {
        const file = await desktop!.openPath(path);
        if (!file) continue;
        showRef.current(await openBytes(file.name, file.bytes, { kind: 'path', path: file.path }));
        opened++;
      }
      // For startup.log of the desktop program: the files of the last session are open.
      console.info('[startup] restored');
      // None of them is there any more: the sample, as at the first start.
      if (paths.length > 0 && opened === 0) showRef.current({ document: exampleDocument(undefined, t(ui, 'samples.prefix')), diagnostics: [] });
      restored.current = true;
    })();
  }, []);

  const save = async (as = false) => void (await saveTab(tab, as));

  /**
   * Saves one document (its tab need not be the one shown): to its file, or as a new one when it has none.
   * True when it is saved; false when the person cancelled choosing a file.
   */
  const saveTab = async (which: Tab, as = false): Promise<boolean> => {
    const doc = which.history.present;
    const fileRef = which.fileRef;
    const updateTab = (f: (d: Tab) => Tab) => setDocs((s) => ({ ...s, tabs: s.tabs.map((d) => (d.id === which.id ? f(d) : d)) }));
    const setFileRef = (ref: FileRef) => updateTab((d) => ({ ...d, fileRef: ref, ...(ref.kind === 'path' ? { path: ref.path } : {}) }));
    const setSavedDoc = (saved: SheetDocument) => updateTab((d) => ({ ...d, savedDoc: saved }));
    const setHistory = (f: (h: History<SheetDocument>) => History<SheetDocument>) => updateTab((d) => ({ ...d, history: f(d.history) }));
    let size = 0;
    const target = await saveDocument(doc, as ? undefined : fileRef, (bytes) => (size = bytes.length), {
      openElsewhere: t(ui, 'docs.openElsewhere'),
      ...(which.path !== undefined ? { current: which.path } : {}),
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
    // A sample saved as the user's own calculation is called by its file, without "Sample – ":
    // written once more under that title, which is no new step to undo.
    const title = target?.kind === 'path' ? savedSampleTitle(doc.manifest.title, target.path, t(ui, 'samples.prefix')) : undefined;
    if (target?.kind === 'path' && title !== undefined) {
      const renamed: SheetDocument = { ...doc, manifest: { ...doc.manifest, title } };
      await saveDocument(renamed, target, () => undefined, { openElsewhere: t(ui, 'docs.openElsewhere'), current: target.path });
      setHistory((h) => ({ ...h, present: renamed }));
      setSavedDoc(renamed);
      return true;
    }
    // In a browser without file handles the file is downloaded; it counts as saved.
    if (target || !desktop) setSavedDoc(doc);
    return !!target || !desktop;
  };

  /** Saves every unsaved document, each shown while it is saved (a new one asks for its file); false when one is not. */
  const saveAll = async (): Promise<boolean> => {
    for (const d of docs.tabs.filter(isDirty)) {
      switchDocument(d.id);
      if (!(await saveTab(d))) return false;
    }
    return true;
  };
  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;
  // The window asked to close with unsaved documents and the person chose Save: all saved, then closed.
  useEffect(() => {
    desktop?.onSaveAndClose?.(() => void saveAllRef.current().then((saved) => saved && desktop?.closeWindow?.()));
  }, []);

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
  // Right of the page head: who made the calculation and when it was last changed.
  const headRight = [doc.manifest.author?.trim(), formatDate(Math.floor(Date.parse(doc.manifest.modified) / 86_400_000), printCatalog)].filter(Boolean).join(' · ');
  const footer = revState
    ? revisionFooter(printCatalog, {
        hash: shortHash(revState.hash),
        ...(revState.current ? { revision: { label: revState.current.label, created: revState.current.created } } : revState.latest ? { after: revState.latest.label } : {}),
      })
    : undefined;

  /** Statements of the sheet with a line the AI made and nobody reviewed, by their first line. */
  const unreviewedAiLines = () => {
    const made = aiMadeLines(doc.source, entriesOf(doc));
    if (made.size === 0) return new Set<number>();
    return new Set(segments(doc.source, evaluation.main.sheet.statements).filter((seg) => seg.statement !== undefined && [...made.keys()].some((line) => line >= seg.start && line <= seg.end)).map((seg) => seg.start));
  };
  /** The AI notes print as a protocol: sources and citations, proposed changes and decisions. */
  const withAiProtocol = (appendix: PrintAppendix): PrintAppendix => {
    const layer = doc.layers.find((x) => x.id === appendix.layer);
    if (appendix.kind !== 'notes' || layer?.kind !== 'ai') return appendix;
    const sources = aiSources(
      conversations,
      theorySections(doc.layers),
      linkedLibraries(doc).map((link) => ({ ...link, source: sourceText(link.source) })),
    );
    return { ...appendix, text: aiProtocol(printCatalog, { text: appendix.text, sources, entries: entriesOf(doc) }) };
  };
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
      appendices: [...appendixLayers(doc.layers, evaluation, (l) => layerName(l, printCatalog)).map(withAiProtocol), ...blockAppendices(evaluation.main)],
      ...(footer ? { footer } : {}),
      headRight,
      aiLines: unreviewedAiLines(),
      style: doc.layout.style ?? 'airy',
      ...(doc.layout.chartStyle ? { chartStyle: doc.layout.chartStyle } : {}),
      ...(doc.layout.summary ? { summary: doc.layout.summary } : {}),
      ...(equationNumbers(doc.layout) ? { equations: equationNumbers(doc.layout)! } : {}),
      ...(doc.layout.verdict ? { verdict: doc.layout.verdict } : {}),
      ...(doc.layout.pageNumbers ? { pageNumbers: doc.layout.pageNumbers } : {}),
      ...(doc.layout.derivations ? { derivations: doc.layout.derivations } : {}),
    });
  /** Unreviewed AI lines: the user is asked first; they print marked, with a notice. */
  const confirmAiPrint = async () => unreviewedAiLines().size === 0 || (await askConfirm(t(ui, 'print.aiConfirm')));

  const printout = async () => {
    if (!(await confirmAiPrint())) return;
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
    // A new picture: the description of the old one does not fit it.
    const { description: _old, ...kept } = old;
    setLayerText(target, replaceLines(current, start, end, formatPicture({ ...kept, path })), undefined, new Map([[path, picture.bytes]]));
  };

  /** The canvas open in the canvas window (its path in the calculation file). */
  const [canvasEdit, setCanvasEdit] = useState<{ path: string; mode: 'inline' | 'window' } | undefined>();
  const canvasPath = canvasEdit?.path;
  /** Where a canvas is edited by default (Tools > Settings): right in the sheet, or in a large window. */
  const [canvasMode, setCanvasMode] = useState<'inline' | 'window'>(() => (stored(CANVAS_MODE_KEY) === 'window' ? 'window' : 'inline'));
  const [pythonEngine, setPythonEngine] = useState<'pyodide' | 'system'>(() => (stored(PYTHON_ENGINE_KEY) === 'system' ? 'system' : 'pyodide'));
  // The conversation the chat shows, by document tab; the conversations themselves are in the sheet (AI notes).
  // Absent: the latest one; '' after "New chat": a new one with the next question.
  const [activeChat, setActiveChat] = useState<Readonly<Record<string, string>>>({});
  // The id a new conversation got with its question, by tab: the answer, written later, goes into the same one.
  const startedChat = useRef<Record<string, string | undefined>>({});
  const conversations = conversationsOf(doc);
  /** What the model sees of the sheet: for the chat, and for the memory update when a conversation ends. */
  const chatContext = () => {
    // Headings still without an id get one before the model sees them, so its citations stay valid.
    const layers = withTheoryIds(doc.layers);
    if (layers.some((x, i) => x !== doc.layers[i])) change({ ...doc, layers });
    const fromLibraries = libraries.theory();
    const memory = aiMemoryOf(doc);
    // The model learns which of its proposals the user accepted or rejected.
    const changes = entriesOf(doc);
    // Other open sheets, for reference: what the model may build on.
    const others = docs.tabs
      .filter((d) => d.id !== tab.id && d.history.present.source.trim())
      .map((d) => ({ title: d.history.present.manifest.title, source: d.history.present.source }));
    return {
      // A section both in the sources and in a library goes once, from the library.
      sheet: { ...sheetContext(doc.manifest.title, evaluation.main), ...((pickedDetail.current ?? doc.layout.detail) ? { detail: pickedDetail.current ?? doc.layout.detail } : {}), theory: withoutDuplicates(theorySections(layers), fromLibraries.sections), libraries: fromLibraries.libraries, ...(changes.length > 0 ? { changes } : {}), ...(others.length > 0 ? { others } : {}) },
      languageGuide: languageGuide(),
      ...(memory.trim() ? { memory } : {}),
    };
  };
  // What a proposal does to the calculation, by entry and source: evaluating a sheet is not free.
  const effects = useRef(new Map<string, ProposalEffect>());
  /** A journal entry as the change it proposes. */
  const asProposal = (e: ChangeEntry): ChangeProposal => ({ from: e.from, to: e.to, ...(e.insert ? { insert: true } : {}), lines: e.after });
  const proposalViews = (entries: readonly ChangeEntry[]): ProposalView[] =>
    entries.map((entry) => {
      const now = replacedLines(doc.source, asProposal(entry));
      const fits = !entry.before || !now ? 'missing' : now.length === entry.before.length && now.every((l, i) => l === entry.before![i]) ? 'yes' : 'stale';
      if (entry.state !== 'open' || fits !== 'yes') return { entry, fits };
      const key = `${entry.id}\u0000${doc.source}`;
      let effect = effects.current.get(key);
      if (!effect) {
        const changed = evaluateDocument({ ...doc, source: applyProposal(doc.source, asProposal(entry)) }, defaultRegistry).result;
        effect = proposalEffect(evaluation.main, changed);
        effects.current.set(key, effect);
      }
      return { entry, fits, effect };
    });
  /** Accepts a proposal (the calculation changes, as one step to undo) or rejects it; both go into the journal. */
  const decideProposal = (entryId: string, accept: boolean) =>
    changeWith((present) => {
      const entry = entriesOf(present).find((e) => e.id === entryId);
      if (!entry || entry.state !== 'open') return present;
      const decided = new Date().toISOString();
      if (!accept) return withEntries(present, [{ ...entry, state: 'rejected', decided }]);
      const now = replacedLines(present.source, asProposal(entry));
      // The lines changed since it was proposed: it no longer fits, nothing is changed.
      if (!entry.before || !now || now.length !== entry.before.length || now.some((l, i) => l !== entry.before![i])) return present;
      return withEntries({ ...present, source: applyProposal(present.source, asProposal(entry)) }, [{ ...entry, state: 'accepted', decided }]);
    });
  /** Open proposals that still fit the sheet, by id. */
  const fittingOpen = (present: SheetDocument, ids: readonly string[]) =>
    entriesOf(present).filter((e) => {
      if (!ids.includes(e.id) || e.state !== 'open' || !e.before) return false;
      const now = replacedLines(present.source, asProposal(e));
      return !!now && now.length === e.before.length && now.every((l, i) => l === e.before![i]);
    });
  /** The open proposals of the answer at a turn of the chat: whether they go together, and what they do together. */
  const answerProposals = (turn: number): AnswerProposals | undefined => {
    if (!chat) return undefined;
    const open = fittingOpen(
      doc,
      entriesOf(doc)
        .filter((e) => e.id.startsWith(`${chat.id}:${turn}:`))
        .map((e) => e.id),
    );
    if (open.length === 0) return undefined;
    const together = applyProposals(doc.source, open.map(asProposal));
    if (together === undefined || open.length < 2) return { ids: open.map((e) => e.id), together: together !== undefined };
    const key = `${open.map((e) => e.id).join('|')}\u0000${doc.source}`;
    let effect = effects.current.get(key);
    if (!effect) {
      effect = proposalEffect(evaluation.main, evaluateDocument({ ...doc, source: together }, defaultRegistry).result);
      effects.current.set(key, effect);
    }
    return { ids: open.map((e) => e.id), together: true, effect };
  };
  /** Accepts the proposals of an answer together: one step to undo. */
  const acceptAll = (ids: readonly string[]) =>
    changeWith((present) => {
      const open = fittingOpen(present, ids);
      const source = open.length === ids.length ? applyProposals(present.source, open.map(asProposal)) : undefined;
      if (source === undefined) return present;
      const decided = new Date().toISOString();
      return withEntries({ ...present, source }, open.map((e) => ({ ...e, state: 'accepted' as const, decided })));
    });
  /**
   * The calculation copied into a new tab with the proposals applied there; this
   * sheet stays as it is and its journal says where they went. The copy keeps the
   * tables, layers, libraries and conversations, not the revisions (they belong
   * to this sheet), and is unsaved.
   */
  const toNewSheet = (ids: readonly string[]) => {
    const open = fittingOpen(doc, ids);
    const source = open.length === ids.length ? applyProposals(doc.source, open.map(asProposal)) : undefined;
    if (source === undefined) return;
    const decided = new Date().toISOString();
    const title = t(ui, 'proposal.copyTitle', { title: doc.manifest.title });
    change(withEntries(doc, open.map((e) => ({ ...e, state: 'accepted' as const, decided, copiedTo: title }))));
    const copy = withEntries({ ...doc, manifest: { ...doc.manifest, title, created: decided, modified: decided }, source, revisions: [] }, open.map((e) => ({ ...e, state: 'accepted' as const, decided })));
    const added = newTab<SheetDocument, FileRef>(copy, firstVisible(copy.layers));
    // Unsaved: it has no file yet.
    setDocs((s) => openTab(s, { ...added, savedDoc: emptyDocument(title, language) }));
    leaveEditing();
    setNotice(t(ui, 'proposal.copyNotice', { title }));
  };
  /** The new calculations the answer at a turn wrote, with what each computes. */
  const newSheetViews = (turn: number): NewSheetView[] => {
    if (!chat) return [];
    return newSheetsOf(doc)
      .filter((e) => e.id.startsWith(`${chat.id}:${turn}:`))
      .map((entry) => {
        const key = `${entry.id}\u0000sheet\u0000${doc.tables.size}`;
        let effect = effects.current.get(key);
        if (!effect) {
          const empty = evaluateDocument({ ...doc, source: '' }, defaultRegistry).result;
          effect = proposalEffect(empty, evaluateDocument({ ...doc, source: entry.lines.join('\n') }, defaultRegistry).result);
          effects.current.set(key, effect);
        }
        return { entry, effect };
      });
  };
  /**
   * A new calculation the model wrote, opened in a new tab: this sheet's tables,
   * layers, theory and conversations go with it (its lines may use them), not its
   * revisions or the model's memory of it. All its lines carry the AI mark until
   * reviewed; this sheet's journal says it was opened.
   */
  const openNewSheet = (entryId: string) => {
    const entry = newSheetsOf(doc).find((e) => e.id === entryId);
    if (!entry) return;
    const decided = new Date().toISOString();
    const title = entry.title.trim() || t(ui, 'newSheet.untitled');
    change(withEntries(doc, [{ ...entry, state: 'accepted', decided, copiedTo: title }]));
    const files = new Map([...doc.files].filter(([path]) => !/^layers\/[^/]+\/entries\.json$/.test(path)));
    const base = withAiMemory({ ...doc, manifest: { ...doc.manifest, title, created: decided, modified: decided }, source: entry.lines.join('\n'), revisions: [], files }, '');
    const made: ChangeEntry = { id: `${entry.id}:lines`, kind: 'change', time: entry.time, ...(entry.model ? { model: entry.model } : {}), ...(entry.conversation ? { conversation: entry.conversation } : {}), from: 0, to: 0, insert: true, before: [], after: entry.lines, state: 'accepted', decided };
    const copy = withEntries(base, [made]);
    const added = newTab<SheetDocument, FileRef>(copy, firstVisible(copy.layers));
    setDocs((s) => openTab(s, { ...added, savedDoc: emptyDocument(title, language) }));
    leaveEditing();
    setNotice(t(ui, 'newSheet.notice', { title }));
  };
  /** A person reviewed the lines an accepted change brought: they lose their AI mark. */
  const reviewProposal = (entryId: string) =>
    changeWith((present) => {
      const entry = entriesOf(present).find((e) => e.id === entryId);
      return entry && entry.state === 'accepted' && !entry.reviewed ? withEntries(present, [{ ...entry, reviewed: new Date().toISOString() }]) : present;
    });
  /** The AI notes with this change in view. */
  const showProposal = (entryId: string) => {
    const ai = doc.layers.find((x) => x.kind === 'ai');
    if (!ai) return;
    activate(ai.id);
    window.setTimeout(() => document.querySelector(`.layer-view.active [data-proposal="${CSS.escape(entryId)}"]`)?.scrollIntoView({ block: 'center' }), 100);
  };
  /** Lines of the sheet the AI made and nobody reviewed yet, with the tooltip of their mark. */
  const aiMarks = (source: string) => {
    const made = aiMadeLines(source, entriesOf(doc));
    const when = (iso: string | undefined) => (iso ? new Intl.DateTimeFormat(ui.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '');
    return new Map([...made].map(([line, e]) => [line, { id: e.id, title: t(ui, 'aiMark.title', { model: e.model ?? 'AI', when: when(e.decided) }) }] as const));
  };
  // A memory update running, by tab: one at a time.
  const remembering = useRef<Record<string, boolean>>({});
  /**
   * When a conversation ends (New chat, the AI switched off, a while without a
   * question), the model rewrites the sheet's memory from it (ch. 9.7). In the
   * background; the result lands in the tab where the conversation was held.
   */
  const rememberConversation = (conversation: Conversation | undefined) => {
    if (!desktop || !aiOn || !conversation || remembering.current[tab.id]) return;
    if ((conversation.remembered ?? 0) >= conversation.turns.length || !conversation.turns.some((t) => t.role === 'assistant')) return;
    const provider = providerById(aiSettings.provider);
    if (!provider) return;
    const tabId = tab.id;
    const turns = conversation.turns;
    remembering.current[tabId] = true;
    const { sheet, languageGuide: guide, memory } = chatContext();
    void desktop
      .aiMemory({
        id: `memory-${conversation.id}-${turns.length}`,
        provider: provider.id,
        model: aiSettings.model,
        ...(aiSettings.url ? { url: aiSettings.url } : {}),
        language: ui.locale,
        sheet,
        languageGuide: guide,
        turns: turns.map((t) => ({ role: t.role, text: t.text })),
        ...(memory ? { memory } : {}),
      })
      .then((result) => {
        if (!result.ok) return;
        changeWith((present) => {
          const now = conversationsOf(present).find((c) => c.id === conversation.id);
          const marked = now ? withConversation(present, { ...now, remembered: turns.length }) : present;
          return withAiMemory(marked, cleanMemory(result.text));
        }, 'ai-memory');
      })
      .catch(() => undefined)
      .finally(() => {
        remembering.current[tabId] = false;
      });
  };
  // A while without a question ends the conversation too.
  useEffect(() => {
    if (!aiOn || !chat || (chat.remembered ?? 0) >= chat.turns.length) return;
    const timer = window.setTimeout(() => rememberConversation(chat), IDLE_ENDS_CONVERSATION);
    return () => window.clearTimeout(timer);
  });
  // Conversations that never made it into the memory (the program was closed before
  // they ended) are taken in once the AI is on again: one at a time, each tried once.
  const caughtUp = useRef(new Set<string>());
  useEffect(() => {
    if (!aiOn || remembering.current[tab.id]) return;
    const pending = conversations.find((c) => {
      const last = Date.parse(c.turns[c.turns.length - 1]?.time ?? '');
      return (c.remembered ?? 0) < c.turns.length && c.turns.some((t) => t.role === 'assistant') && !(Date.now() - last < IDLE_ENDS_CONVERSATION) && !caughtUp.current.has(`${c.id}:${c.turns.length}`);
    });
    if (!pending) return;
    caughtUp.current.add(`${pending.id}:${pending.turns.length}`);
    rememberConversation(pending);
  });
  const chatId = activeChat[tab.id];
  const chat = chatId === '' ? undefined : (conversations.find((c) => c.id === chatId) ?? (chatId === undefined ? conversations[conversations.length - 1] : undefined));
  // The sources layer being saved as a theory library.
  const [libraryLayer, setLibraryLayer] = useState<string>();
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
      fonts={systemFonts}
      scene={readScene(doc.files.get(path))}
      language={ui.locale}
      ask={ask}
      chooseImage={() => chooseFile('image/*')}
      area={() => document.querySelector('.layer-view.active .sheet-scroll')?.getBoundingClientRect()}
      resolveFile={resolveFile}
      values={liveValues}
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

  const insert = (kind: 'text' | 'definition' | 'check' | 'pick' | 'pageBreak' | 'clear' | 'sheetTable') => {
    switch (kind) {
      case 'sheetTable': {
        // A table in the sheet (measured points): opened as a grid to fill in.
        const after = currentRange()?.end ?? lineCount;
        const lines = [`table ${uniqueName('Tabulka')}:`, '    | x [m] | y [kN] |', '    |       |        |'];
        setSource(insertLineAfter(text, after, lines.join('\n')));
        setEditing({ start: after + 1, end: after + lines.length });
        return;
      }
      case 'text':
        return insertLine('""', 1);
      case 'definition':
        // Into the line being edited at the cursor; a new line only when none is edited.
        if (document.querySelector('textarea.row-editor') && !textFormat) return insertSymbol(':=');
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
    }
  };

  // A check in Python from the sources: run where the settings say (Python of the computer only when
  // the user lets it, each time), its results set beside the values of the sheet.
  /** The words of the question the program asks before Python of the computer runs a script. */
  const pythonAsk = () => ({ message: t(ui, 'python.confirmSystem'), run: t(ui, 'python.run'), cancel: t(ui, 'dlg.cancel'), more: t(ui, 'python.moreLines') });
  const pythonRunner: PythonRunner | undefined = desktop
    ? async (code) => {
        const raw = await desktop!.runPython(code, pythonEngine, pythonAsk());
        if (raw.declined) return undefined;
        const { output, results } = readOutput(raw.stdout);
        // A failed script shows its whole traceback below the last line of it.
        const shown = [output, raw.ok ? '' : raw.stderr.trim()].filter(Boolean).join('\n');
        return { ok: raw.ok, output: shown, ...(raw.error ? { error: raw.error } : {}), results, engine: raw.engine, ms: raw.ms, comparisons: compareWithSheet(results, evaluation.main) };
      }
    : undefined;

  /** The sheet an answer is about: a new sheet it writes, else this one with the changes it proposes; undefined when it proposes none. */
  const proposedSource = (answer: string): string | undefined => {
    const written = parseNewSheets(answer)[0];
    const proposed = written ? written.lines.join('\n') : applyProposals(doc.source, parseProposals(answer));
    return proposed !== undefined && proposed !== doc.source ? proposed : undefined;
  };
  /**
   * The sheet an answer proposes, evaluated: the problems its changes bring (not those the sheet had),
   * and the numbers its new text claims without the sheet computing them.
   */
  const checkProposedSheet = (answer: string): SheetCheck | undefined => {
    const proposed = proposedSource(answer);
    if (proposed === undefined) return undefined;
    const sheet = evaluateDocument({ ...doc, source: proposed }, defaultRegistry).result;
    const lineOf = (source: string, d: Diagnostic) => (d.span ? (source.split('\n')[d.span.line - 1] ?? '') : '');
    const had = new Set(evaluation.main.diagnostics.map((d) => `${d.code}|${lineOf(doc.source, d).trim()}`));
    const problems = sheet.diagnostics
      .filter((d) => d.severity !== 'info' && !had.has(`${d.code}|${lineOf(proposed, d).trim()}`))
      .map((d) => ({ line: lineOf(proposed, d), message: formatDiagnostic(d, ui), code: d.code }));
    // The lines the answer adds; the numbers of their text are to come from the sheet, the assignment or the theory.
    const present = new Map<string, number>();
    for (const line of doc.source.split('\n')) present.set(line, (present.get(line) ?? 0) + 1);
    const added = proposed.split('\n').filter((line) => {
      const n = present.get(line) ?? 0;
      if (n > 0) present.set(line, n - 1);
      return n === 0;
    });
    const values = [...sheet.values.values(), ...sheet.statements.flatMap((s) => (s.solutions ?? []).map((x) => x.value))].flatMap((v) => (v?.type === 'quantity' ? [v.si] : []));
    const written = [doc.source, ...doc.layers.map((l) => l.text ?? ''), ...added.map((line) => line.replace(/"[^"\n]*"/g, ''))];
    // Python written into the sheet: said first, it belongs in a python block (text lines do not count).
    const python = pythonLines(added.filter((line) => !line.trim().startsWith('"')));
    // Checks that do not pass with the changes, and did pass (or were not) before: the calculation or the check is wrong.
    const failing = (result: typeof sheet, source: string) =>
      result.checks.filter((c) => c.passed === false && result.statements[c.statement]?.status === 'ok').map((c) => ({ label: c.label ?? '', line: source.split('\n')[(result.statements[c.statement]?.statement.span.line ?? 0) - 1] ?? '' }));
    const before = new Set(failing(evaluation.main, doc.source).map((f) => `${f.label}|${f.line.trim()}`));
    const failed = failing(sheet, proposed).filter((f) => !before.has(`${f.label}|${f.line.trim()}`));
    return { problems, numbers: loneNumbers(added.flatMap(proseOf), values, written), ...(python.length > 0 ? { python } : {}), ...(failed.length > 0 ? { failed } : {}) };
  };
  /**
   * A check in Python of an answer of the AI: run where the settings say, its results set beside the
   * sheet with the changes the answer proposes applied (the check may be of the calculation it proposes).
   */
  const runAnswerCheck = async (code: string, answer: string): Promise<CheckReport> => {
    const proposed = proposedSource(answer);
    const sheet = proposed !== undefined ? evaluateDocument({ ...doc, source: proposed }, defaultRegistry).result : evaluation.main;
    // The calculation first, its check after: a check of names the sheet has none of is not run.
    const names = reportedNames(code);
    if (names.length > 0 && !names.some((name) => sheetHas(sheet, name))) return { ok: true, output: '', rows: [], postponed: names };
    const raw = await desktop!.runPython(code, pythonEngine, pythonAsk());
    if (raw.declined) return { ok: false, output: '', rows: [], declined: true };
    const { output, results } = readOutput(raw.stdout);
    const number = (v: number) => formatNumber(v, ui, { digits: 6 }).replace('-', '−');
    const rows = compareWithSheet(results, sheet).map((c) => ({
      name: c.name,
      ...(c.kalketa ? { kalketa: `${number(c.kalketa.value)} ${c.kalketa.unit}`.trim() } : {}),
      python: `${number(c.python.value)} ${c.python.unit}`.trim(),
      ...(c.difference !== undefined ? { difference: c.difference } : {}),
      state: c.state,
      ...(isRoundResult(c.python.value) ? { round: true } : {}),
    }));
    return { ok: raw.ok, ...(raw.error ? { error: raw.error } : {}), output: [output, raw.ok ? '' : raw.stderr.trim()].filter(Boolean).join('\n'), rows };
  };
  /** A level of detail picked from the model's question: kept in the calculation, so it is not asked again. */
  const keepChoice = (choice: ChoiceBlock, value: string) => {
    if (choice.key !== 'detail' || !(DETAIL_LEVELS as readonly string[]).includes(value)) return;
    const detail = value as (typeof DETAIL_LEVELS)[number];
    // The answer goes to the model at once, before the calculation takes the level: its briefing has it from here.
    pickedDetail.current = detail;
    change({ ...doc, layout: { ...doc.layout, detail } });
  };
  /** The layer a note of the model goes into: the AI notes, or the sources (made when there is none). */
  const noteLayer = (layers: readonly Layer[], note: NoteBlock) => layers.find((l) => l.kind === (note.target === 'ai' ? 'ai' : 'sources'));
  const noteIsKept = (note: NoteBlock) => (noteLayer(doc.layers, note)?.text ?? '').includes(noteText(note).trim());
  const keepNote = (note: NoteBlock) => {
    changeWith((present) => {
      let layers: readonly Layer[] = note.target === 'ai' ? withAiLayer(present.layers) : present.layers;
      if (!noteLayer(layers, note)) layers = addLayer(layers, 'sources', note.title || t(ui, 'check.heading')).layers;
      const own = noteLayer(layers, note)!;
      const before = (own.text ?? '').trimEnd();
      return { ...present, layers: updateLayer(layers, own.id, { text: `${before ? `${before}\n\n` : ''}${noteText(note)}` }) };
    });
  };
  /** A check of an answer kept in the sources (a new sources layer when there is none), to be run there again. */
  const keepCheck = (code: string) => {
    changeWith((present) => {
      const own = present.layers.find((l) => l.kind === 'sources');
      const added = own ? undefined : addLayer(present.layers, 'sources', t(ui, 'check.heading'));
      const layers = added?.layers ?? present.layers;
      const id = own?.id ?? added!.id;
      const before = (layers.find((l) => l.id === id)?.text ?? '').trimEnd();
      const fence = '`'.repeat(3);
      return { ...present, layers: updateLayer(layers, id, { text: `${before ? `${before}\n\n` : ''}## ${t(ui, 'check.heading')}\n\n${fence}python\n${code}\n${fence}\n` }) };
    });
    setNotice(t(ui, 'check.kept'));
  };

  // Insert > Fit a curve…: the edits tried on the layer by a calculation of their own, so the
  // open sheet is not disturbed; the lines they write and the charts with the curve are the preview.
  // A level of detail just picked in the chat, until the calculation has it (then the calculation's own counts).
  const pickedDetail = useRef<(typeof DETAIL_LEVELS)[number] | undefined>(undefined);
  useEffect(() => {
    pickedDetail.current = undefined;
  }, [doc.layout.detail]);
  const fitSessions = useRef<LayerSessions | undefined>(undefined);
  const [chartLook, setChartLook] = useState<{ readonly chart: Extract<PrintBlock, { kind: 'chart' }>; write(style: string | undefined): void } | undefined>();
  const [fitEdit, setFitEdit] = useState<{ readonly choice: FitChoice; readonly start: number; readonly end: number } | undefined>();
  const previewFit = (edits: readonly LineEdit[], name: string): string => {
    fitSessions.current ??= new LayerSessions(defaultRegistry);
    const { text: tried, touched } = applyEdits(textOf(layer), edits);
    const layers = layer.kind === 'sheet' ? doc.layers : doc.layers.map((l) => (l.id === layer.id ? { ...l, text: tried } : l));
    const evaluated = fitSessions.current.evaluate(layer.kind === 'sheet' ? tried : doc.source, layers, tables, blocks);
    const own = (layer.kind === 'calc' ? evaluated.aux.get(layer.id) : undefined) ?? evaluated.main;
    const printed = buildPrintDocument(own, { catalog: printCatalog, registry: defaultRegistry, digits: doc.layout.digits, title: '', resolveFile, ...(doc.layout.chartStyle ? { chartStyle: doc.layout.chartStyle } : {}) });
    const lines = tried.split('\n');
    const calls = new RegExp(`(^|[^\\p{L}\\p{N}_])${name}\\(`, 'u');
    return printed.blocks
      .filter((b) => 'line' in b && typeof b.line === 'number' && (touched.includes(b.line) || (b.kind === 'chart' && calls.test(lines[b.line - 1] ?? ''))))
      .map((b) => renderBlockHtml(b, ui, { defineOperator: '≔', ...(doc.layout.style ? { style: doc.layout.style } : {}) }))
      .join('\n');
  };
  /**
   * What Insert > Chart… can draw: the functions of one and of two variables, the named relations and the series
   * of the sheet. The ranges first offered are found by trying the function with the units of the values it uses
   * (x in metres where it takes a, b in metres), up to a value of that unit (0 m .. a).
   */
  const chartSources = (): ChartSources => {
    fitSessions.current ??= new LayerSessions(defaultRegistry);
    const sheetText = textOf(layer);
    const lines = sheetText.split('\n');
    const namesIn = (e: Expr, out: string[] = []): string[] => {
      if (e.kind === 'variable' && !out.includes(e.name)) out.push(e.name);
      for (const v of Object.values(e)) {
        if (v && typeof v === 'object') for (const c of Array.isArray(v) ? v : [v]) if (c && typeof c === 'object' && 'kind' in c && 'span' in c) namesIn(c as Expr, out);
      }
      return out;
    };
    const quantityOf = (name: string) => {
      const v = result.values.get(name);
      return v?.type === 'quantity' && !v.im ? v : undefined;
    };
    // Does f(1 u₁, 1 u₂) give a number? Tried in a line of its own after the sheet.
    const works = (name: string, units: readonly string[]) => {
      const probe = `${name}(${units.map((u) => (u ? `1 ${u}` : '1')).join(', ')})`;
      const own = fitSessions.current!.evaluate(layer.kind === 'sheet' ? `${sheetText}\n${probe}` : doc.source, layer.kind === 'sheet' ? doc.layers : doc.layers.map((l) => (l.id === layer.id ? { ...l, text: `${sheetText}\n${probe}` } : l)), tables, blocks);
      const res = (layer.kind === 'calc' ? own.aux.get(layer.id) : undefined) ?? own.main;
      const last = res.statements.find((r) => r.statement.span.line === lines.length + 1);
      return last?.status === 'ok' && last.value?.type === 'quantity' && Number.isFinite(last.value.si);
    };
    const functions: ChartFunction[] = [];
    for (const r of result.statements) {
      const s = r.statement;
      if (s.kind !== 'definition' || !s.params || (s.params.length !== 1 && s.params.length !== 2) || r.status === 'error') continue;
      const params = s.params.map((p) => p.name);
      const used = namesIn(s.expr).filter((n) => !params.includes(n) && quantityOf(n));
      const units = ['', ...new Set(used.map((n) => quantityOf(n)!.hint?.symbol ?? '').filter(Boolean))].slice(0, 5);
      const combos = params.length === 1 ? units.map((u) => [u]) : units.flatMap((u) => units.map((w) => [u, w]));
      const fitting = combos.find((c) => works(s.name, c)) ?? params.map(() => '');
      // Up to a value of the sheet of that unit (each parameter its own one), else 10 of the unit.
      const taken = new Set<string>();
      const ranges = fitting.map((u) => {
        const ref = used.find((n) => !taken.has(n) && quantityOf(n)!.si > 0 && (quantityOf(n)!.hint?.symbol ?? '') === u);
        if (ref) taken.add(ref);
        return { from: u ? `0 ${u}` : '0', to: ref ?? (u ? `10 ${u}` : '10') };
      });
      functions.push({ name: s.name, params, ranges });
    }
    const relations: ChartRelation[] = [];
    for (const r of result.statements) {
      const s = r.statement;
      if (s.kind !== 'derive' || !s.relation || typeof s.format?.eq !== 'string') continue;
      const text = (lines[s.span.line - 1] ?? '').replace(/^\s*relation\s+/, '').replace(/\s*\{[^}]*\}\s*$/, '').trim();
      const names = s.members.flatMap((m) => namesIn(m));
      const axes = [...new Set(names.filter((n) => !quantityOf(n)))].slice(0, 2);
      // As far round as the largest value it uses, and a half more: the curve stays inside.
      const scale = names.map(quantityOf).filter((q) => q && q.si > 0).sort((p, q) => q!.si - p!.si)[0];
      const ref = scale ? names.find((n) => quantityOf(n) === scale)! : undefined;
      const span = ref ? { from: `-1.5·${ref}`, to: `1.5·${ref}` } : { from: '-10', to: '10' };
      relations.push({ name: s.format.eq, text, axes, ranges: axes.map(() => span) });
    }
    return { functions, relations, series: fitSeries(result).map((f) => f.expr) };
  };
  /** The chart of a line as it will print, inserted after the line being edited (or at the end). */
  const previewChart = (line: string): string => {
    const after = currentRange()?.end ?? lineCount;
    return previewFit([{ start: after + 1, removed: 0, lines: [line] }], '\u0000');
  };
  const applyFit = (edits: readonly LineEdit[]) => {
    const { text: changed, touched } = applyEdits(text, edits);
    setSource(changed);
    setEditing(undefined);
    if (touched[0] !== undefined) reveal.current = { layer: layer.id, line: touched[0] };
  };
  /** The curve of a chart (its line, its series) when it is fitted through points as the dialog writes it. */
  const fittedCurve = (line: number, series: number) => {
    const chart = result.statements.find((r) => r.statement.span.line === line && r.statement.kind === 'display' && r.statement.expr.kind === 'call' && r.statement.expr.name === 'plot')?.statement;
    const arg = chart?.kind === 'display' && chart.expr.kind === 'call' ? chart.expr.args[series] : undefined;
    if (arg?.kind !== 'call') return undefined;
    const own = result.statements.find((r) => r.statement.kind === 'definition' && r.statement.name === arg.name)?.statement;
    return own ? readFit(own, result.source, fitSeries(result)) : undefined;
  };
  /** A click on a curve of a chart: a curve fitted through points opens in the dialog to be changed. */
  const editCurve = (line: number, series: number) => {
    const found = fittedCurve(line, series);
    if (!found) return;
    setFitEdit(found);
    setDialog('fit');
  };

  /**
   * Ctrl+C on marked rows: their text, and (kept in the window) the pictures and tables they use,
   * so Ctrl+V in another calculation brings them along.
   */
  const copyRows = (rows: readonly { start: number; end: number; text: string }[]): string => {
    const text = [...rows].sort((a, b) => a.start - b.start).map((r) => r.text).join('\n');
    const files = new Map([...text.matchAll(/\]\(([^)\s]+)\)/g)].flatMap((m) => (doc.files.has(m[1]!) ? [[m[1]!, doc.files.get(m[1]!)!] as const] : [])));
    const tables = new Map([...doc.tables].filter(([name]) => new RegExp(`(^|[^\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}_]|$)`, 'u').test(text)));
    rowClipboard = { text, files, tables };
    return text;
  };
  /**
   * Ctrl+V outside a line: the text of the clipboard as rows after the current one, with what copied rows use and
   * this calculation lacks. `inEmpty`: pasted into an empty line being edited, which the rows take the place of.
   */
  const pasteRows = (pasted: string, inEmpty = false) => {
    const text = pasted.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!text.trim()) return;
    const into = layer.kind === 'sheet' || layer.kind === 'calc' ? layer : doc.layers[0]!;
    const range = into.id === layer.id ? currentRange() : undefined;
    const replace = inEmpty && range ? range : undefined;
    const at = replace ? replace.start - 1 : (range?.end ?? lastRowInView(into.id) ?? textOf(into).split('\n').length);
    const carried = rowClipboard?.text === text ? rowClipboard : undefined;
    changeWith((present) => {
      const files = new Map(present.files);
      for (const [path, bytes] of carried?.files ?? []) if (!files.has(path)) files.set(path, bytes);
      let next: SheetDocument = { ...present, files };
      for (const [name, table] of carried?.tables ?? []) {
        if (next.tables.has(name)) continue;
        next = assignTable({ ...next, tables: new Map(next.tables).set(name, table) }, name);
      }
      const own = into.kind === 'sheet' ? next.source : (next.layers.find((l) => l.id === into.id)?.text ?? '');
      const changed = replace ? replaceLines(own, replace.start, replace.end, text) : insertLineAfter(own, at, text);
      return into.kind === 'sheet' ? { ...next, source: changed } : { ...next, layers: updateLayer(next.layers, into.id, { text: changed }) };
    });
    setEditing(undefined);
    reveal.current = { layer: into.id, line: at + 1 };
  };

  const insertSymbol = (symbol: string) => {
    const area = document.querySelector<HTMLTextAreaElement>('textarea.row-editor');
    // A line of text edited formatted: the symbol among its words.
    if (textFormat && symbol !== ':=') return textFormat.insert(symbol);
    if (area && symbol === ':=') {
      // The definition sign at the cursor, spaced; on an empty line a new name before it.
      const before = area.value.slice(0, area.selectionStart);
      const text = before.trim() === '' ? `${uniqueName('x')} := ` : `${/\s$/.test(before) ? '' : ' '}:= `;
      area.focus();
      area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (area) {
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
    if (textFormat && !line) return textFormat.insert(source);
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
        else void navigator.clipboard.readText().then((text) => (document.querySelector('textarea.row-editor') || textFormat) && insertSymbol(text));
      });
      return;
    }
    const area = document.querySelector<HTMLTextAreaElement>('textarea.row-editor') ?? document.querySelector<HTMLElement>('[data-text-editor]');
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
    aiOn,
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
      exportPdf: () =>
        void confirmAiPrint().then((yes) => {
          if (yes) void desktop?.exportPdf({ html: printoutHtml(), suggestedName: fileName(doc) });
        }),
      example: () => openDocument(exampleDocument(undefined, t(ui, 'samples.prefix')), undefined),
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
      selectAll: () => {
        setEditing(undefined);
        setSelectAll((n) => n + 1);
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
      study: () => {
        void libraries.refresh();
        setDialog('study');
      },
      toggleAi: () => {
        if (aiOn) rememberConversation(chat);
        setAiOn(!aiOn);
      },
      shortcuts: () => setDialog('shortcuts'),
      functions: () => setDialog('functions'),
      fitCurve: () => {
        setFitEdit(undefined);
        setDialog('fit');
      },
      insertChart: () => setDialog('chart'),
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
  const pasteRowsRef = useRef(pasteRows);
  pasteRowsRef.current = pasteRows;
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
      // The word-processor editor of the sources places pictures itself.
      if (!hasFiles(e) || (e.target as HTMLElement | null)?.closest?.('.notes-word')) return;
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
      if (dialogOpen.current || (e.target as HTMLElement | null)?.closest?.('.notes-word')) return;
      const data = e.clipboardData;
      // Rows pasted into an empty line being edited (a new calculation opens with one): they become rows, not one line.
      const row = (e.target as HTMLElement | null)?.closest?.('textarea.row-editor');
      const rows = data?.getData('text/plain') ?? '';
      if (row instanceof HTMLTextAreaElement && row.value.trim() === '' && rows.replace(/\r?\n+$/, '').includes('\n') && ![...(data?.files ?? [])].length) {
        e.preventDefault();
        pasteRowsRef.current(rows, true);
        return;
      }
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
      // Text pasted outside any field (the menu took Ctrl+V, as on Linux; or the web): rows of the calculation.
      const inField = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (!inField && text.trim() !== '' && !looksLikeFile) {
        e.preventDefault();
        pasteRowsRef.current(text);
        return;
      }
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
      // A line of text of the sheet edited formatted is still a row: deleting or doubling it works there too.
      const inSheetText = !!target.closest?.('[data-text-editor]');
      if (inRich && !(inSheetText && ['Ctrl+Shift+K', 'Ctrl+D'].includes(key)) && !['Ctrl+N', 'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+P', 'Ctrl+W', 'Ctrl+Shift+N', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl++', 'Ctrl+=', 'Ctrl+-', 'Ctrl+0', 'F1'].includes(key)) return;
      const inField = !inRow && target.matches?.('input, select, textarea');
      // Outside text fields Ctrl+V takes pictures from the clipboard directly (no paste event there to rely on),
      // else its text as rows (rows copied by Ctrl+C, here or in another calculation).
      if (key === 'Ctrl+V' && !inRow && !inField && desktop) {
        e.preventDefault();
        // Pictures that cannot be read (a clipboard of the system that holds none) do not stop the text.
        void desktop
          .clipboardPictures()
          .catch(() => [])
          .then(async (pictures) => {
            if (pictures.length > 0) return void picturesRef.current(pictures);
            const text = await desktop!.clipboardText().catch(() => '');
            if (text.trim()) pasteRowsRef.current(text);
          });
        return;
      }
      // Clipboard keys stay native; in other fields undo/redo stay native too.
      if (['Ctrl+X', 'Ctrl+C', 'Ctrl+V'].includes(key)) return;
      // In a line or a field Ctrl+A selects its text; elsewhere it marks the rows of the sheet, not the whole window.
      if (key === 'Ctrl+A' && (inRow || inField)) return;
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
        {
          // Sample calculations shipped with the program, each opened as a new unsaved document.
          kind: 'submenu',
          label: t(ui, 'menu.samples'),
          // By field, only the fields that have samples yet.
          items: SAMPLE_FIELDS.flatMap((field) => {
            const own = samples().filter((sample) => sample.field === field);
            const open = (list: readonly Sample[]): MenuItem[] =>
              list.map((sample, i) => ({
                kind: 'action' as const,
                label: `&${i + 1} ${sample.title}`,
                run: () => openDocument(exampleDocument(sample.id, t(ui, 'samples.prefix')), undefined),
              }));
            // A field split into parts: a submenu for each part that has samples.
            const parts = [...new Map(own.flatMap((s) => (s.subfield ? [[s.subfield.folder, s.subfield] as const] : []))).values()];
            const items: MenuItem[] = [
              ...open(own.filter((s) => !s.subfield)),
              ...parts.map((part) => ({ kind: 'submenu' as const, label: subfieldName(part, ui.locale), items: open(own.filter((s) => s.subfield?.folder === part.folder)) })),
            ];
            return own.length === 0 ? [] : [{ kind: 'submenu' as const, label: t(ui, `samples.field.${field}`), items }];
          }),
        },
        ...(desktop ? [sep, cmd('file.exit')] : []),
      ],
    },
    {
      label: t(ui, 'menu.edit'),
      items: [cmd('edit.undo'), cmd('edit.redo'), sep, cmd('edit.cut'), cmd('edit.copy'), cmd('edit.paste'), sep, cmd('edit.duplicateLine'), cmd('edit.deleteLine'), sep, cmd('edit.selectAll')],
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
      items: [cmd('insert.text'), cmd('insert.definition'), cmd('insert.check'), cmd('insert.pick'), cmd('insert.pageBreak'), cmd('insert.clear'), sep, cmd('insert.picture'), cmd('insert.canvas'), cmd('insert.chart'), cmd('insert.fit'), cmd('insert.sheetTable'), cmd('insert.newTable'), cmd('insert.importTable'), cmd('insert.block'),
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
    {
      // The look of the line of text being edited, as in a word processor.
      label: t(ui, 'menu.format'),
      items: (() => {
        const f = textFormat;
        const on = f !== undefined;
        const mark = (key: string, value: string | undefined, label: string, shortcut?: string): MenuItem => ({
          kind: 'action',
          label,
          enabled: on,
          checked: f ? (value === undefined ? !f.attributes.has(key) : f.attributes.get(key) === value) : false,
          run: () => f?.set(key, value),
          ...(shortcut ? { shortcut } : {}),
        });
        const choices = (key: string, values: readonly string[], label: (v: string) => string): MenuItem[] => [mark(key, undefined, t(ui, 'textStyle.defaultValue')), ...values.map((v) => mark(key, v, label(v)))];
        return [
          { kind: 'action', label: t(ui, 'textStyle.bold'), enabled: on, checked: !!f?.bold, shortcut: 'Ctrl+B', run: () => f?.toggleBold() },
          { kind: 'action', label: t(ui, 'textStyle.italic'), enabled: on, checked: !!f?.italic, shortcut: 'Ctrl+I', run: () => f?.toggleItalic() },
          sep,
          { kind: 'submenu', label: t(ui, 'textStyle.font'), items: [...choices('font', TEXT_FONT_KINDS, (v) => t(ui, `textStyle.font.${v}` as UiKey)), sep, ...systemFonts.map((name) => mark('font', fontValue(name), name))] },
          { kind: 'submenu', label: t(ui, 'textStyle.size'), items: choices('size', TEXT_SIZES, (v) => `${v} pt`) },
          {
            // The colour of the marked words, as a word processor gives it (of the whole line when none are marked).
            kind: 'submenu',
            label: t(ui, 'textStyle.color'),
            items: [
              ...[undefined, ...TEXT_COLORS].map((c): MenuItem => ({ kind: 'action', label: c ? t(ui, `textStyle.color.${c}` as UiKey) : t(ui, 'textProps.colorAuto'), enabled: on, checked: f?.color === c, run: () => f?.setColor(c) })),
              sep,
              { kind: 'action', label: t(ui, 'textProps.colorMore'), enabled: on, run: morePaletteColors },
            ],
          },
          sep,
          {
            kind: 'submenu',
            label: t(ui, 'textProps.style'),
            items: [0, 1, 2, 3].map((level): MenuItem => ({ kind: 'action', label: t(ui, `textProps.level${level}` as UiKey), enabled: on, checked: f?.level === level, shortcut: `Ctrl+Alt+${level}`, run: () => f?.setLevel(level) })),
          },
          {
            kind: 'submenu',
            label: t(ui, 'textStyle.align'),
            items: [
              mark('align', undefined, t(ui, 'textStyle.align.left'), 'Ctrl+L'),
              mark('align', 'center', t(ui, 'textStyle.align.center'), 'Ctrl+E'),
              mark('align', 'right', t(ui, 'textStyle.align.right'), 'Ctrl+R'),
              mark('align', 'justify', t(ui, 'textStyle.align.justify'), 'Ctrl+J'),
            ],
          },
          sep,
          { kind: 'action', label: t(ui, 'textProps.raw'), enabled: on, run: () => f?.raw() },
          ...(on ? [] : [{ kind: 'action' as const, label: t(ui, 'textProps.hint'), enabled: false, run: () => undefined }]),
        ];
      })(),
    },
    { label: t(ui, 'menu.tools'), items: [cmd('tools.ai'), cmd('tools.study'), cmd('tools.settings')] },
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
        <PythonRunnerContext.Provider key={l.id} value={pythonRunner}>
        <NotesView
          key={l.id}
          layer={l}
          title={nameOf(l)}
          catalog={ui}
          readOnly={l.locked}
          resolveFile={resolveFile}
          fileExists={(path) => doc.files.has(path)}
          {...(l.kind === 'ai'
            ? {
                sources: aiSources(
                  conversations,
                  theorySections(doc.layers),
                  linkedLibraries(doc).map((link) => ({ ...link, source: sourceText(link.source) })),
                  new Map(libraries.found.flatMap((f) => librarySections(f.library).flatMap((s) => (s.id ? [[s.id, s.title] as const] : [])))),
                ),
                memory: aiMemoryOf(doc),
                changes: proposalViews(entriesOf(doc)),
                onDecide: decideProposal,
                onReview: reviewProposal,
                onForgetMemory: () =>
                  void askConfirm(t(ui, 'ai.memoryForgetConfirm')).then((yes) => {
                    if (yes) change(withAiMemory(doc, ''));
                  }),
                conversations,
                onContinueConversation: (id: string) => {
                  startedChat.current[tab.id] = id;
                  setActiveChat((all) => ({ ...all, [tab.id]: id }));
                  choosePane('chat');
                },
                onDeleteConversation: (id: string) =>
                  void askConfirm(t(ui, 'conv.deleteConfirm')).then((yes) => {
                    if (!yes) return;
                    change(withoutConversation(doc, id));
                    if (activeChat[tab.id] === id || chat?.id === id) setActiveChat((all) => ({ ...all, [tab.id]: '' }));
                  }),
              }
            : {})}
          {...(desktop && l.kind === 'sources' ? { onSaveLibrary: () => setLibraryLayer(l.id) } : {})}
          {...(desktop && l.kind === 'sources' && libraries.found.some((f) => f.study?.content.kind === 'pdf') ? { pickPdfCrop } : {})}
          {...(desktop && l.kind === 'sources' ? { readFormula, describeFigure, rereadText: () => void rereadSources(l.id), onStopReread: () => (stopReread.current = true), ...(rereading ? { rereading } : {}) } : {})}
          onChange={(next, files) => setLayerText(l, next, `${l.id}:notes`, files)}
          onSettle={() => {
            // New headings get their theory ids once the user stops typing in them.
            const layers = withTheoryIds(doc.layers);
            if (layers.some((x, i) => x !== doc.layers[i])) change({ ...doc, layers }, `${l.id}:notes`);
          }}
        />
        </PythonRunnerContext.Provider>
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
          {...(active ? { selectAll } : {})}
          resolveFile={resolveFile}
          onEdit={(range) => (l.locked && range ? setNotice(t(ui, 'layers.lockedNotice')) : setEditing(range))}
          onSelect={setSelected}
          onReplace={(start, end, lines) => replaceIn(l, start, end, lines)}
          onReplaceRows={(rows) => setLayerText(l, [...rows].sort((a, b) => b.start - a.start).reduce((text, r) => replaceLines(text, r.start, r.end, r.text), textOf(l)))}
          onInsertAfter={(line) => {
            setLayerText(l, insertLineAfter(source, line));
            setEditing({ start: line + 1, end: line + 1 });
          }}
          onTextFormat={setTextFormat}
          onMoreColors={morePaletteColors}
          onInsertBeside={(line) => {
            // A new cell: a line marked to stand beside the one above it, the cursor before its mark.
            setLayerText(l, replaceLines(insertLineAfter(source, line), line + 1, line + 1, '{beside}'));
            setEditing({ start: line + 1, end: line + 1, cursor: 0 });
          }}
          onDelete={(start, end) => setLayerText(l, deleteLines(source, start, end))}
          onDeleteRows={(rows) => setLayerText(l, deleteLineRanges(source, rows))}
          onPick={(statement, key, column) => pickIn(l, statement, key, column)}
          onReplacePicture={(start, end) => void replacePictureFile(l, start, end)}
          onEditCanvas={(path) => openCanvas(path)}
          onCopyRows={copyRows}
          onCurve={editCurve}
          onChartLook={(chart, write) => setChartLook({ chart, write })}
          {...(desktop ? { describePicture: describeFigure } : {})}
          onNotice={setNotice}
          curveEditable={(line, series) => !!fittedCurve(line, series)}
          onCanvasArea={(path, factorWidth, factorHeight, line) => {
            // The canvas's own size grows with its frame; what is drawn keeps its size and place.
            const scene = readScene(doc.files.get(path));
            const next = { ...scene, width: Math.max(20, Math.round(scene.width * factorWidth)), height: Math.max(10, Math.round(scene.height * factorHeight)) };
            const files = new Map([[path, writeScene(next)]]);
            if (line) setLayerText(l, replaceLines(textOf(l), line.start, line.end, line.text), undefined, files);
            else change({ ...doc, files: new Map([...doc.files, ...files]) });
          }}
          onEditCanvasWindow={(path) => openCanvas(path, 'window')}
          {...(canvasEdit?.mode === 'inline' ? { inlineCanvas: { path: canvasEdit.path, render: () => canvasEditor(canvasEdit.path, 'inline') } } : {})}
          onPlace={(start, end, after, line) => {
            // The new line and the move in one step: undone at once.
            setLayerText(l, moveLines(replaceLines(source, start, end, line), start, start + line.split('\n').length - 1, after));
            setSelected(undefined);
          }}
          onMoveLines={(start, end, after) => {
            setLayerText(l, moveLines(source, start, end, after));
            // The selection is kept by statement order, which the move changes.
            setSelected(undefined);
          }}
          geometry={geometry}
          zoom={zoom}
          title={l.kind === 'calc' ? nameOf(l) : (/^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(doc.source)?.[1] ?? doc.manifest.title)}
          headRight={headRight}
          uiCatalog={printCatalog}
          decimalComma={decimalComma}
          calcStyle={doc.layout.style ?? 'airy'}
          pageNumbers={doc.layout.pageNumbers ?? 'continuous'}
          onSummary={(summary) => change({ ...doc, layout: { ...doc.layout, summary } })}
          {...(l.kind === 'sheet' ? { aiMade: aiMarks(source), onAiReviewed: reviewProposal, onAiShow: showProposal } : {})}
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
                {/* What the pane can show, as tabs: one click to switch, and it is clear what is there. */}
                <nav className="pane-tabs" role="tablist" aria-label={t(ui, 'editor.pane')}>
                  {PANE_TABS.map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={pane === id} className={`pane-tab${pane === id ? ' active' : ''}`} data-pane={id} onClick={() => choosePane(id)}>
                      {t(ui, label).replace('&', '')}
                    </button>
                  ))}
                  <span className="grow" />
                  <button type="button" className="pane-hide" title={t(ui, 'pane.hide')} onClick={() => choosePane('none')}>
                    ✕
                  </button>
                </nav>
                <div className="pane-body">
                  {textFormat && pane !== 'chat' && <TextProperties format={textFormat} catalog={ui} paletteRequest={paletteRequest} />}
                  {pane === 'chat' ? (
                    <ChatPane
                      catalog={ui}
                      settings={aiSettings}
                      aiOn={aiOn}
                      onAiOn={(on) => {
                        if (!on) rememberConversation(chat);
                        setAiOn(on);
                      }}
                      turns={chat?.turns ?? []}
                      onTurns={(turns) => {
                        // Kept in the AI notes of the calculation: a new conversation gets its id with its first question.
                        const id = chat?.id ?? startedChat.current[tab.id] ?? globalThis.crypto.randomUUID();
                        startedChat.current[tab.id] = id;
                        const started = chat?.started ?? turns[0]?.time ?? new Date().toISOString();
                        setActiveChat((all) => ({ ...all, [tab.id]: id }));
                        const last = turns[turns.length - 1];
                        changeWith((present) => {
                          let next = withConversation(present, { id, started, provider: aiSettings.provider, ...(aiSettings.model ? { model: aiSettings.model } : {}), turns });
                          if (last?.role !== 'assistant') return next;
                          // Changes the answer proposes go into the journal, open, with the lines they replace as they are now.
                          const known = new Set(entriesOf(next).map((e) => e.id));
                          const proposed = parseProposals(last.text)
                            .map((p, n): ChangeEntry => {
                              const before = replacedLines(next.source, p);
                              return {
                                id: `${id}:${turns.length - 1}:${n + 1}`,
                                kind: 'change',
                                time: last.time ?? new Date().toISOString(),
                                ...(last.model ? { model: last.model } : {}),
                                conversation: id,
                                from: p.from,
                                to: p.to,
                                ...(p.insert ? { insert: true } : {}),
                                ...(before ? { before } : {}),
                                after: p.lines,
                                state: 'open',
                              };
                            })
                            .filter((e) => !known.has(e.id));
                          next = withEntries(next, proposed);
                        // Whole new calculations the answer wrote, to open as new sheets.
                        const knownSheets = new Set(newSheetsOf(next).map((e) => e.id));
                        const sheets = parseNewSheets(last.text)
                          .map((s, n): SheetEntry => ({
                            id: `${id}:${turns.length - 1}:s${n + 1}`,
                            kind: 'sheet',
                            time: last.time ?? new Date().toISOString(),
                            ...(last.model ? { model: last.model } : {}),
                            conversation: id,
                            title: s.title,
                            lines: s.lines,
                            state: 'open',
                          }))
                          .filter((e) => !knownSheets.has(e.id));
                        next = withEntries(next, sheets);
                          // The calculation keeps copies of the library sections an answer cited.
                          return libraries.recordCited(last.text, next);
                        }, 'ai-chat');
                      }}
                      proposals={(turn) => (chat ? proposalViews(entriesOf(doc).filter((e) => e.id.startsWith(`${chat.id}:${turn}:`))) : [])}
                      onDecide={decideProposal}
                      onReview={reviewProposal}
                    answerProposals={answerProposals}
                    onAcceptAll={acceptAll}
                    onNewSheet={toNewSheet}
                    newSheets={newSheetViews}
                    onOpenSheet={openNewSheet}
                    checkSheet={checkProposedSheet}
                    {...(desktop ? { runCheck: runAnswerCheck, onCheckToSources: keepCheck } : {})}
                    onChoice={keepChoice}
                    onKeepNote={keepNote}
                    noteKept={noteIsKept}
                      onNew={() => {
                        rememberConversation(chat);
                        startedChat.current[tab.id] = undefined;
                        setActiveChat((all) => ({ ...all, [tab.id]: '' }));
                      }}
                      libraries={libraries.entries}
                      onLibraries={() => void libraries.refresh()}
                      onToggleLibrary={libraries.toggle}
                      theory={[...theorySections(doc.layers), ...libraries.theory().sections]}
                      context={chatContext}
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
        {waiting && <span className="waiting">{t(ui, 'status.waiting')}</span>}
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
      {libraryLayer && doc.layers.some((l) => l.id === libraryLayer) && (
        <TheoryLibraryDialog
          catalog={ui}
          layer={withTheoryIds(doc.layers).find((l) => l.id === libraryLayer)!}
          files={doc.files}
          language={doc.manifest.language ?? ui.locale}
          {...(tab.path !== undefined ? { sheetPath: tab.path } : {})}
          onSaved={(path) => {
            setNotice(t(ui, 'library.saved', { path }));
            void libraries.refresh();
          }}
          onClose={() => setLibraryLayer(undefined)}
        />
      )}
      {dialog === 'settings' && (
        <SettingsDialog
          catalog={ui}
          language={language}
          sizeLimit={sizeLimit}
          canvasMode={canvasMode}
          python={pythonEngine}
          ai={aiSettings}
          aiOn={aiOn}
          onApply={(next) => {
            setAiSettings(next.ai);
            remember(AI_SETTINGS_KEY, JSON.stringify(next.ai));
            if (next.aiKey && desktop) void desktop.aiSetKey({ provider: next.ai.provider, ...next.aiKey });
            setCanvasMode(next.canvasMode);
            remember(CANVAS_MODE_KEY, next.canvasMode);
            setPythonEngine(next.python);
            remember(PYTHON_ENGINE_KEY, next.python);
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
      {reread && (
        <RereadDialog
          catalog={ui}
          changes={reread.changes}
          onApply={(chosen) => {
            const target = doc.layers.find((l) => l.id === reread.layer);
            if (!target) return;
            // Each paragraph replaced where it stands now; one the user changed meanwhile stays.
            let text = target.text ?? '';
            for (const c of chosen) if (text.includes(c.old)) text = text.replace(c.old, c.text);
            setLayerText(target, text);
          }}
          onClose={() => setReread(undefined)}
        />
      )}
      {dialog === 'properties' && <PropertiesDialog catalog={ui} doc={doc} onApply={(next) => change(next)} onClose={() => setDialog(undefined)} />}
      {dialog === 'customize' && <CustomizeDialog catalog={ui} layout={toolbars} commands={commands} onApply={changeToolbars} onClose={() => setDialog(undefined)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog catalog={ui} commands={commands} onClose={() => setDialog(undefined)} />}
      {canvasEdit?.mode === 'window' && canvasEditor(canvasEdit.path, 'window')}
      {chartLook && (
        <ChartLookDialog
          catalog={ui}
          spec={chartLook.chart.spec}
          size={{ width: chartLook.chart.layout.width, height: chartLook.chart.layout.height }}
          format={chartNumber}
          base={doc.layout.chartStyle ? parseChartLook(doc.layout.chartStyle) : {}}
          own={chartLook.chart.ownLook ?? {}}
          onApply={(look) => {
            // The chart keeps of its own only what differs from the style of the calculation.
            const own = chartLookText(lookDifference(look, doc.layout.chartStyle ? parseChartLook(doc.layout.chartStyle) : undefined));
            chartLook.write(own ? `"${own}"` : undefined);
            setChartLook(undefined);
          }}
          onSaveStyle={(look) => {
            // The style of the calculation: this chart takes it, so it keeps nothing of its own.
            chartLook.write(undefined);
            const style = chartLookText(look);
            changeWith((present) => {
              const { chartStyle: _, ...layout } = present.layout;
              return { ...present, layout: style ? { ...layout, chartStyle: style } : layout };
            });
            setChartLook(undefined);
          }}
          onClose={() => setChartLook(undefined)}
        />
      )}
      {dialog === 'chart' && (
        <ChartDialog
          catalog={ui}
          sources={chartSources()}
          decimalComma={decimalComma}
          preview={previewChart}
          onApply={(line) => {
            setDialog(undefined);
            insertLine(line);
          }}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog === 'fit' && (
        <FitDialog
          catalog={ui}
          series={fitSeries(result)}
          taken={new Set(result.values.keys())}
          charts={fitCharts(result)}
          after={currentRange()?.end ?? lineCount}
          {...(fitEdit ? { editing: fitEdit } : {})}
          preview={previewFit}
          onApply={(edits) => {
            setDialog(undefined);
            setFitEdit(undefined);
            applyFit(edits);
          }}
          onClose={() => {
            setDialog(undefined);
            setFitEdit(undefined);
          }}
        />
      )}
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
      {cropping && (
        <PdfCropDialog
          catalog={ui}
          files={libraries.found}
          {...(tab.path ? { sheetPath: tab.path } : {})}
          onInsert={cropping}
          onClose={() => setCropping(undefined)}
        />
      )}
      {dialog === 'study' && (
        <StudyDialog
          catalog={ui}
          files={libraries.found}
          {...(tab.path ? { sheetPath: tab.path } : {})}
          sheetText={`${doc.manifest.title}\n${doc.source}`}
          onSave={libraries.saveStudy}
          onImport={(file, settings) => void importStudy(file, settings)}
          onClose={() => setDialog(undefined)}
        />
      )}
      <AskHost catalog={ui} title="Kalketa" />
    </div>
  );
}
