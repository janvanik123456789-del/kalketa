/**
 * Kalketa desktop application (Electron main process).
 *
 * Each window shows the editor (packages/editor); Window > New window opens
 * another one, e.g. to compare two calculations on two monitors. The editor
 * has no access to Node or the disk; it gets a small, fixed set of functions
 * through the preload bridge: open and save files, print, export PDF, a new
 * window, a guard against closing with unsaved changes, and the AI settings
 * (keys stay here, see ai.ts).
 */

import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, shell, type IpcMainInvokeEvent } from 'electron';
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';
import { canSealKeys, registerAiBridge } from './ai.js';
import { registerTheoryBridge } from './theory.js';
import { systemFonts } from './fonts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// .calc: calculation files from before the program was renamed (it was CalcCanvas).
const SHEET_EXTENSIONS = ['.kalk', '.calc', '.cc'];
const PICTURE_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};
const MAX_PICTURE_BYTES = 30 * 1024 * 1024;

/**
 * Files copied in a file manager: Linux file managers put a list of file://
 * URIs (text/uri-list or GNOME's own format), Explorer its own format; some
 * put just the path as text.
 */
async function clipboardFiles(): Promise<string[]> {
  const texts: string[] = [];
  for (const item of await clipboard.read()) {
    for (const type of item.types) {
      if (type !== 'text/uri-list' && type !== 'text/plain' && !type.includes('gnome-copied-files') && !type.includes('FileNameW')) continue;
      const blob = (await item.getType(type)) as Blob;
      texts.push(type.includes('FileNameW') ? Buffer.from(await blob.arrayBuffer()).toString('utf16le').replace(/\0.*$/s, '') : await blob.text());
    }
  }
  const paths: string[] = [];
  for (const line of texts.join('\n').split(/\r?\n/)) {
    const entry = line.trim();
    try {
      if (entry.startsWith('file://')) paths.push(fileURLToPath(entry));
      else if (/^(\/|[A-Za-z]:\\)/.test(entry)) paths.push(entry);
    } catch {
      // Not a file URI.
    }
  }
  return [...new Set(paths)];
}

/** A picture copied in another program (a screenshot, a picture from a browser). */
async function clipboardImage(): Promise<Uint8Array | undefined> {
  for (const item of await clipboard.read()) {
    const type = item.types.find((t) => t === 'image/png') ?? item.types.find((t) => t.startsWith('image/'));
    if (type) return new Uint8Array(await ((await item.getType(type)) as Blob).arrayBuffer());
  }
  return undefined;
}

interface OpenedFile {
  readonly path: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

interface CloseGuard {
  dirty: boolean;
  message: string;
  discard: string;
  cancel: string;
}

/**
 * Editor windows by their web contents, each with its own close guard and the
 * files it has open. A file is open in one window at most: two copies would
 * overwrite each other's changes.
 */
const editors = new Map<number, { readonly window: BrowserWindow; readonly guard: CloseGuard; files: Set<string> }>();
/** The editor window used last; files opened from outside go there. */
let lastFocused: BrowserWindow | undefined;
/** The first window, which the smoke test drives. */
let smokeWindow: BrowserWindow | undefined;
// The program was called CalcCanvas: its settings (tool bars, language, recent files) move over once.
{
  const current = app.getPath('userData');
  const previous = current.replace(/Kalketa/g, 'CalcCanvas').replace(/kalketa/g, 'calccanvas');
  if (previous !== current && existsSync(previous) && !existsSync(current)) {
    try {
      cpSync(previous, current, { recursive: true });
    } catch {
      // Not moved: the program starts with default settings.
    }
  }
}

const smokeTest = process.env['KALKETA_SMOKE_TEST'];
/** The smoke test's export to PDF: where it goes, and the page numbers the printout laid out. */
const smokePdf: { path?: string | undefined; pages?: string[] | undefined } = {};

/**
 * How long the start takes, by phase, in seconds since the process began: one line per start
 * in startup.log of the profile, so a slow start can be told where it loses its time.
 */
const startupMarks: string[] = [];
function startupMark(name: string, seconds = process.uptime()): void {
  if (startupMarks.some((m) => m.startsWith(`${name} `))) return;
  startupMarks.push(`${name} ${seconds.toFixed(2)}`);
  // Written once both are known: the window seen and the last session's files open.
  const done = (n: string) => startupMarks.some((m) => m.startsWith(`${n} `));
  if (!done('shown') || !done('restored')) return;
  try {
    appendFileSync(join(app.getPath('userData'), 'startup.log'), `${new Date().toISOString()} ${startupMarks.join(', ')}\n`);
  } catch {
    // Not written: the start is not slower for it.
  }
}
startupMark('main');
/** File given on the command line or by double click, before the window was ready. */
let pendingOpen: string | undefined = sheetArgument(process.argv);

// The smoke test runs with a fresh profile, so it neither sees nor changes the
// user's toolbars, language or recent files.
if (smokeTest) app.setPath('userData', mkdtempSync(join(tmpdir(), 'kalketa-smoke-')));
// A profile of its own, to measure or try a start beside a running Kalketa.
else if (process.env['KALKETA_USER_DATA']) app.setPath('userData', process.env['KALKETA_USER_DATA']);

function editorEntry(): { url?: string; file?: string } {
  const devUrl = process.env['KALKETA_DEV_URL'];
  if (devUrl) return { url: devUrl };
  return { file: app.isPackaged ? join(process.resourcesPath, 'editor', 'index.html') : join(HERE, '../../editor/dist/index.html') };
}

/** Opens an editor window; `blank` starts it with an empty calculation instead of the example. */
function createWindow(options: { blank?: boolean } = {}): BrowserWindow {
  // A new window opens slightly below and right of the current one.
  const from = BrowserWindow.getFocusedWindow() ?? lastFocused;
  const position = from && !from.isDestroyed() ? { x: from.getPosition()[0]! + 32, y: from.getPosition()[1]! + 32 } : {};
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...position,
    minWidth: 900,
    minHeight: 600,
    title: 'Kalketa',
    backgroundColor: '#eef0f3',
    show: false,
    webPreferences: {
      preload: join(HERE, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  const contentsId = win.webContents.id;
  const guard: CloseGuard = { dirty: false, message: '', discard: 'Discard', cancel: 'Cancel' };
  editors.set(contentsId, { window: win, guard, files: new Set() });
  lastFocused = win;
  win.on('focus', () => (lastFocused = win));
  win.on('closed', () => {
    editors.delete(contentsId);
    if (lastFocused === win) lastFocused = [...editors.values()].at(-1)?.window;
  });

  // The window only ever shows the editor; links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.on('close', (event) => {
    if (!guard.dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Kalketa',
      message: guard.message,
      buttons: [guard.discard, guard.cancel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice !== 0) event.preventDefault();
  });

  if (smokeTest && !smokeWindow) {
    smokeWindow = win;
    // Errors of the page go into the result: a failed step then says why.
    win.webContents.on('console-message', (details) => {
      if (details.level === 'error') smokeConsole.push(details.message.slice(0, 300));
    });
    win.webContents.once('did-finish-load', () => void runSmokeTest(smokeTest));
  } else if (!smokeTest) {
    win.once('ready-to-show', () => {
      startupMark('shown');
      win.show();
    });
    win.webContents.once('did-finish-load', () => startupMark('loaded'));
    // The page says when it has opened the files of the last session.
    win.webContents.on('console-message', (details) => {
      if (details.message === '[startup] restored') startupMark('restored');
    });
    // Without a GPU (a virtual machine without 3D, Wayland) the first paint may never be reported:
    // the window shows anyway, else the program runs with no window to see.
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        startupMark('unpainted');
        startupMark('shown');
        win.show();
      }
    }, 3000);
  }
  win.webContents.once('did-finish-load', () => {
    if (pendingOpen) {
      void sendOpen(pendingOpen);
      pendingOpen = undefined;
    }
  });

  // The editor starts in the language of the operating system (until the user picks another).
  // The smoke test types Czech notation (50,5; separators ";"), so it runs in Czech everywhere.
  const lang = smokeTest ? 'cs' : (app.getPreferredSystemLanguages()[0] ?? app.getLocale()).slice(0, 2);
  const query: Record<string, string> = { lang, ...(options.blank ? { blank: '1' } : {}) };
  const entry = editorEntry();
  if (entry.url) void win.loadURL(`${entry.url}?${new URLSearchParams(query)}`);
  else void win.loadFile(entry.file!, { query });
  return win;
}

/** Paths compare as the file system does: case-insensitive on Windows. */
function fileKey(path: string): string {
  const full = resolve(path);
  return process.platform === 'win32' || process.platform === 'darwin' ? full.toLowerCase() : full;
}

/** The window that has the file open, if any. */
function ownerOf(path: string): BrowserWindow | undefined {
  const key = fileKey(path);
  return [...editors.values()].find((e) => e.files.has(key))?.window;
}

/** Brings the window with the file to the front and lets it show the file's tab. */
function reveal(owner: BrowserWindow, path: string): void {
  if (owner.isMinimized()) owner.restore();
  owner.focus();
  owner.webContents.send('kalketa:show-file', path);
}

/**
 * Hands a file to a window unless another window has it open already; then
 * that one is shown instead. Returns the file, or undefined when shown elsewhere.
 */
async function openFor(window: BrowserWindow, path: string): Promise<OpenedFile | undefined> {
  const owner = ownerOf(path);
  if (owner && owner !== window) {
    reveal(owner, path);
    return undefined;
  }
  const file = await readSheet(path);
  // Counted at once, so a quick second attempt from another window is caught too.
  editors.get(window.webContents.id)?.files.add(fileKey(path));
  return file;
}

/** The window files from outside go to: the one used last. */
function targetWindow(): BrowserWindow | undefined {
  return lastFocused && !lastFocused.isDestroyed() ? lastFocused : [...editors.values()][0]?.window;
}

async function sendOpen(path: string): Promise<void> {
  try {
    const window = targetWindow();
    if (!window) return;
    const file = await openFor(window, path);
    if (file) window.webContents.send('kalketa:open-file', file);
  } catch (err) {
    dialog.showErrorBox('Kalketa', `${path}\n${(err as Error).message}`);
  }
}

async function readSheet(path: string): Promise<OpenedFile> {
  return { path, name: basename(path), bytes: new Uint8Array(await readFile(path)) };
}

function sheetArgument(argv: readonly string[]): string | undefined {
  return argv.slice(1).find((arg) => SHEET_EXTENSIONS.includes(extname(arg).toLowerCase()));
}

/** Only the editor windows may call the bridge. */
function fromEditor(event: IpcMainInvokeEvent): BrowserWindow {
  const editor = editors.get(event.sender.id);
  if (!editor) throw new Error('Unknown sender');
  return editor.window;
}

function registerBridge(): void {
  ipcMain.handle('kalketa:open-dialog', async (event, labels: { sheets: string }) => {
    const owner = fromEditor(event);
    const result = await dialog.showOpenDialog(owner, {
      properties: ['openFile'],
      filters: [{ name: String(labels?.sheets ?? 'Kalketa'), extensions: ['kalk', 'calc', 'cc'] }],
    });
    const path = result.filePaths[0];
    return result.canceled || !path ? undefined : openFor(owner, path);
  });

  // Recent files: only sheet files can be opened this way.
  ipcMain.handle('kalketa:open-path', async (event, path: unknown) => {
    const owner = fromEditor(event);
    if (typeof path !== 'string' || !SHEET_EXTENSIONS.includes(extname(path).toLowerCase())) return undefined;
    try {
      return await openFor(owner, path);
    } catch {
      return undefined;
    }
  });

  ipcMain.handle('kalketa:save', async (event, request: { path?: string; current?: string; suggestedName: string; bytes: Uint8Array; openElsewhere?: string }) => {
    const owner = fromEditor(event);
    // A file from before the rename (.calc) is saved where it is; new files get .kalk.
    let path = typeof request.path === 'string' && ['.kalk', '.calc'].includes(extname(request.path).toLowerCase()) ? request.path : undefined;
    if (!path) {
      const result = await dialog.showSaveDialog(owner, {
        defaultPath: `${request.suggestedName}.kalk`,
        filters: [{ name: 'Kalketa', extensions: ['kalk'] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      path = result.filePath;
    }
    // Never write over a file that is open (in another window or another tab),
    // except the document's own file.
    const current = typeof request.current === 'string' ? fileKey(request.current) : undefined;
    if (ownerOf(path) && fileKey(path) !== current) {
      await dialog.showMessageBox(owner, { type: 'warning', message: String(request.openElsewhere ?? path), noLink: true });
      return undefined;
    }
    await writeFile(path, request.bytes);
    editors.get(event.sender.id)?.files.add(fileKey(path));
    return path;
  });

  ipcMain.handle('kalketa:print', async (event, html: string) => {
    fromEditor(event);
    const printer = await printWindow(html);
    return new Promise<boolean>((resolve) => {
      printer.webContents.print({}, (success) => {
        printer.destroy();
        resolve(success);
      });
    });
  });

  ipcMain.handle('kalketa:export-pdf', async (event, request: { html: string; suggestedName: string }) => {
    const owner = fromEditor(event);
    // The smoke test exports to its own file, without the dialog, and does not open it.
    const result = smokePdf.path
      ? { canceled: false, filePath: smokePdf.path }
      : await dialog.showSaveDialog(owner, {
          defaultPath: `${request.suggestedName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
    if (result.canceled || !result.filePath) return undefined;
    const printer = await printWindow(request.html);
    try {
      if (smokePdf.path) smokePdf.pages = (await printer.webContents.executeJavaScript(`[...document.querySelectorAll('.paged-page .pf-right')].map((e) => e.textContent)`)) as string[];
      if (smokePdf.path) await writeFile(smokePdf.path.replace(/\.pdf$/, '-print.png'), (await printer.webContents.capturePage()).toPNG());
      // CSS @page decides the paper size and margins; the page numbers too, unless the printout laid out its pages.
      const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
      await writeFile(result.filePath, pdf);
    } finally {
      printer.destroy();
    }
    if (!smokePdf.path) void shell.openPath(result.filePath);
    return result.filePath;
  });

  ipcMain.on('kalketa:close-guard', (event, guard: CloseGuard) => {
    const editor = editors.get(event.sender.id);
    if (!editor) return;
    editor.guard.dirty = Boolean(guard?.dirty);
    editor.guard.message = String(guard?.message ?? '');
    editor.guard.discard = String(guard?.discard ?? 'Discard');
    editor.guard.cancel = String(guard?.cancel ?? 'Cancel');
  });

  // Each window tells which files it has open (after opening, saving as, closing).
  ipcMain.on('kalketa:open-files', (event, paths: unknown) => {
    const editor = editors.get(event.sender.id);
    if (!editor || !Array.isArray(paths)) return;
    editor.files = new Set(paths.filter((p): p is string => typeof p === 'string').map(fileKey));
  });

  ipcMain.handle('kalketa:system-fonts', async (event) => {
    fromEditor(event);
    return systemFonts();
  });

  ipcMain.handle('kalketa:clipboard-pictures', async (event) => {
    fromEditor(event);
    const pictures: { name: string; type: string; bytes: Uint8Array }[] = [];
    for (const path of (await clipboardFiles()).slice(0, 20)) {
      const type = PICTURE_TYPES[extname(path).toLowerCase()];
      if (!type) continue;
      try {
        if ((await stat(path)).size > MAX_PICTURE_BYTES) continue;
        pictures.push({ name: basename(path), type, bytes: await readFile(path) });
      } catch {
        // A file that cannot be read is left out.
      }
    }
    if (pictures.length > 0) return pictures;
    const image = await clipboardImage();
    return image ? [{ name: '', type: 'image/png', bytes: image }] : [];
  });

  ipcMain.handle('kalketa:new-window', (event) => {
    fromEditor(event);
    createWindow({ blank: true });
  });

  registerAiBridge(fromEditor);
  registerTheoryBridge(fromEditor);
}

/**
 * Automated check without showing a window (KALKETA_SMOKE_TEST=<pdf path>):
 * the editor loaded, the bridge is present, the example sheet evaluated, and a
 * PDF can be produced. Prints a JSON line and exits with 0 or 1.
 */
async function runSmokeTest(pdfPath: string): Promise<void> {
  let ok = false;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = (await smokeWindow!.webContents.executeJavaScript(`({
      bridge: typeof window.kalketaDesktop === 'object',
      rows: document.querySelectorAll('.row').length,
      summary: document.querySelectorAll('.summary-box tbody tr').length,
      math: document.querySelectorAll('math').length,
      errors: document.querySelector('.statusbar')?.textContent ?? '',
      menus: document.querySelectorAll('.menubar-item').length,
      toolbars: document.querySelectorAll('.toolbar-box').length,
      language: document.documentElement.lang,
      // "Two pages side by side" (the default zoom): the first two pages share a row.
      sideBySide: (() => {
        const pages = [...document.querySelectorAll('.page')].map((p) => p.getBoundingClientRect());
        return pages.length > 1 && Math.abs(pages[0].top - pages[1].top) < 2 && pages[1].left > pages[0].right;
      })()
    })`)) as { bridge: boolean; rows: number; summary: number; math: number; errors: string; menus: number; toolbars: number; language: string; sideBySide: boolean };
    const reshapedColumns = await reshapeWithRealMouse();
    const layers = await layersWithRealInput(pdfPath.replace(/\.pdf$/i, '') + '-layers.png');
    const printer = await printWindow('<!doctype html><meta charset="utf-8"><h1>Kalketa</h1><math><mfrac><mi>a</mi><mn>2</mn></mfrac></math>');
    const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true });
    printer.destroy();
    await writeFile(pdfPath, pdf);
    ok =
      state.bridge && state.sideBySide && state.menus === 8 && state.toolbars > 0 && state.rows > 10 && state.summary > 0 && state.math > 0 && reshapedColumns === 3 && pdf.length > 1000 &&
      layers.deflection && layers.pickTaken.column.startsWith('→') && /mm|cm/.test(layers.pickTaken.text) && layers.newKeepsExample && layers.samplesOk && layers.derivations && layers.summaryOk && layers.definitionAtCursor && layers.sheetGridOk && layers.tableEnter && layers.solvedByFormula && layers.rootsAndExtremes && layers.wordPrinted && layers.wordColored && layers.wordText.focused && layers.wordText.pane && layers.wordText.bold === 'dynamiky' && !layers.wordText.shown.includes('"') && layers.wordText.align === 'center' && layers.cellMarked === 'Síla na konci' && layers.cellFont.startsWith('Arial') && layers.cellDeleted && layers.tableRowAdded && layers.tabs === 4 && layers.used === 1 && layers.errors === 0 && layers.citations === 1 && layers.notesPicture === 'FIGURE+img BLOCKQUOTE' && layers.notesPlaced === 'narrower centred' && layers.aiReadOnly && layers.multi && layers.functions && layers.solved && layers.ownUnits && layers.complex && layers.finance && layers.money && layers.rod && layers.calculus && layers.matrices && layers.charts && layers.functionBar && layers.revisions && layers.roots && layers.toolIcons && layers.aiSettings && layers.aiChat && layers.pdfCleanup && layers.theoryLibrary && layers.study && layers.licences && layers.help && layers.pictures && layers.blocksOk !== false && layers.mainHidden && layers.twoLayers === 'layer3 layer4' && /^main:\d+ layer\d+\*:\d+$/.test(layers.split) && layers.addKinds === 3 && !layers.aiDeletable && layers.aiMenu > 2 && layers.tableStrip && !layers.aiTabWhileEmpty && !layers.aiTabAfterClose && layers.q.includes('16,73');
    console.log(JSON.stringify({ ok, ...state, reshapedColumns, layers, pdfBytes: pdf.length }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: (err as Error).message, console: smokeConsole.slice(-5) }));
  }
  app.exit(ok ? 0 : 1);
}

/**
 * Drags the corner handle of the Operators toolbar 70 px to the right with
 * real mouse events (not synthetic DOM events, which once hid a misplaced
 * handle). Returns the number of columns afterwards; 1 + round(70 / 30) = 3.
 */
async function reshapeWithRealMouse(): Promise<number> {
  const contents = smokeWindow!.webContents;
  const handle = (await contents.executeJavaScript(`(() => {
    window.__smokeEvents = [];
    for (const type of ['mousedown', 'mousemove', 'mouseup']) {
      window.addEventListener(type, (e) => window.__smokeEvents.push(type + ':' + (e.target.className || e.target.tagName)), true);
    }
    const r = document.querySelector('.toolbar-box[data-toolbar="operators"] .reshape-handle.corner').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`)) as { x: number; y: number };
  contents.sendInputEvent({ type: 'mouseDown', x: handle.x, y: handle.y, button: 'left', clickCount: 1 });
  for (let dx = 10; dx <= 70; dx += 10) {
    contents.sendInputEvent({ type: 'mouseMove', x: handle.x + dx, y: handle.y, modifiers: ['leftbuttondown'] });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  contents.sendInputEvent({ type: 'mouseUp', x: handle.x + 70, y: handle.y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const columns = (await contents.executeJavaScript(`(() => {
    const grid = document.querySelector('.toolbar-box[data-toolbar="operators"] .button-grid');
    return grid ? grid.style.gridTemplateColumns.match(/repeat\\((\\d+)/)?.[1] * 1 : 1;
  })()`)) as number;
  if (columns !== 3) {
    // Which elements received the mouse tells whether the handle was hit at all.
    console.log(JSON.stringify({ handle, events: await contents.executeJavaScript('[...new Set(window.__smokeEvents)]') }));
  }
  return columns;
}

/** Errors the page wrote to its console during the smoke test. */
const smokeConsole: string[] = [];

// Real input for the smoke test: the events go through Chromium's input
// pipeline like the user's mouse and keyboard.
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickOn(selector: string, modifiers: Array<'control' | 'shift'> = [], button: 'left' | 'right' = 'left'): Promise<void> {
  const contents = smokeWindow!.webContents;
  const point = (await contents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return undefined;
    element.scrollIntoView({ block: 'center' });
    const r = element.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) };
  })()`)) as { x: number; y: number } | undefined;
  if (!point) throw new Error(`Not found: ${selector}`);
  contents.sendInputEvent({ type: 'mouseDown', ...point, button, clickCount: 1, modifiers });
  contents.sendInputEvent({ type: 'mouseUp', ...point, button, clickCount: 1, modifiers });
  await pause(150);
}

/** Clicks the row of an open menu (the deepest one first) whose label starts with `label`. */
async function clickMenu(label: string): Promise<void> {
  const found = (await smokeWindow!.webContents.executeJavaScript(`(() => {
    document.querySelectorAll('[data-smoke]').forEach((e) => e.removeAttribute('data-smoke'));
    const rows = [...document.querySelectorAll('.menu-panel .menu-row')].reverse();
    const text = (r) => r.querySelector('.menu-label').textContent.trim();
    const row = rows.find((r) => text(r) === ${JSON.stringify(label)}) ?? rows.find((r) => text(r).startsWith(${JSON.stringify(label)}));
    row?.setAttribute('data-smoke', '');
    return !!row;
  })()`)) as boolean;
  if (!found) throw new Error(`No menu row: ${label}`);
  await clickOn('[data-smoke]');
}

async function typeText(text: string): Promise<void> {
  const contents = smokeWindow!.webContents;
  const before = (await contents.executeJavaScript(`document.activeElement?.value?.length ?? -1`)) as number;
  const rich = (await contents.executeJavaScript(`document.activeElement?.isContentEditable === true`)) as boolean;
  for (const ch of text) contents.sendInputEvent({ type: 'char', keyCode: ch });
  await pause(150);
  // The next key waits until the text is there, as the person typing sees it (a busy page,
  // e.g. a heavy calculation after every character, may lag behind): in a line being edited
  // its length, in the rich text of notes its end ("## " may turn into a heading on the way).
  const tail = [...text.trim()].slice(-4).join('');
  if (before < 0 && !(rich && tail)) return;
  for (let waited = 0; waited < 3000; waited += 100) {
    const done = rich
      ? ((await contents.executeJavaScript(`(document.activeElement?.textContent ?? '').includes(${JSON.stringify(tail)})`)) as boolean)
      : ((await contents.executeJavaScript(`document.activeElement?.value?.length ?? -1`)) as number) >= before + [...text].length;
    if (done) return;
    await pause(100);
  }
}

async function pressKey(keyCode: string, modifiers: Array<'control' | 'shift'> = []): Promise<void> {
  smokeWindow!.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  smokeWindow!.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await pause(150);
}

/**
 * Layers with real input: adds an auxiliary calculation with a load, lets the
 * sheet take it over, adds a sources layer with a citation. Saves a picture
 * of the window. Returns what the editor shows afterwards.
 */
async function layersWithRealInput(picture: string) {
  const contents = smokeWindow!.webContents;
  contents.focus();
  // Right after start, "+" adds a tab next to the example (it does not replace it); Ctrl+W closes it again.
  await clickOn('.doc-tab-new');
  const tabsAfterNew = (await contents.executeJavaScript(`[...document.querySelectorAll('.doc-tab .doc-tab-title')].map((t) => t.textContent)`)) as string[];
  await pressKey('W', ['control']);
  const newKeepsExample = tabsAfterNew.length === 2 && (await contents.executeJavaScript(`document.querySelectorAll('.doc-tab').length`)) === 1;
  // File > Sample calculations: a sample opens in a tab of its own, named as a sample (never as the user's file).
  await clickOn('.menubar-item:nth-child(1) > button');
  await clickMenu('Vzorové příklady');
  await clickMenu('4 Dimenzování');
  await pause(600);
  const sampleTab = (await contents.executeJavaScript(`({
    tabs: [...document.querySelectorAll('.doc-tab .doc-tab-title')].map((t) => t.textContent),
    errors: Number(document.querySelector('.statusbar span')?.textContent.replace(/\\D+/g, '') ?? -1),
  })`)) as { tabs: string[]; errors: number };
  await pressKey('W', ['control']);
  // Tables: "Add row" adds an empty row that stays until something is typed into it; deleted again.
  await clickOn('.pane-tab[data-pane="tables"]');
  await pause(300);
  const tableRows = `document.querySelectorAll('.grid-wrap table.grid tbody tr').length`;
  const rowsBefore = (await contents.executeJavaScript(tableRows)) as number;
  await clickOn('.grid-wrap > button.secondary');
  await pause(300);
  const rowsAfter = (await contents.executeJavaScript(tableRows)) as number;
  // Enter in a cell goes one down, as in a spreadsheet.
  await clickOn('.grid-wrap table.grid tbody tr:first-child input[data-cell="0:1"]');
  await pressKey('Enter');
  await pause(200);
  const tableEnterAt = (await contents.executeJavaScript(`(document.activeElement?.tagName ?? '') + ':' + (document.activeElement?.getAttribute('data-cell') ?? '')`)) as string;
  // Enter in the last row writes the cell and adds a row below, the cursor in it.
  await clickOn('.grid-wrap table.grid tbody tr:last-child td:nth-child(3) input');
  await typeText('7');
  await pressKey('Enter');
  await pause(300);
  const lastRowEnter = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.grid-wrap table.grid tbody tr')];
    const written = rows.at(-2)?.querySelector('td:nth-child(3) input')?.value;
    return { rows: rows.length, written, focused: document.activeElement === rows.at(-1)?.querySelector('td:nth-child(3) input') };
  })()`)) as { rows: number; written: string; focused: boolean };
  const tableEnter = tableEnterAt === 'INPUT:1:1' && lastRowEnter.rows === rowsAfter + 1 && lastRowEnter.written === '7' && lastRowEnter.focused;
  await clickOn('.grid-wrap table.grid tbody tr:last-child td:last-child button');
  await pause(300);
  await clickOn('.grid-wrap table.grid tbody tr:last-child td:last-child button');
  await pause(300);
  const rowsBack = (await contents.executeJavaScript(tableRows)) as number;
  await clickOn('.pane-tab[data-pane="details"]');
  const tableRowAdded = rowsBefore > 0 && rowsAfter === rowsBefore + 1 && rowsBack === rowsBefore;
  // The summary of checks: a click on a check opens its line; the right button moves the summary to the end and back.
  await clickOn('.summary-box tr[data-line]');
  await pause(300);
  const summaryOpens = ((await contents.executeJavaScript(`document.querySelector('textarea.row-editor')?.value ?? ''`)) as string).trimStart().startsWith('check');
  await pressKey('Escape');
  await clickOn('.summary-box', [], 'right');
  await clickMenu('Souhrn posudků na konci');
  await pause(400);
  const summaryAtEnd = (await contents.executeJavaScript(`(() => {
    const items = [...document.querySelectorAll('.layer-view.active .page-body > [data-item]')];
    return items.at(-1)?.classList.contains('summary-box') ?? false;
  })()`)) as boolean;
  await clickOn('.summary-box', [], 'right');
  await clickMenu('Souhrn posudků nahoře');
  await pause(400);
  // File > Properties: the book style centres the formulas and numbers them; set back as it was.
  const chooseStyle = async (style: string) => {
    await clickOn('.menubar-item:nth-child(1) > button');
    await clickMenu('Vlastnosti výpočtu');
    await pause(300);
    const order = ['compact', 'airy', 'book', 'columns'];
    const from = order.indexOf((await contents.executeJavaScript(`document.querySelector('.props-style').value`)) as string);
    // Focused, not opened: on a closed select an arrow changes the value (in an open list it only moves the mark).
    await contents.executeJavaScript(`document.querySelector('.props-style').focus()`);
    // Arrow by arrow until the select says it (a key may get lost while the dialog opens).
    for (let tries = 0; tries < 8; tries++) {
      const now = order.indexOf((await contents.executeJavaScript(`document.querySelector('.props-style').value`)) as string);
      if (now === order.indexOf(style)) break;
      await pressKey(order.indexOf(style) > now ? 'Down' : 'Up');
      // The value changes a moment later: read too soon, one more arrow would go past it.
      await pause(250);
    }
    // Arrows on a closed select change its value; Enter may close the dialog with it already.
    if ((await contents.executeJavaScript(`!!document.querySelector('.dialog-buttons button.default')`)) as boolean) await clickOn('.dialog-buttons button.default');
    await pause(400);
    return order[from]!;
  };
  const styleBefore = await chooseStyle('book');
  const bookStyle = (await contents.executeJavaScript(`!!document.querySelector('.layer-view.active .block.equation.book') && !!document.querySelector('.layer-view.active .eq-number')`)) as boolean;
  await takePicture(picture.replace(/[.]png$/, '-book.png'));
  // With columns: the sources on the left, the results and verdicts on the right, the columns named on the page.
  await chooseStyle('columns');
  const columnsStyle = (await contents.executeJavaScript(`(() => {
    const view = document.querySelector('.layer-view.active');
    return !!view.querySelector('.page-cols-head .cols-head') && !!view.querySelector('.cols .col-out .out-line') && !!view.querySelector('.cols .col-out .out-verdict') &&
      [...view.querySelectorAll('.cols .col-ref')].some((r) => r.textContent.trim() !== '');
  })()`)) as boolean;
  await takePicture(picture.replace(/[.]png$/, '-columns.png'));
  await chooseStyle(styleBefore);
  // Pages by sections: File > Properties, then Export to PDF; the printout lays out its pages (1.1, 2.1 …).
  const choosePages = async (wanted: 'sections' | 'continuous') => {
    await clickOn('.menubar-item:nth-child(1) > button');
    await clickMenu('Vlastnosti výpočtu');
    await pause(300);
    await contents.executeJavaScript(`document.querySelector('.props-pages').focus()`);
    for (let tries = 0; tries < 4 && (await contents.executeJavaScript(`document.querySelector('.props-pages').value`)) !== wanted; tries++) {
      await pressKey(wanted === 'sections' ? 'Down' : 'Up');
      await pause(250);
    }
    if ((await contents.executeJavaScript(`!!document.querySelector('.dialog-buttons button.default')`)) as boolean) await clickOn('.dialog-buttons button.default');
    await pause(400);
  };
  await choosePages('sections');
  const sectionFoot = (await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page-foot')].map((f) => f.textContent.trim())`)) as string[];
  await takePicture(picture.replace(/[.]png$/, '-sections.png'));
  smokePdf.path = picture.replace(/[.]png$/, '-sections.pdf');
  await clickOn('.menubar-item:nth-child(1) > button');
  await clickMenu('Export do PDF');
  for (let i = 0; i < 60 && !(smokePdf.pages && existsSync(smokePdf.path) && readFileSync(smokePdf.path).length > 0); i++) await pause(250);
  const sectionPdf = { pages: smokePdf.pages ?? [], bytes: existsSync(smokePdf.path) ? readFileSync(smokePdf.path).length : 0 };
  smokePdf.path = undefined;
  await choosePages('continuous');
  const sectionsOk =
    sectionFoot.some((f) => /^Strana 1\.1 \(/.test(f)) && sectionFoot.some((f) => /^Strana 2\.1 \(/.test(f)) &&
    sectionPdf.pages.some((f) => f.startsWith('Strana 1.1 (')) && sectionPdf.pages.some((f) => f.startsWith('Strana 2.1 (')) && sectionPdf.bytes > 1000;
  await writeFile(picture.replace(/[.]png$/, '-sections.json'), JSON.stringify({ sectionFoot, sectionPdf }, null, 1));
  // File > Properties: the result of a check said as VYHOVÍ, in the checks and the summary; set back.
  const chooseVerdict = async (key: 'Down' | 'Up') => {
    await clickOn('.menubar-item:nth-child(1) > button');
    await clickMenu('Vlastnosti výpočtu');
    await pause(300);
    await clickOn('.props-verdict');
    const wanted = key === 'Down' ? 'future' : 'present';
    for (let tries = 0; tries < 4 && (await contents.executeJavaScript(`document.querySelector('.props-verdict').value`)) !== wanted; tries++) await pressKey(key);
    if ((await contents.executeJavaScript(`!!document.querySelector('.dialog-buttons button.default')`)) as boolean) await clickOn('.dialog-buttons button.default');
    await pause(400);
  };
  await chooseVerdict('Down');
  const verdictFuture = (await contents.executeJavaScript(`(() => {
    const text = document.querySelector('.layer-view.active .pages')?.textContent ?? '';
    return text.includes('VYHOVÍ') && !text.includes('VYHOVUJE');
  })()`)) as boolean;
  await chooseVerdict('Up');
  const verdictBack = (await contents.executeJavaScript(`(document.querySelector('.layer-view.active .pages')?.textContent ?? '').includes('VYHOVUJE')`)) as boolean;
  // The head of every page: the date of the calculation on the right.
  const pageHead = (await contents.executeJavaScript(`document.querySelector('.layer-view.active .page-head-right')?.textContent ?? ''`)) as string;
  const summaryOk = /\d{1,2}\. \d{1,2}\. \d{4}/.test(pageHead) && bookStyle && columnsStyle && sectionsOk && verdictFuture && verdictBack && summaryOpens && summaryAtEnd && ((await contents.executeJavaScript(`document.querySelector('.layer-view.active .page-body > [data-item]')?.classList.contains('summary-box') ?? false`)) as boolean);
  const samplesOk =sampleTab.tabs.length === 2 && sampleTab.tabs[0] === 'Vzor – Posouzení nosníku N1' && sampleTab.tabs[1] === 'Vzor – Dimenzování kabelu a úbytek napětí' && sampleTab.errors === 0;
  await clickOn('.layer-tab.add'); // a menu of the kinds of layers
  const addKinds = (await contents.executeJavaScript(`document.querySelectorAll('.context-menu .menu-row').length`)) as number;
  await clickMenu('∑'); // auxiliary calculation
  await pressKey('A', ['control']);
  await typeText('Zatížení');
  await pressKey('Enter');
  await clickOn('.page .row');
  await typeText('q_d := 1,35·3,5 kN/m + 1,5·8 kN/m');
  // The deflection line of a beam: a differential equation, ″ from the Operators toolbar, its conditions on lines of its own.
  for (const line of ['q_b := 10 kN/m', 'L_b := 6 m', 'EI_b := 210 GPa·8360 cm^4', 'M_b(x) := q_b·x·(L_b - x)/2']) {
    await pressKey('Enter');
    await typeText(line);
  }
  await pressKey('Enter');
  await typeText('solve w_b(x): EI_b·w_b');
  await clickOn('.tool-button[title^="Druhá derivace"]');
  await typeText(' == -M_b(x) in 0 m .. L_b');
  for (const condition of ['    w_b(0 m) == 0 m', '    w_b(L_b) == 0 m']) {
    smokeWindow!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['shift'] });
    smokeWindow!.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers: ['shift'] });
    smokeWindow!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['shift'] });
    await pause(150);
    await typeText(condition);
  }
  await pressKey('Enter');
  await typeText('w_bs := w_b(L_b/2) | mm');
  await pause(400);
  const deflection = (await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].some((r) => r.textContent.replace(/\\s+/g, '').endsWith('=9,612mm'))`)) as boolean;

  await clickOn('.sheet-scroll'); // done editing

  await clickOn('.layer-tab[data-layer="main"]');
  const loadRow = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.row')].find((r) => r.textContent.includes('12') && r.textContent.includes('kN/m'))?.dataset.line`,
  )) as string | undefined;
  await clickOn(`.row[data-line="${loadRow}"]`);
  await pressKey('A', ['control']);
  await typeText('q := q_d');
  await clickOn('.sheet-scroll');
  // A row from a table, then a number of it clicked in the drop-down: the value with its unit (.column).
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-pick-last'`);
  await clickOn('#smoke-pick-last');
  await pause(300);
  await pressKey('End');
  await pressKey('Enter');
  await typeText('p_t := pick(Profily_IPE, "IPE 200")');
  // Closed by a click on the grey beside the page (in the middle of the sheet a row would open).
  const besideSheet = (await contents.executeJavaScript(`(() => { const p = document.querySelector('.layer-view.active .page').getBoundingClientRect(); return { x: Math.round(p.left - 30), y: Math.round(p.top + 100) }; })()`)) as { x: number; y: number };
  contents.sendInputEvent({ type: 'mouseDown', ...besideSheet, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', ...besideSheet, button: 'left', clickCount: 1 });
  await pause(500);
  // The new line: the last one by its number (not the profile chosen above).
  await contents.executeJavaScript(`(() => { const row = [...document.querySelectorAll('.layer-view.active .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1); row?.setAttribute('id', 'smoke-pick-row'); row?.querySelector('.pick-button')?.setAttribute('data-smoke-pick', ''); })()`);
  await clickOn('[data-smoke-pick]');
  await pause(300);
  await contents.executeJavaScript(`document.querySelector('.pick-list tr.current td.take')?.setAttribute('data-smoke-take', '')`);
  await clickOn('[data-smoke-take]');
  await pause(600);
  const pickTaken = (await contents.executeJavaScript(`(() => {
    // Drawn anew with its new text: found again as the last line by its number.
    const row = [...document.querySelectorAll('.layer-view.active .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1);
    const button = row?.querySelector('.pick-button');
    return { column: button?.querySelector('.pick-column')?.textContent ?? '', text: row?.textContent.replace(/\s+/g, '') ?? '' };
  })()`)) as { column: string; text: string };

  await clickOn('.layer-tab.add');
  await clickMenu('❝'); // sources
  await pressKey('Enter'); // default name
  // Written like in a word processor: "> " at the start of a line makes a citation.
  await clickOn('.layer-view.active .notes-word .ProseMirror');
  await typeText('> ČSN EN 1990, tab. A1.2(B)');
  const citations = (await contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .notes-word blockquote.citation').length`)) as number;
  // A cut-out picture pasted with Ctrl+V lands where the cursor is (here at the start), not at the end.
  const cutout = Buffer.alloc(80 * 40 * 4, 0xff);
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(nativeImage.createFromBitmap(cutout, { width: 80, height: 40 }).toPNG())], { type: 'image/png' }) })]);
  await pressKey('Home', ['control']);
  await pause(700);
  await pressKey('V', ['control']);
  await pause(800);
  const notesPicture = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view.active .word-text .ProseMirror > *')].filter((e) => e.querySelector('figure') || e.textContent !== '').map((e) => (e.querySelector('figure') ? 'FIGURE' : e.tagName) + (e.querySelector('img[src]') ? '+img' : '')).join(' ')`,
  )) as string;
  await takePicture(picture.replace(/\.png$/, '-notes.png'));
  // The picture in the sources: a corner dragged makes it narrower, the right button centres it.
  await clickOn('.layer-view.active .word-figure img');
  const notesHandle = (await contents.executeJavaScript(`(() => {
    const r = document.querySelector('.layer-view.active .word-figure.selected .picture-handle.se')?.getBoundingClientRect();
    return r && r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: document.querySelector('.layer-view.active .word-figure img').getBoundingClientRect().width } : undefined;
  })()`)) as { x: number; y: number; width: number } | undefined;
  let notesPlaced = '';
  if (notesHandle) {
    contents.sendInputEvent({ type: 'mouseMove', x: notesHandle.x, y: notesHandle.y });
    await pause(100);
    contents.sendInputEvent({ type: 'mouseDown', x: notesHandle.x, y: notesHandle.y, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 4; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: notesHandle.x - step * 10, y: notesHandle.y, button: 'left' } as Electron.MouseInputEvent);
      await pause(40);
    }
    contents.sendInputEvent({ type: 'mouseUp', x: notesHandle.x - 40, y: notesHandle.y, button: 'left', clickCount: 1 });
    await pause(300);
    await clickOn('.layer-view.active .word-figure img', [], 'right');
    await clickMenu('Na střed');
    await pause(300);
    notesPlaced = (await contents.executeJavaScript(`(() => {
      const figure = document.querySelector('.layer-view.active .word-figure');
      const img = figure.querySelector('img').getBoundingClientRect();
      const text = figure.closest('.ProseMirror').getBoundingClientRect();
      const centred = Math.abs(img.left + img.width / 2 - (text.left + text.width / 2)) < 6;
      return (img.width < ${notesHandle.width} - 20 ? 'narrower' : 'same') + (centred ? ' centred' : '');
    })()`)) as string;
    await takePicture(picture.replace(/\.png$/, '-notesplaced.png'));
  }

  // No AI is connected: the sheet has no AI notes, neither as a tab nor in View > Layers side by side.
  const aiTabWhileEmpty = (await contents.executeJavaScript(`!!document.querySelector('.layer-tab[data-layer="ai"]')`)) as boolean;
  await clickOn('.menubar-item:nth-child(3) > button');
  await clickMenu('Vrstvy vedle sebe');
  const aiTabAfterClose = (await contents.executeJavaScript(`[...document.querySelectorAll('.menu-panel .menu-row')].some((r) => r.textContent.includes('✦'))`)) as boolean;
  await pressKey('Escape');
  await pressKey('Escape');
  await clickOn('.layer-tab[data-layer="main"]');
  await takePicture(picture);
  const state = (await contents.executeJavaScript(`({
    tabs: document.querySelectorAll('.layer-tab:not(.add)').length,
    used: [...document.querySelectorAll('.layer-tab')].filter((t) => t.title.includes('list z ní čerpá')).length,
    errors: Number(document.querySelector('.statusbar span')?.textContent.replace(/\\D+/g, '') ?? -1),
    q: [...document.querySelectorAll('.row')].find((r) => r.textContent.includes('q_d'))?.textContent ?? '',
  })`)) as { tabs: number; used: number; errors: number; q: string };
  // Tables of a data layer: a narrow strip of names with icons for a new table and an import.
  await clickOn('.layer-tab[data-layer="data"]');
  const tableStrip = (await contents.executeJavaScript(
    `document.querySelectorAll('.layer-view.active .table-list .table-action').length === 2 && document.querySelector('.layer-view.active .table-list').getBoundingClientRect().height < 50`,
  )) as boolean;
  await takePicture(picture.replace(/[.]png$/, '-data.png'));
  await clickOn('.layer-tab[data-layer="main"]');

  // Side by side: Ctrl+click on the tab of the auxiliary calculation.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-tab')].find((t) => t.textContent.includes('Zatížení'))?.setAttribute('data-load', '')`);
  await clickOn('.layer-tab[data-load]', ['control']);
  await clickOn('.layer-view:nth-child(2) .page .row');
  const split = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view')].map((v) => v.dataset.layer + (v.classList.contains('active') ? '*' : '') + ':' + v.querySelectorAll('.page').length).join(' ')`,
  )) as string;
  await takePicture(picture.replace(/\.png$/, '-split.png'));

  // Work only in the layers: hide the printed sheet.
  await clickOn('.layer-tab[data-layer="main"]', [], 'right');
  await takePicture(picture.replace(/[.]png$/, '-tabmenu.png'));
  await clickMenu('Zobrazit');
  const mainHidden = (await contents.executeJavaScript(
    `!document.querySelector('.layer-view[data-layer="main"]') && !!document.querySelector('.layer-tab.hidden[data-layer="main"]') && document.querySelectorAll('.layer-view').length === 1`,
  )) as boolean;
  await takePicture(picture.replace(/\.png$/, '-nomain.png'));
  // Two layers side by side with the sheet hidden: open the last layer beside the one shown.
  await clickOn('.layer-tab[data-layer]:nth-last-child(2)', [], 'right');
  await clickMenu('Otevřít vedle');
  await pause(300);
  const twoLayers = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view')].map((v) => v.getAttribute('data-layer')).join(' ')`,
  )) as string;
  await takePicture(picture.replace(/\.png$/, '-twolayers.png'));

  // More calculations at once: a new one in its own tab, back to the first, Ctrl+Tab, Ctrl+W.
  await clickOn('.doc-tab-new');
  const second = (await contents.executeJavaScript(
    `[document.querySelectorAll('.doc-tab').length, document.querySelectorAll('.layer-tab').length, document.querySelector('.statusbar').textContent.includes('Posouzení') ? 1 : 0]`,
  )) as [number, number, number];
  await takePicture(picture.replace(/[.]png$/, '-docs.png'));
  await clickOn('.doc-tab:nth-child(1) .doc-tab-title');
  const firstKept = (await contents.executeJavaScript(
    `document.querySelectorAll('.layer-tab:not(.add):not(.hidden)').length === 3 && !!document.querySelector('.doc-tab:nth-child(1).active .doc-dirty')`,
  )) as boolean;
  await pressKey('Tab', ['control']);
  await pressKey('W', ['control']);
  const documents = (await contents.executeJavaScript(`document.querySelectorAll('.doc-tab').length`)) as number;

  // Another window, e.g. to compare two calculations: Ctrl+Shift+N.
  await pressKey('N', ['control', 'shift']);
  let other: BrowserWindow | undefined;
  for (let i = 0; i < 50 && !other; i++) {
    await pause(100);
    other = [...editors.values()].map((e) => e.window).find((w) => w !== smokeWindow && !w.webContents.isLoading());
  }
  await pause(500);
  const newWindow = other
    ? ((await other.webContents.executeJavaScript(
        `document.querySelectorAll('.doc-tab').length === 1 && !document.title.includes('Posouzení') && typeof window.kalketaDesktop === 'object'`,
      )) as boolean)
    : false;

  // A file is open in one window only: the second window has it, the first one asks for it twice.
  const smokeFile = process.env['KALKETA_SMOKE_FILE'];
  let oneCopy: boolean | undefined;
  if (smokeFile && other) {
    const selector = `.doc-tab[title=${JSON.stringify(smokeFile)}]`;
    const hasFile = (w: BrowserWindow) => w.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`) as Promise<boolean>;
    lastFocused = other;
    await sendOpen(smokeFile);
    await pause(800);
    lastFocused = smokeWindow;
    await sendOpen(smokeFile); // as by a double click in Explorer
    const viaRecent = await smokeWindow!.webContents.executeJavaScript(`window.kalketaDesktop.openPath(${JSON.stringify(smokeFile)})`);
    await pause(500);
    // The window and the tab are called by the file name.
    const named = other.getTitle().startsWith(basename(smokeFile)) &&
      ((await other.webContents.executeJavaScript(`document.querySelector('.doc-tab.active .doc-tab-title')?.textContent ?? ''`)) as string).startsWith(basename(smokeFile));
    oneCopy = (await hasFile(other)) && !(await hasFile(smokeWindow!)) && viaRecent === undefined && named;
  }
  other?.destroy();
  const multi = second[0] === 2 && second[1] === 0 && second[2] === 0 && firstKept && documents === 1 && newWindow && oneCopy !== false;

  // A user function typed like a person would: "=" after the head becomes ":=".
  await clickOn('.doc-tab-new');
  await clickOn('.page .row');
  await pressKey('End');
  await pressKey('Enter');
  // Units a new sheet knows without declaring anything: kWp, Kč, CZK.
  await typeText('P := 10 kWp');
  await pressKey('Enter');
  await typeText('100 Kč + 5 CZK =');
  await pressKey('Enter');
  await typeText('A_kruh(d) = π·d²/4');
  await pressKey('Enter');
  await typeText('A_kruh(20 mm) =');
  await pressKey('Enter');
  await typeText('solve x: x² + 2·x == 8 in 0 .. 10');
  for (const line of ['dimension Mena', 'unit CZK: Mena', 'unit EUR := 25 CZK', '100 EUR | CZK =', '230 V/((3 + 4j) Ω) =', 'CF := [-1000; 300; 400; 500]', 'payback(CF) =', '2026-09-29 + 30 d =', 'd_t := 20 mm', 'L_t := 500 mm', 'π·d_t²/4·L_t =', 'integral(x²; x: 0 .. 3) =', 'K_s := [4; -2 | -2; 4] kN/m', 'lsolve(K_s; [2; 0] kN) =']) {
    await pressKey('Enter');
    await typeText(line);
  }
  // Help on functions (F1): find hypot, click it into the line, finish the call.
  await pressKey('Enter');
  await typeText('c_h := ');
  await pressKey('F1');
  await pause(300);
  const listed = (await contents.executeJavaScript(`document.querySelectorAll('table.functions tr').length`)) as number;
  await typeText('hypot');
  await pause(200);
  await takePicture(picture.replace(/[.]png$/, '-help.png'));
  await clickOn('table.functions tr');
  await typeText('3 m; 4 m)');
  await pressKey('Enter');
  await typeText('c_h =');
  await clickOn('.sheet-scroll');
  await pause(300);
  const userFunction = (await contents.executeJavaScript(`({
    errors: Number(document.querySelector('.statusbar span')?.textContent.replace(/\\D+/g, '') ?? -1),
    rows: [...document.querySelectorAll('.page .row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean),
    // A new calculation is set in the compact (school) style: inputs one after another side by side.
    flowGroups: document.querySelectorAll('.page .flow-group').length,
    oneLine: document.querySelectorAll('.page .block.equation.compact .eq-flow').length,
  })`)) as { errors: number; rows: string[]; flowGroups: number; oneLine: number };
  await takePicture(picture.replace(/[.]png$/, '-function.png'));
  const functions = userFunction.errors === 0 && userFunction.rows.some((r) => r.includes('314,2'));
  const money = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=105Kč')) && userFunction.rows.some((r) => r.includes('10 kWp'));
  const solved = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('x=2')) && userFunction.flowGroups >= 1 && userFunction.oneLine > 5;
  const finance = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=2,6')) && userFunction.rows.some((r) => r.includes('29. 10. 2026'));
  const rod = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=157100mm³'));
  const calculus = userFunction.rows.some((r) => r.includes('∫') && r.replace(/\s+/g, '').endsWith('=9'));
  const matrices = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=[0,6667;0,3333]m')) && (await contents.executeJavaScript(`!!document.querySelector('.page mtable')`)) as boolean;
  const complex = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('(27,6−36,8j)A'));
  const ownUnits = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('100EUR=2500CZK'));
  const help = listed > 50 && userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('hypot(3m;4m)=5m'));

  // Derivations: the a=b button of the Functions toolbar starts a derive line; a right step is marked as checked, a wrong one is an error.
  // The last row by its number: a chart moved to the next page stands after it in the page, not in the sheet.
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  await clickOn('#smoke-last-row');
  await clickOn('.tool-button[title^="Odvození"]');
  await pause(300);
  await typeText('a·(b + c)');
  await pressKey('End');
  await typeText('a·b + a·c');
  await pressKey('Enter');
  await typeText('derive (a + b)^2 == a^2 + b^2');
  await clickOn('.sheet-scroll');
  await pause(400);
  const derivation = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')];
    const right = rows.find((r) => r.querySelector('.derived'));
    const wrong = rows.find((r) => r.textContent.includes('krok 1 neplatí'));
    return { checked: !!right, wrong: !!wrong && !wrong.querySelector('.derived') };
  })()`)) as { checked: boolean; wrong: boolean };
  await takePicture(picture.replace(/[.]png$/, '-derive.png'));
  const derivations = derivation.checked && derivation.wrong;

  // The ≔ button and Insert > Definition write := at the cursor of the open line; Ctrl+click and
  // Shift+click mark rows, Delete removes them.
  const rowsNow = `document.querySelectorAll('.layer-view.active .page .row').length`;
  const rowsBeforeDefs = (await contents.executeJavaScript(rowsNow)) as number;
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  await clickOn('#smoke-last-row');
  await pressKey('End');
  await pressKey('Enter');
  await typeText('k_d1');
  await clickOn('.tool-button[title^="Definice ≔"]');
  await typeText('2,345');
  await pressKey('Enter');
  await typeText('k_d2');
  await clickOn('.menubar-item:nth-child(4) > button');
  await clickMenu('Definice');
  await typeText('k_d1 + 1');
  // Text with an index from the _ button of the Operators toolbar: printed as in a formula.
  await pressKey('Enter');
  await typeText('"Mez kluzu σ');
  await clickOn('.tool-button[title="Vložit _"]');
  await typeText('Kt a p');
  await clickOn('.tool-button[title^="Vektor"]');
  await typeText('"');
  await clickOn('.sheet-scroll');
  await pause(400);
  const typedDefs = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].slice(-3);
    rows.forEach((r, i) => (r.id = 'smoke-def-' + i));
    return {
      rows: rows.map((r) => r.textContent.replace(/\\s+/g, '')),
      errors: rows.filter((r) => r.classList.contains('has-error')).length,
      indexed: !!rows[2]?.querySelector('p.text math msub') && !!rows[2]?.querySelector('p.text math mover'),
    };
  })()`)) as { rows: string[]; errors: number; indexed: boolean };
  // The right button on a result: two decimal places, here and wherever it is substituted.
  await clickOn('#smoke-def-1', [], 'right');
  await clickMenu('Výsledek na 2 desetinná');
  await pause(400);
  const formatted = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].slice(-3);
    rows.forEach((r, i) => (r.id = 'smoke-def-' + i));
    return rows[1]?.textContent.replace(/\\s+/g, '') ?? '';
  })()`)) as string;
  // The right button on text: italic.
  await clickOn('#smoke-def-2', [], 'right');
  await clickMenu('Kurzíva');
  await pause(400);
  const italicText = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].slice(-3);
    rows.forEach((r, i) => (r.id = 'smoke-def-' + i));
    return rows[2]?.querySelector('p.text')?.getAttribute('style') ?? '';
  })()`)) as string;
  // The right button on a heading: it starts a position (Pos. 1 before its title); taken back again.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].find((r) => r.querySelector('h2, h3, h4'))?.setAttribute('id', 'smoke-heading')`);
  await clickOn('#smoke-heading h2, #smoke-heading h3, #smoke-heading h4', [], 'right');
  await clickMenu('Začíná pozici');
  await pause(400);
  const positionShown = (await contents.executeJavaScript(`document.querySelector('.layer-view.active .page .position-head .position')?.textContent ?? ''`)) as string;
  await contents.executeJavaScript(`document.querySelector('.layer-view.active .page .position-head')?.closest('.row')?.setAttribute('id', 'smoke-heading')`);
  await clickOn('#smoke-heading .position-head', [], 'right');
  await clickMenu('Začíná pozici');
  await pause(400);
  const positionGone = (await contents.executeJavaScript(`!document.querySelector('.layer-view.active .page .position-head')`)) as boolean;
  // Two results marked, the right button on one of them: both get two significant digits.
  await clickOn('#smoke-def-0', ['control']);
  await clickOn('#smoke-def-1', ['control']);
  await clickOn('#smoke-def-1', [], 'right');
  await clickMenu('Výsledek na 1 desetinné');
  await pause(400);
  const bothFormatted = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].slice(-3);
    rows.forEach((r, i) => (r.id = 'smoke-def-' + i));
    return rows.slice(0, 2).map((r) => r.textContent.replace(/\\s+/g, ''));
  })()`)) as string[];
  // "Calculate on with the rounded value" on k_d1 (2,3): k_d2 shown in full is then 3,3, not 3,345.
  await pressKey('Escape');
  await clickOn('#smoke-def-0', [], 'right');
  await clickMenu('Počítat dále se zaokrouhlenou');
  await pause(400);
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].slice(-3).forEach((r, i) => (r.id = 'smoke-def-' + i))`);
  await clickOn('#smoke-def-1', [], 'right');
  await clickMenu('Výsledek: výchozí');
  await pause(400);
  const roundedOn = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].slice(-3);
    rows.forEach((r, i) => (r.id = 'smoke-def-' + i));
    return rows[1]?.textContent.replace(/\\s+/g, '') ?? '';
  })()`)) as string;
  // The right button: an equation number at the right of this line, (1); taken away again.
  await clickOn('#smoke-def-1', [], 'right');
  await clickMenu('Číslo rovnice vpravo');
  await pause(400);
  const equationNumber = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].slice(-3);
    rows.forEach((r, i) => (r.id = 'smoke-def-' + i));
    return rows[1]?.querySelector('.eq-number')?.textContent ?? '';
  })()`)) as string;
  await clickOn('#smoke-def-1', [], 'right');
  await clickMenu('Číslo rovnice vpravo');
  await pause(400);
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].slice(-3).forEach((r, i) => (r.id = 'smoke-def-' + i))`);
  // Dragged over the line numbers, the button held: the rows passed are marked; Esc clears them.
  const gutters = (await contents.executeJavaScript(`[0, 2].map((i) => {
    const g = document.querySelector('#smoke-def-' + i + ' .gutter');
    g.scrollIntoView({ block: 'center' });
    const r = g.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })`)) as { x: number; y: number }[];
  contents.sendInputEvent({ type: 'mouseDown', ...gutters[0]!, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 4; step++) {
    contents.sendInputEvent({ type: 'mouseMove', x: gutters[0]!.x, y: Math.round(gutters[0]!.y + ((gutters[1]!.y - gutters[0]!.y) * step) / 4), button: 'left' });
    await pause(50);
  }
  contents.sendInputEvent({ type: 'mouseUp', ...gutters[1]!, button: 'left', clickCount: 1 });
  await pause(200);
  const draggedRows = (await contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .page .row.marked').length`)) as number;
  await pressKey('Escape');
  // Ctrl+A outside a line marks every row of the sheet, never the text of the whole window.
  await pressKey('A', ['control']);
  await pause(300);
  const selectedAll = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')];
    const marked = rows.filter((r) => r.classList.contains('marked')).length;
    return { marked, rows: rows.length, windowText: (window.getSelection()?.toString() ?? '').length };
  })()`)) as { marked: number; rows: number; windowText: number };
  await pressKey('Escape');
  await clickOn('#smoke-def-0', ['control']);
  await clickOn('#smoke-def-2', ['shift']);
  const markedRows = (await contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .page .row.marked').length`)) as number;
  await pressKey('Delete');
  await pause(400);
  const rowsAfterDelete = (await contents.executeJavaScript(rowsNow)) as number;
  const definitionAtCursor =
    typedDefs.errors === 0 && typedDefs.rows[0]!.includes('≔2') && typedDefs.rows[1]!.includes('=3') && typedDefs.indexed && /=3,3[45]/.test(formatted) && bothFormatted[0]!.includes('2,3') && !bothFormatted[0]!.includes('2,34') && bothFormatted[1]!.includes('=3,3') && !bothFormatted[1]!.includes('3,34') && roundedOn.endsWith('=3,3') && equationNumber === '(1)' && positionShown === 'Pos. 1' && positionGone && italicText.includes('italic') && draggedRows === 3 && selectedAll.marked > 10 && selectedAll.windowText === 0 && markedRows === 3 && rowsAfterDelete === rowsBeforeDefs;

  // solve without an interval: the unknown is expressed by a formula, its unit comes from it;
  // the right button puts the formula in as a definition.
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  await clickOn('#smoke-last-row');
  await pressKey('End');
  for (const line of ['r_s := roots(x^2 - 5·x + 6, x)', 'x_m := maximize(6·x·(4 - x), x: 0 .. 4)', 'S_n := 23.53 mm²', 'solve d_n: S_n <= π·d_n²/4', 'M_s := 37.5 kN·m', 'q_s := 12 kN/m', 'solve L_s: M_s == q_s·L_s²/8']) {
    await pressKey('Enter');
    await typeText(line);
  }
  // A rounded result: ≐ from the Operators toolbar (a key cannot type it).
  await pressKey('Enter');
  await typeText('d_r := sqrt(4·S_n/π) ');
  await clickOn('.tool-button[title^="Rovná se po zaokrouhlení"]');
  await typeText(' 5,5 mm');
  // A table of measured points in the sheet (its rows by Shift+Enter), a line fitted through them, used.
  await pressKey('Enter');
  await typeText('table P_s:');
  for (const row of ['    | t [s] | y [m] |', '    | 0 | 1 |', '    | 1 | 3 |', '    | 2 | 5 |']) {
    // Shift+Enter as the keyboard sends it: the key and the character of a new line.
    smokeWindow!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['shift'] });
    smokeWindow!.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers: ['shift'] });
    smokeWindow!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['shift'] });
    await pause(150);
    await typeText(row);
  }
  for (const line of ['f_s := fit(P_s.y; x: P_s.t)', 'y_3 := f_s(3 s)']) {
    await pressKey('Enter');
    await typeText(line);
  }
  // A load recapitulation: a column calculated from its formula, a row of totals (Σ), the total used.
  await pressKey('Enter');
  await typeText('γ_G := 1,35');
  await pressKey('Enter');
  await typeText('table R_z:');
  for (const row of ['    | polozka | h [mm] | ρ [kN/m³] | g_k [kN/m²] = h·ρ | g_d [kN/m²] = g_k·γ_G |', '    | dlazba | 10 | 22 | | |', '    | beton | 150 | 25 | | |', '    | Celkem | | | Σ | Σ |']) {
    smokeWindow!.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['shift'] });
    smokeWindow!.webContents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers: ['shift'] });
    smokeWindow!.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['shift'] });
    await pause(150);
    // The header at a person's pace: keys faster than anyone types, right after the formula
    // turns valid, run into React's limit of nested updates (error #185) and lose the ·.
    if (row.includes('h·ρ')) {
      for (const ch of row) {
        contents.sendInputEvent({ type: 'char', keyCode: ch });
        await pause(120);
      }
      continue;
    }
    await typeText(row);
  }
  await pressKey('Enter');
  await typeText('g_z := sum(R_z.g_d)');
  // Cells: a text, Tab, a definition beside it on one row.
  await pressKey('Enter');
  await typeText('"Síla na konci"');
  await pressKey('Tab');
  await pause(300);
  await typeText('F_c := 1600 N');
  // A text written as in a word processor: the quotes and marks out of sight, a bold word by Ctrl+B,
  // the font from the Format menu, Ctrl+E to the middle; the quote typed at the end by habit is not doubled.
  await pressKey('Enter');
  await typeText('"Koeficient ');
  await pressKey('B', ['control']);
  await typeText('dynamiky');
  await pressKey('B', ['control']);
  await typeText(' namáhání"');
  // The last word marked by Shift+arrows gets a colour of its own; the rest of the line keeps its own.
  for (let i = 0; i < 'namáhání'.length; i++) await pressKey('Left', ['shift']);
  await clickOn('.menubar-item:nth-child(5) > button');
  await clickMenu('Barva');
  await clickMenu('červená');
  await pause(300);
  const wordColored = (await contents.executeJavaScript(`(() => {
    const el = document.querySelector('[data-text-editor]');
    const spans = [...(el?.querySelectorAll('[data-color]') ?? [])];
    return spans.length === 1 && spans[0].dataset.color === 'red' && spans[0].textContent === 'namáhání' && !el.style.color && document.getSelection().toString() === 'namáhání';
  })()`)) as boolean;
  await pressKey('End');
  await clickOn('.menubar-item:nth-child(5) > button');
  await clickMenu('Písmo');
  await clickMenu('patkové');
  await pressKey('E', ['control']);
  await pause(400);
  const wordText = (await contents.executeJavaScript(`(() => {
    const el = document.querySelector('[data-text-editor]');
    return { focused: document.activeElement === el, shown: el?.textContent ?? '', bold: el?.querySelector('b')?.textContent ?? '', font: el?.style.fontFamily ?? '', align: el?.style.textAlign ?? '', pane: !!document.querySelector('[data-text-properties]') };
  })()`)) as { focused: boolean; shown: string; bold: string; font: string; align: string; pane: boolean };
  // The text of a cell marked by a drag of the mouse from its first letter to just past its last: all of it.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .cells-group .row')].find((r) => r.textContent.includes('Síla na konci')).id = 'smoke-cell-text'`);
  await clickOn('#smoke-cell-text p.text');
  await pause(300);
  const cellWords = (await contents.executeJavaScript(`(() => {
    const el = document.querySelector('[data-text-editor]');
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x0: Math.round(r.left + 1), x1: Math.round(r.right + 2), y: Math.round(r.top + r.height / 2) };
  })()`)) as { x0: number; x1: number; y: number };
  contents.sendInputEvent({ type: 'mouseDown', x: cellWords.x0, y: cellWords.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 8; step++) contents.sendInputEvent({ type: 'mouseMove', x: Math.round(cellWords.x0 + ((cellWords.x1 - cellWords.x0) * step) / 8), y: cellWords.y, button: 'left' });
  contents.sendInputEvent({ type: 'mouseUp', x: cellWords.x1, y: cellWords.y, button: 'left', clickCount: 1 });
  await pause(200);
  const cellMarked = (await contents.executeJavaScript(`document.getSelection().toString()`)) as string;
  // A font of the system by its name, from the Format menu.
  await clickOn('.menubar-item:nth-child(5) > button');
  await clickMenu('Písmo');
  await clickMenu('Arial');
  await pause(300);
  const cellFont = (await contents.executeJavaScript(`document.querySelector('[data-text-editor]')?.style.fontFamily ?? ''`)) as string;
  // A cell of text goes with the key that deletes a line, from inside its text: the row keeps its other cells.
  await pressKey('End');
  await pressKey('Tab');
  await pause(300);
  await typeText('"Pomocná buňka"');
  await pause(300);
  const cellsOfRow = `[...document.querySelectorAll('.layer-view.active .page .cells-group')].find((g) => g.textContent.includes('Síla na konci'))?.querySelectorAll(':scope > .cell').length ?? 0`;
  const cellsBefore = (await contents.executeJavaScript(cellsOfRow)) as number;
  await pressKey('K', ['control', 'shift']);
  await pause(400);
  const cellDeleted = cellsBefore === 3 && (await contents.executeJavaScript(cellsOfRow)) === 2 && !(await contents.executeJavaScript(`document.querySelector('.layer-view.active .page').textContent.includes('Pomocná buňka')`));
  // A click on the grey beside the page closes the line (the middle of the view may be a row of the second page).
  const besidePage = (await contents.executeJavaScript(`(() => { const p = document.querySelector('.layer-view.active .page').getBoundingClientRect(); return { x: Math.round(p.left - 30), y: Math.round(p.top + 100) }; })()`)) as { x: number; y: number };
  contents.sendInputEvent({ type: 'mouseDown', ...besidePage, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', ...besidePage, button: 'left', clickCount: 1 });
  await pause(400);
  await takePicture(picture.replace(/[.]png$/, '-roots.png'));
  // Closed, the text prints as edited: the bold word, the serif font, in the middle, and no error.
  const wordPrinted = (await contents.executeJavaScript(`(() => {
    const p = [...document.querySelectorAll('.layer-view.active .page p.text')].find((e) => e.textContent.includes('Koeficient'));
    return !!p && p.textContent.trim() === 'Koeficient dynamiky namáhání' && /Cambria/.test(p.getAttribute('style') ?? '') && /center/.test(p.getAttribute('style') ?? '') && !/color/.test(p.getAttribute('style') ?? '') && (p.querySelector('span[style*="color"]')?.textContent ?? '') === 'namáhání' && (p.querySelector('b, strong')?.textContent ?? '') === 'dynamiky' && !p.closest('.row').classList.contains('has-error');
  })()`)) as boolean;
  // Roots and extremes: r_s = [2; 3], x_m = 2; the bound of an inequality.
  const rootsAndExtremes = (await contents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.layer-view.active .page .row')].map((r) => r.textContent.replace(/\\s+/g, ''));
    // An inequality: S ≤ π·d²/4 ⇒ d ≥ √(4·S/π) = 5,474 mm (from S = 23,53 mm²).
    const inequality = rows.some((r) => r.includes('⇒') && r.includes('≥') && r.endsWith('=5,474mm'));
    // The table typed in the sheet shows as a table; the line fitted through it gives y(3 s) = 7 m.
    const measured = !!document.querySelector('.layer-view.active .page table.data-table') && rows.some((r) => r.includes('R2') && r.includes('=1')) && rows.some((r) => r.includes('y3≔') && r.endsWith('=7m'));
    // A rounded result of a derivation: set after ≐, the step holds.
    const recap = [...document.querySelectorAll('.layer-view.active .page .datatable tr.total')].some((r) => r.textContent.replace(/\\s+/g, '').includes('Celkem3,975,36')) && [...document.querySelectorAll('.layer-view.active .page .row')].some((r) => r.textContent.replace(/\\s+/g, '').includes('5,36kN/m²'));
    const rounded = [...document.querySelectorAll('.layer-view.active .page .row')].some((r) => r.textContent.replace(/\\s+/g, '').includes('≐5,5mm') && !r.classList.contains('has-error'));
    const cells = [...document.querySelectorAll('.layer-view.active .page .cells-group')].some((g) => g.querySelectorAll(':scope > .cell').length === 2 && g.textContent.includes('Síla na konci') && g.textContent.replace(/\\s+/g, '').includes('1600N'));
    // The text and the formula on one baseline: the bottoms of their letters level (no step).
    const level = (() => {
      const group = [...document.querySelectorAll('.layer-view.active .page .cells-group')].find((g) => g.textContent.includes('Síla na konci'));
      const text = group?.querySelector('p.text');
      const letter = group?.querySelector('math mi');
      if (!text || !letter) return false;
      const range = document.createRange();
      range.selectNodeContents(text);
      const t = range.getBoundingClientRect();
      const m = letter.getBoundingClientRect();
      return Math.abs(t.bottom - m.bottom) < Math.max(3, t.height * 0.3);
    })();
    return level && cells && recap && rounded && measured && inequality && rows.some((r) => r.includes('roots') && r.endsWith('=[2;3]')) && rows.some((r) => r.includes('argmax') && r.endsWith('=2'));
  })()`)) as boolean;
  // A click on the table in the sheet opens it as a grid; Enter in its last row adds one; Esc closes it.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].find((r) => r.querySelector('table.data-table')).id = 'smoke-table-row'`);
  await clickOn('#smoke-table-row');
  await pause(300);
  const gridRows = `document.querySelectorAll('.sheet-table-grid table.grid tr:not(.column-tools)').length`;
  const gridBefore = (await contents.executeJavaScript(gridRows)) as number;
  await clickOn('.sheet-table-grid table.grid tr:nth-last-child(2) input[data-cell$=":0"]');
  await pressKey('Enter');
  await pause(300);
  const sheetGrid = {
    before: gridBefore,
    after: (await contents.executeJavaScript(gridRows)) as number,
    focused: (await contents.executeJavaScript(`document.activeElement?.getAttribute('data-cell') ?? ''`)) as string,
  };
  await pressKey('Escape');
  await pause(300);
  const sheetGridOk = sheetGrid.before === 4 && sheetGrid.after === 5 && sheetGrid.focused === '4:0' && !(await contents.executeJavaScript(`!!document.querySelector('.sheet-table-grid')`));
  const solveRow =`[...document.querySelectorAll('.layer-view.active .page .row')].find((r) => r.textContent.includes('L_s') || r.textContent.includes('Ls'))`;
  // The root is set as MathML (msqrt): the text has no √ in it.
  const expressed = (await contents.executeJavaScript(`(() => { const r = ${solveRow}; return r ? (r.querySelector('msqrt') ? '√' : '') + r.textContent.replace(/\\s+/g, '') : ''; })()`)) as string;
  await contents.executeJavaScript(`(${solveRow}).id = 'smoke-solve-row'`);
  await clickOn('#smoke-solve-row', [], 'right');
  await clickMenu('Vložit vzorec jako definici');
  await pause(400);
  const defined = (await contents.executeJavaScript(`(() => {
    const r = [...document.querySelectorAll('.layer-view.active .page .row')].find((row) => row.textContent.includes('vyjádřeno z'));
    return { text: r ? (r.querySelector('msqrt') ? '√' : '') + r.textContent.replace(/\\s+/g, '') : '', errors: Number(document.querySelector('.statusbar span')?.textContent.replace(/\\D+/g, '') ?? -1) };
  })()`)) as { text: string; errors: number };
  await takePicture(picture.replace(/[.]png$/, '-solveformula.png'));
  // The right button on a solve line also sets how its result is shown: d_n to two decimal places.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].find((r) => r.textContent.includes('⇒')).id = 'smoke-solve-d'`);
  await clickOn('#smoke-solve-d', [], 'right');
  await clickMenu('Výsledek na 2 desetinná');
  await pause(400);
  const solveFormatted = (await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].find((r) => r.textContent.includes('⇒'))?.textContent.replace(/\\s+/g, '') ?? ''`)) as string;
  const solvedByFormula =
    expressed.startsWith('√') && expressed.includes('=5m') && defined.text.startsWith('√') && defined.text.includes('=5m') && !defined.text.includes('solve') && solveFormatted.endsWith('=5,47mm');

  // Charts: Insert > Chart plots the last function of the sheet; the pointer over it reads the values.
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  await clickOn('#smoke-last-row');
  await pressKey('End');
  await pressKey('Enter');
  await typeText('M_t(x) = 6·x·(4 - x)');
  await clickOn('.menubar-item:nth-child(4) > button');
  await clickMenu('Graf');
  await clickOn('.sheet-scroll');
  await pause(500);
  const chartBox = (await contents.executeJavaScript(`(() => {
    const svg = document.querySelector('.layer-view.active .block.chart svg');
    svg?.scrollIntoView({ block: 'center' });
    const r = svg?.getBoundingClientRect();
    return r ? { x: Math.round(r.left + r.width * 0.55), y: Math.round(r.top + r.height * 0.5), paths: svg.querySelectorAll('path').length } : undefined;
  })()`)) as { x: number; y: number; paths: number } | undefined;
  let chartTip = '';
  if (chartBox) {
    await pause(200);
    for (let step = 0; step < 4; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: chartBox.x - 12 + step * 4, y: chartBox.y });
      await pause(60);
    }
    // The hidden window handles pointer moves when it paints.
    await takePicture(picture.replace(/[.]png$/, '-chart.png'));
    await pause(200);
    chartTip = (await contents.executeJavaScript(`[...document.querySelectorAll('.chart-tooltip div')].map((d) => d.textContent).join(' | ')`)) as string;
    await takePicture(picture.replace(/[.]png$/, '-chart.png'));
  }
  // Placed as a picture, the way a person does it: a click on the chart (its line still open from Insert > Chart)
  // selects it with a frame, a corner handle narrows it, the mouse moves it freely; then back to full width.
  let chartPlaced = false;
  let chartFramed = false;
  let chartSteps = "";
  if (chartBox) {
    await clickOn('.layer-view.active .block.chart svg');
    await pause(400);
    chartFramed = (await contents.executeJavaScript(`(() => {
      const handle = document.querySelector('.layer-view.active .row.selected .chart-view .picture-handle.se');
      return !!handle && getComputedStyle(handle).display !== 'none' && !document.querySelector('.layer-view.active .row.editing');
    })()`)) as boolean;
    const corner = (await contents.executeJavaScript(`(() => {
      const handle = document.querySelector('.layer-view.active .row.selected .chart-view .picture-handle.se');
      const h = handle.getBoundingClientRect();
      const b = handle.closest('.page-body').getBoundingClientRect();
      return { x: Math.round(h.left + h.width / 2), y: Math.round(h.top + h.height / 2), tx: Math.round(b.left + b.width * 0.7) };
    })()`)) as { x: number; y: number; tx: number };
    contents.sendInputEvent({ type: 'mouseDown', x: corner.x, y: corner.y, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 6; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: Math.round(corner.x + ((corner.tx - corner.x) * step) / 6), y: corner.y, button: 'left' } as Electron.MouseInputEvent);
      await pause(40);
    }
    await takePicture(picture.replace(/[.]png$/, '-chartresize.png'));
    contents.sendInputEvent({ type: 'mouseUp', x: corner.tx, y: corner.y, button: 'left', clickCount: 1 });
    await pause(600);
    // The bottom edge: the height alone, the width stays (the chart keeps its ratio=… on its line).
    const bottom = (await contents.executeJavaScript(`(() => {
      const h = document.querySelector('.layer-view.active .row.selected .chart-view .picture-handle.edge.s');
      const svg = document.querySelector('.layer-view.active .block.chart svg').getBoundingClientRect();
      if (!h) return undefined;
      const r = h.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), ratio: svg.height / svg.width, width: svg.width };
    })()`)) as { x: number; y: number; ratio: number; width: number } | undefined;
    let chartTaller = false;
    if (bottom) {
      contents.sendInputEvent({ type: 'mouseMove', x: bottom.x, y: bottom.y });
      await pause(100);
      contents.sendInputEvent({ type: 'mouseDown', x: bottom.x, y: bottom.y, button: 'left', clickCount: 1 });
      for (let step = 1; step <= 6; step++) {
        contents.sendInputEvent({ type: 'mouseMove', x: bottom.x, y: bottom.y + step * 12, button: 'left' } as Electron.MouseInputEvent);
        await pause(40);
      }
      await takePicture(picture.replace(/[.]png$/, '-chartheight.png'));
      contents.sendInputEvent({ type: 'mouseUp', x: bottom.x, y: bottom.y + 72, button: 'left', clickCount: 1 });
      await pause(700);
      const after = (await contents.executeJavaScript(`(() => { const svg = document.querySelector('.layer-view.active .block.chart svg').getBoundingClientRect(); return { ratio: svg.height / svg.width, width: svg.width }; })()`)) as { ratio: number; width: number };
      chartTaller = after.ratio > bottom.ratio + 0.05 && Math.abs(after.width - bottom.width) < 3;
    }
    const drag = (await contents.executeJavaScript(`(() => {
      const chart = document.querySelector('.layer-view.active .block.chart svg');
      const svg = chart.getBoundingClientRect();
      const b = chart.closest('.page-body').getBoundingClientRect();
      return { x: Math.round(svg.left + svg.width / 2), y: Math.round(svg.top + svg.height / 2), tx: Math.round(b.left + b.width * 0.1 + svg.width / 2), ty: Math.round(svg.top + svg.height / 2 + 30) };
    })()`)) as { x: number; y: number; tx: number; ty: number };
    contents.sendInputEvent({ type: 'mouseDown', x: drag.x, y: drag.y, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 8; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: Math.round(drag.x + ((drag.tx - drag.x) * step) / 8), y: Math.round(drag.y + ((drag.ty - drag.y) * step) / 8), button: 'left' } as Electron.MouseInputEvent);
      await pause(40);
    }
    await takePicture(picture.replace(/[.]png$/, '-chartdrag.png'));
    contents.sendInputEvent({ type: 'mouseUp', x: drag.tx, y: drag.ty, button: 'left', clickCount: 1 });
    await pause(600);
    await takePicture(picture.replace(/[.]png$/, '-chartplaced.png'));
    const placed = (await contents.executeJavaScript(`(() => {
      const row = document.querySelector('.layer-view.active .row.wrap-left');
      const b = (row ?? document).querySelector('svg')?.closest('.page-body')?.getBoundingClientRect() ?? document.querySelector('.layer-view.active .page-body').getBoundingClientRect();
      const r = row?.getBoundingClientRect();
      return !!row?.querySelector('.block.chart svg') && !!r && r.left - b.left > b.width * 0.05 && r.width < b.width * 0.6 && !!document.querySelector('.layer-view.active .wrap-stop');
    })()`)) as boolean && chartFramed && chartTaller;
    await clickOn('.layer-view.active .block.chart svg', [], 'right');
    await clickMenu('Obtékání podle umístění');
    await pause(400);
    await clickOn('.layer-view.active .block.chart svg', [], 'right');
    await clickMenu('Šířka');
    await clickMenu('Celá šířka');
    await takePicture(picture.replace(/[.]png$/, '-chartrestored.png'));
    await pause(400);
    const restored = (await contents.executeJavaScript(`(() => {
      const chart = document.querySelector('.layer-view.active .block.chart');
      const fig = chart?.getBoundingClientRect();
      const b = (chart?.closest('.page-body') ?? document.querySelector('.layer-view.active .page-body')).getBoundingClientRect();
      return !!fig && fig.width > b.width * 0.8 && !document.querySelector('.layer-view.active .row.wrap-left, .layer-view.active .row.wrap-right');
    })()`)) as boolean;
    chartPlaced = placed && restored;
    chartSteps = `framed=${chartFramed} placed=${placed} restored=${restored}`;
  }
  const charts = !!chartBox && chartBox.paths > 0 && /^x = [\d,]+ \| Mt\(x\) = /.test(chartTip) && chartPlaced;

  // The Functions toolbar: ∫ writes the integral with the cursor inside, the user types the integrand.
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  // The chart line may still be open (the click beside it landed on the chart): go on from it.
  const chartOpen = (await contents.executeJavaScript(`!!document.querySelector('textarea.row-editor')`)) as boolean;
  await clickOn(chartOpen ? 'textarea.row-editor' : '#smoke-last-row');
  await pause(300);
  await pressKey('End');
  await pressKey('Enter');
  await pause(200);
  await clickOn('.tool-button[title^="Integrál"]');
  await typeText('x²');
  const templateLine = (await contents.executeJavaScript(`document.querySelector('textarea.row-editor')?.value ?? ''`)) as string;
  await clickOn('.sheet-scroll');
  await pause(400);
  const templateRows = (await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].map((r) => r.textContent.replace(/\\s+/g, ''))`)) as string[];
  const functionBar = templateLine === 'integral(x²; x: 0 .. 1)' && templateRows.some((r) => r.includes('∫') && r.endsWith('=0,3333'));

  // Revisions: File > Revisions freezes A; a new line makes a draft; the comparison and the footer say so.
  await clickOn('.menubar-item:nth-child(1) > button');
  await clickMenu('Revize…');
  await pause(300);
  await clickOn('.rev-note');
  await typeText('k odevzdání');
  await clickOn('.rev-freeze-button');
  // The fingerprint is computed a moment after a change; the hidden window runs timers slowly.
  await pause(1500);
  await takePicture(picture.replace(/[.]png$/, '-revisions.png'));
  const frozen = (await contents.executeJavaScript(`({
    rows: document.querySelectorAll('.rev-list tbody tr').length,
    hash: document.querySelector('.rev-list .rev-hash')?.textContent ?? '',
    state: document.querySelector('.rev-state')?.textContent ?? '',
  })`)) as { rows: number; hash: string; state: string };
  await clickOn('.rev-verify input');
  await typeText(frozen.hash);
  await pause(200);
  const verifiedText = (await contents.executeJavaScript(`document.querySelector('.rev-verified')?.textContent ?? ''`)) as string;
  await pressKey('Escape');
  await pause(300);
  const statusAfterFreeze = (await contents.executeJavaScript(`document.querySelector('.status-revision')?.textContent ?? ''`)) as string;
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  const rowOpen = (await contents.executeJavaScript(`!!document.querySelector('textarea.row-editor')`)) as boolean;
  await clickOn(rowOpen ? 'textarea.row-editor' : '#smoke-last-row');
  await pause(300);
  await pressKey('End');
  await pressKey('Enter');
  await typeText('z_r := 7 kN');
  await clickOn('.statusbar');
  await pause(1500);
  await takePicture(picture.replace(/[.]png$/, '-revdraft.png'));
  const statusDraft = (await contents.executeJavaScript(`document.querySelector('.status-revision')?.textContent ?? ''`)) as string;
  const footerDraft = (await contents.executeJavaScript(`document.querySelector('.layer-view.active .page-foot-left')?.textContent ?? ''`)) as string;
  await clickOn('.status-revision');
  await pause(300);
  await clickOn('.rev-compare-button');
  await pause(600);
  const comparedText = (await contents.executeJavaScript(`document.querySelector('.rev-comparison')?.textContent ?? ''`)) as string;
  await takePicture(picture.replace(/[.]png$/, '-revisions.png'));
  await takePicture(picture.replace(/[.]png$/, '-revisions.png'));
  await pressKey('Escape');

  // Roots from the Operators toolbar: ∛ as a prefix, the n-th root as a template with the cursor inside.
  await contents.executeJavaScript(`document.querySelectorAll('#smoke-last-row').forEach((e) => e.removeAttribute('id')); [...document.querySelectorAll('.layer-view.active .page .row[data-line]')].sort((a, b) => Number(a.dataset.line) - Number(b.dataset.line)).at(-1).id = 'smoke-last-row'`);
  const lineOpen = (await contents.executeJavaScript(`!!document.querySelector('textarea.row-editor')`)) as boolean;
  await clickOn(lineOpen ? 'textarea.row-editor' : '#smoke-last-row');
  await pause(300);
  await pressKey('End');
  await pressKey('Enter');
  await clickOn('.tool-button[title="Vložit ∛"]');
  await typeText('27 =');
  const cubeLine = (await contents.executeJavaScript(`document.querySelector('textarea.row-editor')?.value ?? ''`)) as string;
  await pressKey('Enter');
  await clickOn('.tool-button[title^="n-tá odmocnina"]');
  await typeText('16');
  await pressKey('End');
  await pressKey('Backspace');
  await pressKey('Backspace');
  await typeText('4) =');
  const rootLine = (await contents.executeJavaScript(`document.querySelector('textarea.row-editor')?.value ?? ''`)) as string;
  await clickOn('.statusbar');
  await pause(500);
  await takePicture(picture.replace(/[.]png$/, '-roots.png'));
  const rootRows = (await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].map((r) => r.textContent.replace(/\\s+/g, ''))`)) as string[];
  const roots = cubeLine === '∛27 =' && rootLine === 'root(16; 4) =' && rootRows.some((r) => r.endsWith('=3') && r.includes('27')) && rootRows.some((r) => r.endsWith('=2') && r.includes('16'));
  // Operators and functions show drawn icons; the condition and solve stay as text.
  const toolIcons = (await contents.executeJavaScript(`(() => {
    const button = (title) => document.querySelector('.tool-button[title^=' + JSON.stringify(title) + ']');
    const drawn = (title) => !!button(title)?.querySelector('svg.icon');
    return ['Vložit √', 'Vložit ∛', 'n-tá odmocnina', 'Vložit ²', 'Obecná mocnina', 'Vložit ÷', 'Integrál'].every(drawn) &&
      !drawn('Podmíněná hodnota') && button('Podmíněná hodnota')?.textContent === 'if' && !drawn('Řešení rovnice');
  })()`)) as boolean;

  const revisions =
    frozen.rows === 1 &&
    /^[0-9a-f]{4} [0-9a-f]{4}$/.test(frozen.hash) &&
    frozen.state.includes('revizi A') &&
    verifiedText.includes('revizi A') &&
    statusAfterFreeze === 'Revize A' &&
    statusDraft === 'Revize A + změny' &&
    footerDraft.startsWith('Rozpracováno po revizi A · otisk ') &&
    comparedText.includes('z_r := 7 kN');

  // Pictures: a picture on the clipboard, Ctrl+V in the sheet (real keys).
  const bitmap = Buffer.alloc(240 * 120 * 4);
  for (let p = 0; p < 240 * 120; p++) bitmap.writeUInt32LE(p % 240 < 120 ? 0xff3060c0 : 0xffe0a020, p * 4);
  const png = nativeImage.createFromBitmap(bitmap, { width: 240, height: 120 }).toPNG();
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
  await clickOn('.page .row[data-line="3"]');
  await pressKey('V', ['control']);
  await pause(800);
  await clickOn('.sheet-scroll');
  await pause(300);
  const pasted = (await contents.executeJavaScript(`({
    img: !!document.querySelector('.layer-view.active .picture img[src^="data:image/png"]'),
    line: [...document.querySelectorAll('.layer-view.active .row')].find((r) => r.querySelector('.picture'))?.dataset.line ?? '',
  })`)) as { img: boolean; line: string };
  // Dragging the corner handle with the mouse makes the picture wider.
  await clickOn(`.layer-view.active .row[data-line="${pasted.line}"] figure`);
  const handle = (await contents.executeJavaScript(`(() => {
    const row = document.querySelector('.layer-view.active .row[data-line="${pasted.line}"]');
    const figure = row?.querySelector('figure');
    if (!row || !figure) return undefined;
    row.scrollIntoView({ block: 'center' });
    const r = row.querySelector('.picture-handle.se').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2 - 2), y: Math.round(r.top + r.height / 2 - 2), width: figure.getBoundingClientRect().width };
  })()`)) as { x: number; y: number; width: number } | undefined;
  let resized = false;
  if (handle) {
    contents.sendInputEvent({ type: 'mouseMove', x: handle.x - 20, y: handle.y - 20 });
    await pause(150);
    contents.sendInputEvent({ type: 'mouseDown', x: handle.x + 2, y: handle.y + 2, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 5; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: handle.x + 2 + step * 12, y: handle.y + 2, button: 'left' } as Electron.MouseInputEvent);
      await pause(40);
    }
    await takePicture(picture.replace(/[.]png$/, '-picture.png'));
    contents.sendInputEvent({ type: 'mouseUp', x: handle.x + 62, y: handle.y + 2, button: 'left', clickCount: 1 });
    await pause(400);
    const after = (await contents.executeJavaScript(
      `document.querySelector('.layer-view.active .row[data-line="${pasted.line}"] figure')?.getBoundingClientRect().width ?? 0`,
    )) as number;
    resized = after > handle.width + 40;
  }
  // Clicking the picture offers its menu: width 100 % and a caption, chosen with the mouse and typed.
  await clickOn(`.layer-view.active .row[data-line="${pasted.line}"] figure img`);
  const menuShown = (await contents.executeJavaScript(`document.querySelectorAll('.context-menu .menu-row').length`)) as number;
  await takePicture(picture.replace(/[.]png$/, '-picturemenu.png'));
  await clickMenu('Šířka');
  await clickMenu('100 %');
  await pause(300);
  await clickOn(`.layer-view.active .row[data-line="${pasted.line}"] figure img`);
  await clickMenu('Popisek');
  await pause(200);
  await typeText('Detail kotvení');
  await pressKey('Enter');
  await pause(400);
  const pictureMenu = (await contents.executeJavaScript(`(() => {
    const row = document.querySelector('.layer-view.active .row[data-line="${pasted.line}"]');
    const figure = row?.querySelector('figure');
    const body = row?.closest('.page-body');
    return { menu: ${menuShown}, full: !!figure && !!body && Math.abs(figure.getBoundingClientRect().width - body.getBoundingClientRect().width) < 3, caption: row?.querySelector('figcaption')?.textContent ?? '' };
  })()`)) as { menu: number; full: boolean; caption: string };
  await clickOn('.sheet-scroll');
  // A file dropped on a row goes in after that row (an OS drag cannot be sent as input, so the drop event is dispatched).
  await contents.executeJavaScript(`(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'Schéma nosníku.png', { type: 'image/png' }));
    const row = document.querySelector('.layer-view.active .row[data-line="2"]');
    const box = row.getBoundingClientRect();
    const at = { clientX: box.left + 20, clientY: box.top + box.height / 2 };
    row.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, ...at }));
    row.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, ...at }));
  })()`);
  await pause(800);
  const dropped = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view.active .row[data-line="3"] figcaption')].map((f) => f.textContent.replace(/\\s+/g, ' ').trim()).join('|')`,
  )) as string;
  // A picture file copied in a file manager (Explorer and Linux file managers put its file:// URI on the clipboard).
  const copiedFile = join(mkdtempSync(join(tmpdir(), 'kalketa-')), 'Detail uložení.png');
  await writeFile(copiedFile, png);
  await clipboard.write([new ClipboardItem({ 'text/uri-list': pathToFileURL(copiedFile).href })]);
  await clickOn('.layer-view.active .row[data-line="1"]');
  await pressKey('V', ['control']);
  await pause(800);
  await clickOn('.sheet-scroll');
  await pause(300);
  const fileCopied = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view.active figcaption')].some((f) => f.textContent.includes('Detail uložení'))`,
  )) as boolean;
  // Ctrl+V with no row being edited (the sheet only shown) puts the picture at the end.
  const countPictures = () => contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .picture').length`) as Promise<number>;
  const before = await countPictures();
  // On Windows the picture is put there the way other programs do (a bitmap through .NET), not by Electron.
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms, System.Drawing; $b = New-Object System.Drawing.Bitmap 200, 100; $g = [System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::SteelBlue); $g.Dispose(); [System.Windows.Forms.Clipboard]::SetImage($b)']);
  } else {
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
  }
  await clickOn('.sheet-scroll');
  await pressKey('V', ['control']);
  // Reading the clipboard through the desktop takes a moment (longer on X11); wait for the picture.
  for (let waited = 0; waited < 4000 && (await countPictures()) === before; waited += 200) await pause(200);
  await pause(300);
  const shownAfterPaste = (await contents.executeJavaScript(`(() => {
    const row = document.querySelector('.layer-view.active .row.just-inserted');
    const view = document.querySelector('.layer-view.active .sheet-scroll').getBoundingClientRect();
    const box = row?.getBoundingClientRect();
    return !!row?.querySelector('.picture') && box.top >= view.top && box.bottom <= view.bottom;
  })()`)) as boolean;
  const pastedIdle = (await countPictures()) === before + 1 && shownAfterPaste;
  await takePicture(picture.replace(/[.]png$/, '-pictures.png'));
  // A picture beside the text: a new calculation, a picture after the heading, Placement > Right.
  await clickOn('.doc-tab-new');
  await clickOn('.layer-view.active .row[data-line="1"]');
  await pressKey('End');
  await pressKey('Enter');
  await typeText('L := 5 m');
  await pressKey('Enter');
  await typeText('q := 12 kN/m');
  await clickOn('.layer-view.active .row[data-line="1"]');
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
  await pressKey('V', ['control']);
  for (let waited = 0; waited < 4000 && !(await contents.executeJavaScript(`!!document.querySelector('.layer-view.active .row[data-line="2"] figure')`)); waited += 200) await pause(200);
  await clickOn('.sheet-scroll');
  await clickOn('.layer-view.active .row[data-line="2"] figure img');
  await clickMenu('Umístění');
  await clickMenu('Vpravo vedle textu');
  await pause(400);
  const sideGroup = (await contents.executeJavaScript(`(() => {
    const group = document.querySelector('.layer-view.active .side-group.side-right');
    return { rows: [...(group?.querySelectorAll('.side-rows .row') ?? [])].map((r) => r.dataset.line).join(','), picture: !!group?.querySelector('.side-picture figure'), side: group?.style.getPropertyValue('--side') ?? '' };
  })()`)) as { rows: string; picture: boolean; side: string };
  // Dragging the inner corner of a right-side picture to the left widens its column.
  await clickOn('.layer-view.active .side-picture figure img');
  await pressKey('Escape');
  const inner = (await contents.executeJavaScript(`(() => {
    const r = document.querySelector('.layer-view.active .side-picture .picture-handle.sw').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`)) as { x: number; y: number };
  contents.sendInputEvent({ type: 'mouseDown', ...inner, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 4; step++) {
    contents.sendInputEvent({ type: 'mouseMove', x: inner.x - step * 10, y: inner.y, button: 'left' } as Electron.MouseInputEvent);
    await pause(40);
  }
  contents.sendInputEvent({ type: 'mouseUp', x: inner.x - 40, y: inner.y, button: 'left', clickCount: 1 });
  await pause(400);
  const widened = (await contents.executeJavaScript(`parseFloat(document.querySelector('.layer-view.active .side-group')?.style.getPropertyValue('--side') ?? '0')`)) as number;
  await takePicture(picture.replace(/[.]png$/, '-side.png'));
  // Dragging the picture with the mouse moves it, held where it was taken: from above the given values to below them.
  const grab = (await contents.executeJavaScript(`(() => {
    const img = document.querySelector('.layer-view.active .row[data-line="2"] figure img').getBoundingClientRect();
    const q = document.querySelector('.layer-view.active .row[data-line="4"]').getBoundingClientRect();
    return { x: Math.round(img.left + img.width / 2), y: Math.round(img.top + img.height / 2), tx: Math.round(q.left + q.width / 2), ty: Math.round(q.bottom + 4 + img.height / 2) };
  })()`)) as { x: number; y: number; tx: number; ty: number };
  contents.sendInputEvent({ type: 'mouseDown', x: grab.x, y: grab.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    contents.sendInputEvent({ type: 'mouseMove', x: Math.round(grab.x + ((grab.tx - grab.x) * step) / 8), y: Math.round(grab.y + ((grab.ty - grab.y) * step) / 8), button: 'left' } as Electron.MouseInputEvent);
    await pause(40);
  }
  // A hidden window delivers the moves of a drag only when it paints: the picture makes it paint.
  await takePicture(picture.replace(/[.]png$/, '-drag.png'));
  const markShown = (await contents.executeJavaScript(`!!document.querySelector('.drop-mark')`)) as boolean;
  contents.sendInputEvent({ type: 'mouseUp', x: grab.tx, y: grab.ty, button: 'left', clickCount: 1 });
  await pause(500);
  const movedPicture = markShown && ((await contents.executeJavaScript(
    `!!document.querySelector('.layer-view.active .row[data-line="4"] figure') && /L/.test(document.querySelector('.layer-view.active .row[data-line="2"]')?.textContent ?? '')`,
  )) as boolean);
  // Placement > Right, text flows around; dragged straight up above the values, it stays at its edge and they stand beside it.
  await clickOn('.layer-view.active .row[data-line="4"] figure img');
  await clickMenu('Umístění');
  await clickMenu('Vpravo s obtékáním');
  await pause(300);
  const lift = (await contents.executeJavaScript(`(() => {
    const img = document.querySelector('.layer-view.active .row[data-line="4"] figure img').getBoundingClientRect();
    const l = document.querySelector('.layer-view.active .row[data-line="2"]').getBoundingClientRect();
    return { x: Math.round(img.left + img.width / 2), y: Math.round(img.top + img.height / 2), tx: Math.round(img.left + img.width / 2), ty: Math.round(l.top + 2 + img.height / 2) };
  })()`)) as { x: number; y: number; tx: number; ty: number };
  contents.sendInputEvent({ type: 'mouseDown', x: lift.x, y: lift.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    contents.sendInputEvent({ type: 'mouseMove', x: Math.round(lift.x + ((lift.tx - lift.x) * step) / 8), y: Math.round(lift.y + ((lift.ty - lift.y) * step) / 8), button: 'left' } as Electron.MouseInputEvent);
    await pause(40);
  }
  await takePicture(picture.replace(/[.]png$/, '-wrapdrag.png'));
  contents.sendInputEvent({ type: 'mouseUp', x: lift.tx, y: lift.ty, button: 'left', clickCount: 1 });
  await pause(600);
  await takePicture(picture.replace(/[.]png$/, '-wrap.png'));
  const wrapped = (await contents.executeJavaScript(`(() => {
    const pic = document.querySelector('.layer-view.active .row.wrap-right[data-line="2"]')?.getBoundingClientRect();
    const l = document.querySelector('.layer-view.active .row[data-line="3"]')?.getBoundingClientRect();
    const body = document.querySelector('.layer-view.active .page-body')?.getBoundingClientRect();
    return !!pic && !!l && !!body && l.right <= pic.left + 1 && l.width < body.width * 0.8 && l.top < pic.bottom;
  })()`)) as boolean;
  // Insert > End of flow after L: q goes below the picture. Then the picture menu cancels the flow.
  await clickOn('.layer-view.active .row[data-line="3"]');
  await clickOn('.menubar-item:nth-child(4) > button');
  await clickMenu('Konec obtékání');
  await clickOn('.sheet-scroll');
  await pause(400);
  const cleared = (await contents.executeJavaScript(`(() => {
    const pic = document.querySelector('.layer-view.active .row.wrap-right')?.getBoundingClientRect();
    const q = [...document.querySelectorAll('.layer-view.active .row')].find((r) => r.textContent.includes('12'))?.getBoundingClientRect();
    return !!pic && !!q && q.top >= pic.bottom - 1 && !!document.querySelector('.layer-view.active .row.clear-row');
  })()`)) as boolean;
  await takePicture(picture.replace(/[.]png$/, '-clear.png'));
  await clickOn('.layer-view.active .row.wrap-right figure img');
  await clickMenu('Zrušit obtékání');
  await pause(400);
  // Without the flow the picture stays at the right edge; Placement > Left moves it to the left one.
  const edges = () =>
    contents.executeJavaScript(`(() => {
      const f = document.querySelector('.layer-view.active .row[data-line="2"] figure')?.getBoundingClientRect();
      const b = document.querySelector('.layer-view.active .page-body')?.getBoundingClientRect();
      return f && b ? { left: Math.abs(f.left - b.left) < 3, right: Math.abs(f.right - b.right) < 3, wrap: !!document.querySelector('.layer-view.active .row.wrap-right, .layer-view.active .row.wrap-left') } : undefined;
    })()`) as Promise<{ left: boolean; right: boolean; wrap: boolean } | undefined>;
  const afterUnwrap = await edges();
  await clickOn('.layer-view.active .row[data-line="2"] figure img');
  await clickMenu('Umístění');
  await clickMenu('Vlevo');
  await pause(400);
  const afterLeft = await edges();
  const unwrapped = !!afterUnwrap && !afterUnwrap.wrap && afterUnwrap.right && !!afterLeft && afterLeft.left && !afterLeft.right && !afterLeft.wrap;
  // Placed freely: dragged to the right, away from the edge and down from the top, the text flows on its left.
  const free = (await contents.executeJavaScript(`(() => {
    const own = document.querySelector('.layer-view.active .row[data-line="2"]');
    const img = own.querySelector('figure').getBoundingClientRect();
    const b = document.querySelector('.layer-view.active .page-body').getBoundingClientRect();
    // L comes up to where the picture stands once it is taken away; the picture goes 20 px below it.
    const l = own.nextElementSibling.getBoundingClientRect();
    const top = own.getBoundingClientRect().top + l.height + 20;
    const x = Math.round(img.left + img.width / 2), y = Math.round(img.top + img.height / 2);
    return { x, y, tx: Math.round(b.right - b.width * 0.12 - img.width / 2), ty: Math.round(top + img.height / 2) };
  })()`)) as { x: number; y: number; tx: number; ty: number };
  contents.sendInputEvent({ type: 'mouseDown', x: free.x, y: free.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    contents.sendInputEvent({ type: 'mouseMove', x: Math.round(free.x + ((free.tx - free.x) * step) / 8), y: Math.round(free.y + ((free.ty - free.y) * step) / 8), button: 'left' } as Electron.MouseInputEvent);
    await pause(40);
  }
  await takePicture(picture.replace(/[.]png$/, '-freedrag.png'));
  const boxShown = (await contents.executeJavaScript(`!!document.querySelector('.drop-box')`)) as boolean;
  contents.sendInputEvent({ type: 'mouseUp', x: free.tx, y: free.ty, button: 'left', clickCount: 1 });
  await pause(600);
  await takePicture(picture.replace(/[.]png$/, '-free.png'));
  const placedFree = boxShown && ((await contents.executeJavaScript(`(() => {
    const row = document.querySelector('.layer-view.active .row.wrap-right');
    const pic = row?.getBoundingClientRect();
    const b = document.querySelector('.layer-view.active .page-body').getBoundingClientRect();
    // Moved down from its line, the value before it is not pushed below it: it stays at the top, beside the gap.
    const l = [...document.querySelectorAll('.layer-view.active .row')].find((r) => r !== row && /L\\s*[≔:=]/.test(r.textContent))?.getBoundingClientRect();
    return !!pic && !!l && b.right - pic.right > b.width * 0.05 && pic.top > l.bottom + 4 && !!document.querySelector('.layer-view.active .wrap-stop');
  })()`)) as boolean);
  // The right button: the flow menu. No flowing around: dragged to the right it goes to the right edge, alone on its lines.
  await clickOn('.layer-view.active .row.wrap-right figure img', [], 'right');
  await clickMenu('Bez obtékání');
  await pause(400);
  const strict = (await contents.executeJavaScript(`(() => {
    const img = document.querySelector('.layer-view.active figure img').getBoundingClientRect();
    const b = document.querySelector('.layer-view.active .page-body').getBoundingClientRect();
    return { x: Math.round(img.left + img.width / 2), y: Math.round(img.top + img.height / 2), tx: Math.round(b.right - img.width / 2 - 4), ty: Math.round(img.top + img.height / 2 + 6) };
  })()`)) as { x: number; y: number; tx: number; ty: number };
  contents.sendInputEvent({ type: 'mouseDown', x: strict.x, y: strict.y, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    contents.sendInputEvent({ type: 'mouseMove', x: Math.round(strict.x + ((strict.tx - strict.x) * step) / 8), y: Math.round(strict.y + ((strict.ty - strict.y) * step) / 8), button: 'left' } as Electron.MouseInputEvent);
    await pause(40);
  }
  await takePicture(picture.replace(/[.]png$/, '-strictdrag.png'));
  contents.sendInputEvent({ type: 'mouseUp', x: strict.tx, y: strict.ty, button: 'left', clickCount: 1 });
  await pause(600);
  const strictPlaced = (await contents.executeJavaScript(`(() => {
    const f = document.querySelector('.layer-view.active figure')?.getBoundingClientRect();
    const b = document.querySelector('.layer-view.active .page-body').getBoundingClientRect();
    return !!f && Math.abs(f.right - b.right) < 3 && !document.querySelector('.layer-view.active .row.wrap-right, .layer-view.active .row.wrap-left, .layer-view.active .wrap-stop');
  })()`)) as boolean;
  // Canvas: Insert > Canvas, a rectangle and an arrow drawn, a text typed, the rectangle moved, Done.
  const drawDrag = async (from: { x: number; y: number }, to: { x: number; y: number }, name: string) => {
    contents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 6; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + ((to.x - from.x) * step) / 6), y: Math.round(from.y + ((to.y - from.y) * step) / 6), button: 'left' } as Electron.MouseInputEvent);
      await pause(30);
    }
    await takePicture(picture.replace(/[.]png$/, `-${name}.png`));
    contents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
    await pause(250);
  };
  await clickOn('.menubar-item:nth-child(4) > button');
  await clickMenu('Plátno');
  await pause(400);
  const stage = (await contents.executeJavaScript(`(() => { const r = document.querySelector('.canvas-svg')?.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height }; })()`)) as { x: number; y: number; w: number; h: number } | undefined;
  let canvasOk = false;
  if (stage) {
    const at = (fx: number, fy: number) => ({ x: Math.round(stage.x + stage.w * fx), y: Math.round(stage.y + stage.h * fy) });
    await clickOn('.canvas-toolbar [data-tool="rect"]');
    await drawDrag(at(0.1, 0.2), at(0.4, 0.7), 'canvas-rect');
    await clickOn('.canvas-toolbar [data-tool="arrow"]');
    await drawDrag(at(0.5, 0.8), at(0.8, 0.3), 'canvas-arrow');
    await clickOn('.canvas-toolbar [data-tool="text"]');
    const textAt = at(0.55, 0.15);
    contents.sendInputEvent({ type: 'mouseDown', ...textAt, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...textAt, button: 'left', clickCount: 1 });
    await pause(300);
    // Written right in the drawing; Esc ends it (Enter would start a new line).
    await typeText('L = 5 m');
    await pressKey('Escape');
    await pause(300);
    await clickOn('.canvas-toolbar [data-tool="select"]');
    await drawDrag(at(0.25, 0.45), at(0.3, 0.45), 'canvas-move');
    const items = (await contents.executeJavaScript(`document.querySelector('.canvas-svg g').innerHTML`)) as string;
    await clickOn('[data-canvas="done"]');
    await pause(500);
    await clickOn('.sheet-scroll');
    await takePicture(picture.replace(/[.]png$/, '-canvas-sheet.png'));
    await takePicture(picture.replace(/[.]png$/, '-canvas-sheet.png'));
    const shown = (await contents.executeJavaScript(`(() => {
      const img = [...document.querySelectorAll('.layer-view.active figure img')].find((i) => i.src.startsWith('data:image/svg+xml'));
      return img ? decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1)) : '';
    })()`)) as string;
    // A double click on the drawing opens it again with its three items.
    await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active figure img')].find((i) => i.src.startsWith('data:image/svg+xml'))?.closest('figure')?.setAttribute('data-canvas-figure', '')`);
    const figure = (await contents.executeJavaScript(`(() => { const r = document.querySelector('[data-canvas-figure] img').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`)) as { x: number; y: number };
    contents.sendInputEvent({ type: 'mouseDown', ...figure, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...figure, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseDown', ...figure, button: 'left', clickCount: 2 });
    contents.sendInputEvent({ type: 'mouseUp', ...figure, button: 'left', clickCount: 2 });
    await pause(500);
    const reopened = (await contents.executeJavaScript(`document.querySelectorAll('.canvas-svg g > rect, .canvas-svg g > line, .canvas-svg g > text').length`)) as number;
    const inlineEditing = (await contents.executeJavaScript(`!!document.querySelector('.page .canvas-inline .canvas-svg') && !!document.querySelector('.canvas-inline-bar') && !document.querySelector('.canvas-window')`)) as boolean;
    await takePicture(picture.replace(/[.]png$/, '-canvas.png'));
    await pressKey('Escape');
    await pause(300);
    // The menu of the drawing opens it in the large window too.
    await clickOn('[data-canvas-figure] img');
    await clickMenu('Upravit plátno v okně');
    await pause(400);
    const windowEditing = (await contents.executeJavaScript(`!!document.querySelector('.canvas-window .canvas-svg') && document.querySelectorAll('.canvas-window .canvas-svg g > rect, .canvas-window .canvas-svg g > line, .canvas-window .canvas-svg g > text').length === 3`)) as boolean;
    await takePicture(picture.replace(/[.]png$/, '-canvas-window.png'));
    // Drawings of mechanics in the window: a dimension with its label, a moment, the rectangle hatched.
    const big = (await contents.executeJavaScript(`(() => { const r = document.querySelector('.canvas-window .canvas-svg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`)) as { x: number; y: number; w: number; h: number };
    const inWindow = (fx: number, fy: number) => ({ x: Math.round(big.x + big.w * fx), y: Math.round(big.y + big.h * fy) });
    await clickOn('.canvas-window [data-tool="dimension"]');
    await drawDrag(inWindow(0.1, 0.9), inWindow(0.45, 0.9), 'canvas-dimension');
    await pause(300);
    await typeText('l');
    await pressKey('Enter');
    await pause(300);
    await clickOn('.canvas-window [data-tool="moment"]');
    await drawDrag(inWindow(0.85, 0.6), inWindow(0.93, 0.6), 'canvas-moment');
    const rectAt = inWindow(0.3, 0.45);
    contents.sendInputEvent({ type: 'mouseDown', ...rectAt, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...rectAt, button: 'left', clickCount: 1 });
    await pause(200);
    await clickOn('.canvas-window [data-canvas="hatch"]');
    await pause(200);
    // A beam on its supports: a pin and a roller clicked at its ends, a fixed end turned, a load along it.
    const click = async (point: { x: number; y: number }) => {
      contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
      contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
      await pause(200);
    };
    await clickOn('.canvas-window [data-tool="pin"]');
    await click(inWindow(0.55, 0.92));
    await clickOn('.canvas-window [data-tool="roller"]');
    await click(inWindow(0.75, 0.92));
    await clickOn('.canvas-window [data-tool="fixed"]');
    await click(inWindow(0.05, 0.15));
    await clickOn('.canvas-window [data-canvas="turn"]');
    await clickOn('.canvas-window [data-tool="load"]');
    await drawDrag(inWindow(0.55, 0.8), inWindow(0.75, 0.8), 'canvas-load');
    await pause(300);
    // The value of q in the sheet, shown and kept up to date.
    await typeText('{q}');
    await pressKey('Enter');
    await pause(300);
    await takePicture(picture.replace(/[.]png$/, '-canvas-mechanics.png'));
    // The text written again as in a word processor: all of it bold (Ctrl+A, the B of its bar), a second line.
    await contents.executeJavaScript(`document.querySelectorAll('.canvas-window .canvas-svg g text').forEach((t) => { if (t.textContent.includes('L = 5 m')) t.setAttribute('data-smoke-text', ''); })`);
    const textBox = (await contents.executeJavaScript(`(() => { const r = document.querySelector('[data-smoke-text]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`)) as { x: number; y: number };
    contents.sendInputEvent({ type: 'mouseDown', ...textBox, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...textBox, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseDown', ...textBox, button: 'left', clickCount: 2 });
    contents.sendInputEvent({ type: 'mouseUp', ...textBox, button: 'left', clickCount: 2 });
    await pause(400);
    const writingOpen = (await contents.executeJavaScript(`document.activeElement?.classList.contains('canvas-text-editing') === true`)) as boolean;
    await pressKey('A', ['control']);
    await clickOn('.canvas-text-bar [data-text="bold"]');
    await pressKey('End', ['control']);
    // Enter as the keyboard sends it: the key and the character of a new line.
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    contents.sendInputEvent({ type: 'char', keyCode: '\r' });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    await pause(150);
    await typeText('nosník');
    await takePicture(picture.replace(/[.]png$/, '-canvas-text.png'));
    await pressKey('Escape');
    await pause(300);
    // A frame dragged over both supports chooses the two of them.
    await drawDrag(inWindow(0.5, 0.86), inWindow(0.82, 0.99), 'canvas-frame');
    const framed = (await contents.executeJavaScript(`document.querySelectorAll('.canvas-window .canvas-svg > rect.canvas-frame').length`)) as number;
    await pressKey('Escape');
    await pause(200);
    // The text chosen, its font from the bar of the canvas: serif (Cambria) one arrow down.
    await contents.executeJavaScript(`document.querySelectorAll('.canvas-window .canvas-svg g text').forEach((t) => { if (t.textContent.includes('L = 5 m')) t.setAttribute('data-smoke-text', ''); })`);
    const textAgain = (await contents.executeJavaScript(`(() => { const r = document.querySelector('[data-smoke-text]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`)) as { x: number; y: number };
    contents.sendInputEvent({ type: 'mouseDown', ...textAgain, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...textAgain, button: 'left', clickCount: 1 });
    await pause(200);
    await contents.executeJavaScript(`document.querySelector('.canvas-window [data-canvas="font"]').focus()`);
    await pressKey('Down');
    await pause(300);
    await clickOn('.canvas-window [data-canvas="done"]');
    await pause(500);
    const mechanics = (await contents.executeJavaScript(`(() => {
      const img = [...document.querySelectorAll('.layer-view.active figure img')].find((i) => i.src.startsWith('data:image/svg+xml'));
      const svg = img ? decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1)) : '';
      return svg.includes('class="cc-dimension"') && svg.includes('>l</text>') && /<path d="M[^"]*A/.test(svg) && svg.includes('fill="url(#cc-hatch-') &&
        svg.includes('cc-support cc-pin') && svg.includes('cc-support cc-roller') && svg.includes('rotate(90)"><line x1="0"') && svg.includes('class="cc-load"') && svg.includes(' kN/m</text></g>') && !svg.includes('{q}') &&
        svg.includes('<tspan font-weight="bold">L = 5 m</tspan>') && svg.includes('>nosník</tspan>') && svg.includes('font-family="Cambria');
    })()`)) as boolean;
    // In the sheet: the right edge of the canvas makes its area narrower, the drawing as drawn (its height stays).
    const sizeOf = `(() => { const img = [...document.querySelectorAll('.layer-view.active figure img')].find((i) => i.src.startsWith('data:image/svg+xml')); const svg = img ? decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1)) : ''; const m = /width="([\\d.]+)mm" height="([\\d.]+)mm"/.exec(svg); return m ? { w: Number(m[1]), h: Number(m[2]) } : undefined; })()`;
    const areaBefore = (await contents.executeJavaScript(sizeOf)) as { w: number; h: number } | undefined;
    await clickOn('[data-canvas-figure] img');
    await pause(300);
    await pressKey('Escape');
    await pause(200);
    const edge = (await contents.executeJavaScript(`(() => { const h = document.querySelector('.layer-view.active .row.selected .picture-handle.edge.e'); if (!h) return undefined; const r = h.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`)) as { x: number; y: number } | undefined;
    let canvasNarrower = false;
    if (edge && areaBefore) {
      contents.sendInputEvent({ type: 'mouseMove', ...edge });
      await pause(100);
      contents.sendInputEvent({ type: 'mouseDown', ...edge, button: 'left', clickCount: 1 });
      for (let step = 1; step <= 6; step++) {
        contents.sendInputEvent({ type: 'mouseMove', x: edge.x - step * 10, y: edge.y, button: 'left' } as Electron.MouseInputEvent);
        await pause(40);
      }
      contents.sendInputEvent({ type: 'mouseUp', x: edge.x - 60, y: edge.y, button: 'left', clickCount: 1 });
      await pause(700);
      const areaAfter = (await contents.executeJavaScript(sizeOf)) as { w: number; h: number } | undefined;
      canvasNarrower = !!areaAfter && areaAfter.w < areaBefore.w - 2 && Math.abs(areaAfter.h - areaBefore.h) < 0.5;
      await takePicture(picture.replace(/[.]png$/, '-canvas-edge.png'));
    }
    canvasOk = mechanics && canvasNarrower && writingOpen && framed === 2 &&
      /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+"/.test(items) && shown.includes('<rect') && shown.includes('marker-end') && shown.includes('L = 5 m') && reopened === 3 && inlineEditing && windowEditing && !(await contents.executeJavaScript(`!!document.querySelector('.canvas-window, .canvas-inline')`));
  }
  const besideText = sideGroup.rows === '3,4' && sideGroup.picture && sideGroup.side !== '' && widened > parseFloat(sideGroup.side) && movedPicture && wrapped && cleared && unwrapped && placedFree && strictPlaced && canvasOk;
  const pictures = pasted.img && resized && dropped === 'Obr. 1: Schéma nosníku' && fileCopied && pastedIdle && pictureMenu.menu >= 5 && pictureMenu.full && pictureMenu.caption.includes('Detail kotvení') && besideText;

  // Help > About > Third-party licences: the notices of the shipped packages.
  await clickOn('.menubar-item:nth-child(8) > button');
  await clickMenu('O programu');
  await pause(300);
  await clickOn('[data-about="notices"]');
  await pause(800);
  const notices = (await contents.executeJavaScript(`document.querySelector('.notices')?.textContent ?? ''`)) as string;
  const licences = notices.includes('react ') && notices.includes('exceljs 4') && notices.includes('fflate') && notices.includes('electron') && notices.includes('Permission is hereby granted');
  await takePicture(picture.replace(/[.]png$/, '-licences.png'));
  await takePicture(picture.replace(/[.]png$/, '-licences.png'));
  await pressKey('Escape');
  await pressKey('Escape');
  await pause(300);

  // Tools > Settings > AI: off by default; Claude with a wrong key, then a good one
  // (against the fake API of scripts/smoke.mjs); the key is remembered encrypted and forgotten again.
  const aiSettings = await aiSettingsWithRealInput(contents, picture);

  // The AI chat in the side pane, with the other server (the fake one) picked in Settings.
  const aiChat = await aiChatWithRealInput(contents, picture);
  // Text copied out of a PDF, pasted into the sources and tidied after a look at the preview.
  const pdfCleanup = await pdfCleanupWithRealInput(contents, picture);
  // Those sources saved as a theory library, attached in the chat and cited by its key.
  const theoryLibrary = await theoryLibraryWithRealInput(contents, picture);
  // A whole book as a PDF in the theory folder: one chapter of it chosen, then cited in the chat.
  const study = await studyWithRealInput(contents, picture);

  // A file whose AI notes an AI wrote: they have a tab, can only be read, and cannot be deleted.
  const aiFile = process.env['KALKETA_SMOKE_AI'];
  let aiReadOnly = false;
  let aiDeletable = true;
  let aiMenu = 0;
  if (aiFile) {
    lastFocused = smokeWindow;
    await sendOpen(aiFile);
    await pause(1000);
    await clickOn('.layer-tab[data-layer="ai"]');
    await clickOn('.notes-view.ai .notes-preview');
    await typeText('ruční zásah');
    aiReadOnly = (await contents.executeJavaScript(
      `!!document.querySelector('.notes-view.ai') && document.querySelector('.notes-view.ai').textContent.includes('Průhyb vyhovuje') && !document.querySelector('.notes-view.ai textarea') && !document.body.textContent.includes('ruční zásah') && ![...document.querySelectorAll('textarea')].some((a) => a.value.includes('ruční zásah'))`,
    )) as boolean;
    await takePicture(picture.replace(/[.]png$/, '-ai.png'));
    await clickOn('.layer-tab[data-layer="ai"]', [], 'right');
    aiDeletable = (await contents.executeJavaScript(`[...document.querySelectorAll('.context-menu .menu-row')].some((r) => r.textContent.includes('Odstranit'))`)) as boolean;
    aiMenu = (await contents.executeJavaScript(`document.querySelectorAll('.context-menu .menu-row').length`)) as number;
    await pressKey('Escape');
  }

  // A sheet with a block: the block is listed, its use shows the block and computes.
  const blockFile = process.env['KALKETA_SMOKE_BLOCKS'];
  let blocksOk: boolean | undefined;
  if (blockFile) {
    lastFocused = smokeWindow;
    await sendOpen(blockFile);
    await pause(1000);
    const shown = (await contents.executeJavaScript(`({
      blocks: document.querySelectorAll('.block-item').length,
      errors: Number(document.querySelector('.statusbar span')?.textContent.replace(/\\D+/g, '') ?? -1),
      text: document.querySelector('.layer-view.active .pages')?.textContent ?? '',
    })`)) as { blocks: number; errors: number; text: string };
    blocksOk = shown.errors === 0 && shown.text.includes('Prosty nosnik 1.2') && shown.text.includes('45');
    await takePicture(picture.replace(/[.]png$/, '-blocks.png'));
  }
  return { ...state, pickTaken, deflection, derivations, summaryOk, summaryOpens, summaryAtEnd, bookStyle, verdictFuture, verdictBack, pageHead, definitionAtCursor, solveFormatted, sheetGridOk, sheetGrid, tableEnter, tableEnterAt, lastRowEnter, draggedRows, selectedAll, bothFormatted, roundedOn, equationNumber, solvedByFormula, rootsAndExtremes, wordText, wordColored, wordPrinted, cellMarked, cellFont, cellDeleted, tableRowAdded, chartSteps, samplesOk, sampleTab, newKeepsExample, citations, notesPicture, notesPlaced, split, mainHidden, twoLayers, addKinds, tableStrip, aiTabWhileEmpty, aiTabAfterClose, second, firstKept, documents, newWindow, oneCopy, multi, userFunction, functions, solved, ownUnits, complex, finance, money, rod, calculus, matrices, charts, chartTip, functionBar, templateLine, revisions, roots, toolIcons, aiSettings, aiChat, pdfCleanup, theoryLibrary, study, cubeLine, rootLine, frozen, verifiedText, statusAfterFreeze, statusDraft, footerDraft, comparedText, licences, aiReadOnly, aiDeletable, aiMenu, help, pasted, resized, dropped, fileCopied, pastedIdle, shownAfterPaste, pictureMenu, sideGroup, widened, movedPicture, wrapped, cleared, unwrapped, placedFree, strictPlaced, canvasOk, besideText, pictures, blocksOk };
}

/** The tidied sources saved as a library (.kalkt) and attached in the chat: the model cites it by its key. */
async function theoryLibraryWithRealInput(contents: Electron.WebContents, picture: string): Promise<boolean> {
  await clickOn('.layer-view.active .word-library');
  await pause(400);
  const offered = (await contents.executeJavaScript(`({
    name: document.querySelector('.library-name')?.value ?? '',
    key: document.querySelector('.library-key')?.value ?? '',
    folder: document.querySelector('.library-folder')?.value ?? '',
  })`)) as { name: string; key: string; folder: string };
  // Without a source the program says what is missing and saves nothing.
  await clickOn('.dialog-buttons button.default');
  await pause(300);
  const missing = (await contents.executeJavaScript(`document.querySelector('.library-problems')?.textContent ?? ''`)) as string;
  await clickOn('.library-source');
  await typeText('Testovací skripta');
  await clickOn('.dialog-buttons button.default');
  await pause(800);
  const dir = process.env['KALKETA_THEORY_USER_DIR'] ?? '';
  const saved = existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith('.kalkt')) : [];

  // The chat: Teorie ▾ lists the library; ticked, the model searches it.
  await clickOn('.tool-button[title^="Rozhovor s AI"]');
  await pause(300);
  await clickOn('.chat-library-button');
  await pause(800);
  const listed = (await contents.executeJavaScript(`[...document.querySelectorAll('.chat-library')].map((l) => l.textContent)`)) as string[];
  await clickOn('.chat-library input');
  await pause(200);
  const stillOpen = (await contents.executeJavaScript(`!!document.querySelector('.chat-library-menu')`)) as boolean;
  // A click elsewhere (into the question) closes the menu, so it does not cover the chat.
  await clickOn('.chat-input');
  await pause(200);
  const closed = !(await contents.executeJavaScript(`!!document.querySelector('.chat-library-menu')`));
  await typeText('Jak se posuzuje spojité zatížení?');
  await pressKey('Enter');
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.chat-turn.assistant:not(.writing)')].some((t) => t.textContent.includes('knihovna'))`)); i++) await pause(150);
  const answer = (await contents.executeJavaScript(`(() => {
    const turns = [...document.querySelectorAll('.chat-turn.assistant:not(.writing)')];
    const last = turns[turns.length - 1];
    return {
      text: last?.textContent ?? '',
      ok: [...(last?.querySelectorAll('.cite.ok') ?? [])].map((c) => c.textContent),
      head: document.querySelector('.chat-library-button')?.textContent ?? '',
    };
  })()`)) as { text: string; ok: string[]; head: string };
  await takePicture(picture.replace(/[.]png$/, '-library.png'));
  await clickOn('.chat-new');
  await clickOn('.menubar-item:nth-child(3) > button');
  await clickMenu('Boční panel');
  await clickMenu('Podrobnosti');
  await pause(300);
  await writeFile(picture.replace(/[.]png$/, '-library.json'), JSON.stringify({ offered, missing, saved, listed, stillOpen, closed, answer }, null, 2));
  return (
    offered.name === 'Podklady' && offered.key === 'P' && offered.folder === 'user' &&
    missing.includes('Doplňte zdroj') && saved.length === 1 && saved[0] === 'Podklady.kalkt' &&
    listed.length === 1 && listed[0]!.includes('[P] Podklady') && listed[0]!.includes('Moje knihovny') && stillOpen && closed &&
    answer.head.startsWith('Teorie (1)') && answer.ok.some((c) => /^P:T\d+$/.test(c ?? '')) &&
    // The sections saved into the library from these sources go once, from the library: 1 own + 2 of the library.
    answer.text.includes('úseků: 3') &&
    // The memory written after the first conversation goes into the next one.
    answer.text.includes('paměť: ano')
  );
}

/**
 * A study PDF in the user's theory folder: a 62-page book with a table of
 * contents. Tools > Study material warns that it is read whole; one chapter
 * ticked, the card next to it keeps the choice, and the chat cites only pages
 * of that chapter.
 */
async function studyWithRealInput(contents: Electron.WebContents, picture: string): Promise<boolean> {
  const dir = process.env['KALKETA_THEORY_USER_DIR'] ?? '';
  const topic = (p: number) =>
    p >= 21 && p <= 40 ? 'Ohybový moment a průhyb prostého nosníku se počítají z rovnice ohybové čáry.' : p > 40 ? 'Kroutící moment namáhá hřídel smykem po obvodu průřezu.' : 'Tah a tlak prutu vyvolávají normálové napětí v průřezu.';
  const heading = (p: number) => ({ 1: '<h1>1 Úvod</h1>', 21: '<h1>2 Ohyb</h1>', 25: '<h2>2.1 Průhyb nosníku</h2>', 41: '<h1>3 Krut</h1>' })[p] ?? '';
  // Page 22 has a picture and a formula the PDF can only give as scraps: both become cut-outs in the sources.
  const bitmap = Buffer.alloc(160 * 100 * 4);
  for (let i = 0; i < 160 * 100; i++) bitmap.set([200, 120, 40, 255], i * 4);
  const png = nativeImage.createFromBitmap(bitmap, { width: 160, height: 100 }).toPNG().toString('base64');
  const extra = (p: number) => (p === 22 ? `<p><img src="data:image/png;base64,${png}" style="width:200px;height:125px"></p><p style="margin-left:120px">M = F · a (51)</p><p>Text pod vzorcem na straně 22.</p>` : '');
  const pages = Array.from({ length: 62 }, (_, i) => `<section style="break-after: page">${heading(i + 1)}<p>Strana ${i + 1}. ${topic(i + 1)}</p>${extra(i + 1)}</section>`).join('');
  const printer = await printWindow(`<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Pružnost a pevnost</title></head><body>${pages}</body></html>`);
  const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true, generateTaggedPDF: true, generateDocumentOutline: true });
  printer.destroy();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'Pruznost a pevnost.pdf'), pdf);

  await clickOn('.menubar-item:nth-child(6) > button');
  await clickMenu('Studijní podklady');
  for (let i = 0; i < 80 && !(await contents.executeJavaScript(`!!document.querySelector('.study-chapters li')`)); i++) await pause(150);
  const offered = (await contents.executeJavaScript(`({
    file: document.querySelector('.study-file.active')?.textContent ?? '',
    reads: document.querySelector('.study-reads')?.textContent ?? '',
    large: !!document.querySelector('.study-advice.warn'),
    chapters: [...document.querySelectorAll('.study-chapters li')].map((l) => l.textContent),
    key: document.querySelector('.study-key')?.value ?? '',
  })`)) as { file: string; reads: string; large: boolean; chapters: string[]; key: string };
  // Suggested for the open calculation: a message either way; then the whole book again, and one chapter by hand.
  await clickOn('.study-suggest');
  await pause(200);
  const suggested = (await contents.executeJavaScript(`document.querySelector('.study-suggested')?.textContent ?? ''`)) as string;
  await clickOn('.study-whole');
  await pause(100);
  const ohyb = offered.chapters.findIndex((c) => c.startsWith('2 Ohyb'));
  await clickOn(`.study-chapters li:nth-child(${ohyb + 1}) input`);
  await pause(200);
  const chosen = (await contents.executeJavaScript(`({ reads: document.querySelector('.study-reads')?.textContent ?? '', large: !!document.querySelector('.study-advice.warn') })`)) as { reads: string; large: boolean };
  await pause(400);
  await takePicture(picture.replace(/[.]png$/, '-study.png'));
  // Into the sources: the card is saved, a new sources layer holds the chapter by its headings.
  await clickOn('.study-to-sources');
  for (let i = 0; i < 60 && !(await contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .word-text img').length >= 2`)); i++) await pause(200);
  const sources = (await contents.executeJavaScript(`({
    dialog: !!document.querySelector('.study-files'),
    headings: [...document.querySelectorAll('.layer-view.active .word-text h2, .layer-view.active .word-text h3')].map((h) => h.tagName + ':' + h.textContent),
    text: document.querySelector('.layer-view.active .word-text .ProseMirror')?.textContent ?? '',
    cuts: [...document.querySelectorAll('.layer-view.active .word-text img')].map((i) => i.getAttribute('alt') ?? ''),
    notice: document.querySelector('.notice')?.textContent ?? '',
  })`)) as { dialog: boolean; headings: string[]; text: string; cuts: string[]; notice: string };
  // Cut-outs from the PDF: the page drawn, zoomed, rectangles dragged over it and put in one after another;
  // one taken from below the text of page 21 lands right after that text in the sources.
  const picturesBefore = (await contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .word-text img').length`)) as number;
  await clickOn('.layer-view.active .word-pdf-crop');
  const surfaceOf = async () => {
    for (let i = 0; i < 60 && !(await contents.executeJavaScript(`!!document.querySelector('.crop-surface[data-rendered]')`)); i++) await pause(150);
    return (await contents.executeJavaScript(`(() => { const r = document.querySelector('.crop-surface')?.getBoundingClientRect(); return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : undefined; })()`)) as { x: number; y: number; w: number; h: number } | undefined;
  };
  const fitted = await surfaceOf();
  await clickOn('.crop-zoom-in');
  await pause(300);
  const zoomed = await surfaceOf();
  await clickOn('.crop-fit');
  await pause(300);
  const surface = await surfaceOf();
  const cropPage = (await contents.executeJavaScript(`document.querySelector('.crop-page input')?.value ?? ''`)) as string;
  const dragOver = async (fx: number, fy: number, tx: number, ty: number) => {
    if (!surface) return;
    const from = { x: surface.x + Math.round(surface.w * fx), y: surface.y + Math.round(surface.h * fy) };
    const to = { x: surface.x + Math.round(surface.w * tx), y: surface.y + Math.round(surface.h * ty) };
    contents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 8; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: from.x + Math.round(((to.x - from.x) * step) / 8), y: from.y + Math.round(((to.y - from.y) * step) / 8), button: 'left', modifiers: ['leftbuttondown'] } as Electron.MouseInputEvent);
      await pause(20);
    }
    contents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 });
    await pause(200);
  };
  const pictures = () => contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .word-text img').length`) as Promise<number>;
  await dragOver(0.1, 0.03, 0.7, 0.12);
  await takePicture(picture.replace(/[.]png$/, '-crop.png'));
  await clickOn('.crop-insert');
  for (let i = 0; i < 30 && (await pictures()) === picturesBefore; i++) await pause(150);
  await dragOver(0.2, 0.24, 0.6, 0.32);
  await clickOn('.crop-insert');
  for (let i = 0; i < 30 && (await pictures()) < picturesBefore + 2; i++) await pause(150);
  const stillOpen = (await contents.executeJavaScript(`document.querySelector('.crop-count')?.textContent ?? ''`)) as string;
  await clickOn('.dialog-buttons button.default');
  await pause(300);
  // The pictures show once the browser has read them.
  for (let i = 0; i < 30 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .word-text img')].every((i) => i.naturalWidth > 0)`)); i++) await pause(100);
  const cropped = (await contents.executeJavaScript(`({
    dialog: !!document.querySelector('.crop'),
    failed: document.querySelector('.crop .study-advice')?.textContent ?? '',
    pictures: [...document.querySelectorAll('.layer-view.active .word-text img')].map((i) => (i.getAttribute('alt') ?? '') + '|' + i.naturalWidth),
    // What follows the paragraph with the text of page 21.
    afterPage21: (() => {
      const blocks = [...document.querySelectorAll('.layer-view.active .word-text .ProseMirror > *')];
      const at = blocks.findIndex((b) => b.textContent.includes('Strana 21.'));
      return at < 0 ? '' : (blocks[at + 1]?.querySelector('img') ? 'img' : blocks[at + 1]?.tagName ?? '');
    })(),
  })`)) as { dialog: boolean; failed: string; pictures: string[]; afterPage21: string };
  await writeFile(picture.replace(/[.]png$/, '-crop.json'), JSON.stringify({ fitted, zoomed, surface, cropPage, stillOpen, cropped }, null, 2));
  // A formula in Kalketa notation, typed into the sources: shown typeset under the line.
  // The end of the paragraph is clicked: End alone goes to the end of its first line, which depends on the fonts.
  const paragraphEnd = (await contents.executeJavaScript(`(() => {
    const p = document.querySelector('.layer-view.active .word-text .ProseMirror p');
    p.scrollIntoView({ block: 'center' });
    const range = document.createRange();
    range.selectNodeContents(p);
    const last = [...range.getClientRects()].at(-1);
    return { x: Math.round(last.right - 1), y: Math.round(last.top + last.height / 2) };
  })()`)) as { x: number; y: number };
  contents.sendInputEvent({ type: 'mouseDown', ...paragraphEnd, button: 'left', clickCount: 1 });
  contents.sendInputEvent({ type: 'mouseUp', ...paragraphEnd, button: 'left', clickCount: 1 });
  await pause(150);
  await pressKey('End');
  await pressKey('Enter');
  await clickOn('.layer-view.active .word-formula');
  await typeText('w := 5*q*L^4/(384*E*I)');
  await pause(300);
  const formula = (await contents.executeJavaScript(`({
    math: document.querySelectorAll('.layer-view.active .kalk-preview math mfrac').length,
    bad: document.querySelectorAll('.layer-view.active .kalk-preview .kalk-bad').length,
    typed: [...document.querySelectorAll('.layer-view.active .word-text pre code')].map((c) => c.textContent).join(' | '),
    badText: [...document.querySelectorAll('.layer-view.active .kalk-preview .kalk-bad')].map((c) => c.textContent).join(' | '),
  })`)) as { math: number; bad: number; typed: string; badText: string };
  // Formulas from cut-outs: the AI reads the formula cut-out of page 22 and writes it under the picture.
  await clickOn('.layer-view.active .word-formula-ai');
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .kalk-note')].some((n) => n.textContent.includes('přepsala AI'))`)); i++) await pause(150);
  const fromPicture = (await contents.executeJavaScript(`(() => {
    const note = [...document.querySelectorAll('.layer-view.active .kalk-note')].find((n) => n.textContent.includes('přepsala AI'));
    const block = note?.closest('.word-code');
    // The block of the document it is in, and the one before it.
    let top = block;
    while (top?.parentElement && !top.parentElement.classList.contains('ProseMirror')) top = top.parentElement;
    return {
      note: note?.textContent ?? '',
      math: block?.querySelectorAll('.kalk-formula math').length ?? 0,
      underPicture: !!top?.previousElementSibling?.querySelector('img'),
      code: block?.querySelector('code')?.textContent ?? '',
      check: block?.querySelector('.kalk-check')?.textContent ?? '',
    };
  })()`)) as { note: string; math: number; underPicture: boolean; code: string; check: string };
  // Confirmed, the formula stands as the book prints it: centred, its number (7) at the right, the cut-out folded away.
  // Kept here (the default deletes it): the cut-out stays folded above the formula.
  await clickOn('.layer-view.active .kalk-confirm-keep');
  await pause(400);
  const confirmedFormula = (await contents.executeJavaScript(`(() => {
    const block = [...document.querySelectorAll('.layer-view.active .word-code.confirmed')].find((b) => (b.querySelector('code')?.textContent ?? '').includes('derive M'));
    return {
      confirmed: !!block,
      codeHidden: !!block?.classList.contains('code-hidden'),
      number: block?.querySelector('.kalk-number')?.textContent ?? '',
      note: !!block?.querySelector('.kalk-note'),
      folded: !!document.querySelector('.layer-view.active .word-cutout-folded'),
    };
  })()`)) as { confirmed: boolean; codeHidden: boolean; number: string; note: boolean; folded: boolean };
  await contents.executeJavaScript(`document.querySelector('.layer-view.active .word-cutout-folded')?.scrollIntoView({ block: 'center' })`);
  await takePicture(picture.replace(/[.]png$/, '-formula.png'));
  // The folded cut-out deleted: the formula stands for it, the file gets smaller.
  await clickOn('.layer-view.active .word-cutout-folded .cutout-delete');
  await pause(300);
  const cutoutDeleted = (await contents.executeJavaScript(`!document.querySelector('.layer-view.active .word-cutout-folded') && ![...document.querySelectorAll('.layer-view.active .word-text img')].some((img) => (img.getAttribute('data-path') ?? '').includes('/vzorec-')) && !!document.querySelector('.layer-view.active .word-code.confirmed')`)) as boolean;
  // Figures described for search: the picture of page 22 gets what it shows, the cut-out of the formula does not.
  await clickOn('.layer-view.active .word-describe-ai');
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .word-text img')].some((img) => img.getAttribute('title'))`)); i++) await pause(150);
  await pause(300);
  const described = (await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .word-text img')].map((img) => ((img.getAttribute('data-path') ?? '').includes('/vzorec-') ? 'formula' : 'figure') + ':' + (img.getAttribute('title') ?? ''))`)) as string[];
  // The text of the pages read again from the PDF: the changes come to be confirmed, then they are in the sources.
  await clickOn('.layer-view.active .word-reread-ai');
  for (let i = 0; i < 80 && !(await contents.executeJavaScript(`!!document.querySelector('.reread-apply')`)); i++) await pause(150);
  const rereadChanges = (await contents.executeJavaScript(`document.querySelectorAll('.reread-change').length`)) as number;
  if (rereadChanges > 0) await clickOn('.reread-apply');
  await pause(500);
  const reread = {
    changes: rereadChanges,
    fixed: (await contents.executeJavaScript(`(document.querySelector('.layer-view.active .word-text')?.textContent ?? '').includes('Ohybový moment σKt') && !!document.querySelector('.layer-view.active .word-text sub')`)) as boolean,
  };
  const card = existsSync(join(dir, 'Pruznost a pevnost.pdf.kalketa.json')) ? (JSON.parse(await readFile(join(dir, 'Pruznost a pevnost.pdf.kalketa.json'), 'utf8')) as { key?: string; chapters?: number[] }) : {};

  // The chat: the book is offered among the libraries, with how much of it is read.
  await clickOn('.pane-tab[data-pane="chat"]');
  await pause(300);
  await clickOn('.chat-library-button');
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.chat-library')].some((l) => l.textContent.includes('[PP]'))`)); i++) await pause(150);
  const listed = (await contents.executeJavaScript(`[...document.querySelectorAll('.chat-library')].map((l) => l.textContent)`)) as string[];
  const at = listed.findIndex((l) => l.includes('[PP]'));
  await clickOn(`.chat-library:nth-of-type(${at + 1}) input`);
  await pause(200);
  await clickOn('.chat-input');
  await typeText('Jak se počítá průhyb nosníku?');
  await pressKey('Enter');
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.chat-turn.assistant:not(.writing)')].some((t) => t.textContent.includes('PP:'))`)); i++) await pause(150);
  const answer = (await contents.executeJavaScript(`(() => {
    const turns = [...document.querySelectorAll('.chat-turn.assistant:not(.writing)')];
    const last = turns[turns.length - 1];
    return { text: last?.textContent ?? '', ok: [...(last?.querySelectorAll('.cite.ok') ?? [])].map((c) => c.textContent) };
  })()`)) as { text: string; ok: string[] };
  await clickOn('.chat-new');
  await clickOn('.pane-tab[data-pane="details"]');
  await pause(300);
  const cited = answer.ok.map((c) => /^PP:T(\d+)$/.exec(c ?? '')?.[1]).filter(Boolean).map(Number);
  await writeFile(picture.replace(/[.]png$/, '-study.json'), JSON.stringify({ offered, suggested, chosen, sources, cropPage, stillOpen, cropped, formula, fromPicture, confirmedFormula, cutoutDeleted, described, reread, card, listed, answer, cited }, null, 2));
  return (
    offered.file.startsWith('Pruznost a pevnost.pdf') && offered.file.includes('PDF, 62 s.') && offered.reads === 'AI čte 62 z 62.' && offered.large && offered.key === 'PP' &&
    offered.chapters.length === 4 && ohyb >= 0 && chosen.reads === 'AI čte 21 z 62.' && !chosen.large && suggested !== '' &&
    !sources.dialog && sources.headings[0] === 'H2:2 Ohyb (s. 21–24)' && sources.headings[1] === 'H3:2.1 Průhyb nosníku (s. 25–40)' && sources.headings.length === 2 && sources.text.includes('Strana 30.') && !sources.text.includes('Strana 20.') &&
    cropPage === '21' && !!fitted && !!zoomed && zoomed.w > fitted.w * 1.2 && stillOpen === 'Vloženo: 2' && !cropped.dialog && cropped.pictures.length === picturesBefore + 2 && cropped.pictures.filter((c) => /^Pružnost a pevnost, s\. 21\|\d+$/.test(c) && Number(c.split('|')[1]) > 400).length === 2 &&
    formula.math === 1 && formula.bad === 0 && fromPicture.note.includes('přepsala AI (local-smoke-7b)') && fromPicture.math === 1 && fromPicture.underPicture && fromPicture.code.includes('derive M := F·a == a·F {eq=7}') && fromPicture.check.includes('odvození ověřeno') && confirmedFormula.confirmed && confirmedFormula.codeHidden && confirmedFormula.number === '(7)' && !confirmedFormula.note && confirmedFormula.folded && cutoutDeleted && reread.changes > 0 && reread.fixed && described.includes('figure:Průběh ohybového momentu prostého nosníku.') && !described.some((d) => d.startsWith('formula:') && d !== 'formula:') && sources.cuts.length === 2 && sources.cuts.every((c) => c === 'Pružnost a pevnost, s. 22') && sources.notice.includes('obrázků (1) a vzorců (1)') && !sources.text.includes('(51)') && sources.text.includes('Text pod vzorcem na straně 22.') && cropped.afterPage21 === 'img' &&
    card.key === 'PP' && JSON.stringify(card.chapters) === JSON.stringify([ohyb]) &&
    at >= 0 && listed[at]!.includes('AI čte 21 z 62.') &&
    cited.length === 1 && cited[0]! >= 21 && cited[0]! <= 41
  );
}

/** Text as a PDF copy gives it, pasted with Ctrl+V into new sources and tidied with the toolbar button. */
async function pdfCleanupWithRealInput(contents: Electron.WebContents, picture: string): Promise<boolean> {
  await clickOn('.menubar-item:nth-child(4) > button');
  await clickMenu('Nová vrstva');
  await clickMenu('Podklady');
  await pressKey('Enter'); // default name
  await pause(300);
  contents.focus();
  await clickOn('.layer-view.active .notes-word .ProseMirror');
  const lines = ['3. NOSNÍKY A ZATÍŽENÍ', 'Nosník je prvek n a m á h a n ý ohybem a průhyb se posuzuje', 'zvlášť podle normy.', '17', '3.1 Spojité zatížení', 'Zatížení je r o v n o m ě r n ě rozložené.', 'I l l l l ^ - m H x'];
  clipboard.writeText(lines.join(String.fromCharCode(10)));
  await pressKey('V', ['control']);
  await pause(400);
  const before = (await contents.executeJavaScript(`({
    warning: !!document.querySelector('.layer-view.active .word-warning'),
    paragraphs: document.querySelectorAll('.layer-view.active .word-text .ProseMirror p').length,
  })`)) as { warning: boolean; paragraphs: number };
  await clickOn('.layer-view.active .word-pdf');
  await pause(400);
  const dialog = (await contents.executeJavaScript(`({
    summary: document.querySelector('.pdf-summary')?.textContent ?? '',
    suspects: [...document.querySelectorAll('.pdf-suspect code')].map((c) => c.textContent),
    marked: [...document.querySelectorAll('.pdf-preview mark.joined')].map((m) => m.textContent),
  })`)) as { summary: string; suspects: string[]; marked: string[] };
  await takePicture(picture.replace(/[.]png$/, '-pdf.png'));
  await clickOn('.dialog-buttons button.default');
  await pause(500);
  const after = (await contents.executeJavaScript(`({
    warning: !!document.querySelector('.layer-view.active .word-warning'),
    headings: [...document.querySelectorAll('.layer-view.active .word-text h1, .layer-view.active .word-text h2')].map((h) => h.tagName + ':' + h.textContent + ':' + (h.getAttribute('data-tid') ?? '')),
    text: document.querySelector('.layer-view.active .word-text .ProseMirror')?.textContent ?? '',
  })`)) as { warning: boolean; headings: string[]; text: string };
  await writeFile(picture.replace(/[.]png$/, '-pdf.json'), JSON.stringify({ before, dialog, after }, null, 2));
  return (
    before.warning && before.paragraphs >= 6 &&
    dialog.summary.includes('nadpisů: 2') && dialog.summary.includes('čísel stran: 1') &&
    dialog.suspects.length === 1 && dialog.suspects[0] === 'I l l l l ^ - m H x' &&
    dialog.marked.includes('namáhaný') && dialog.marked.includes('rovnoměrně') &&
    !after.warning && after.headings.length === 2 &&
    /^H1:3\. NOSNÍKY A ZATÍŽENÍ:T\d+$/.test(after.headings[0]!) && /^H2:3\.1 Spojité zatížení:T\d+$/.test(after.headings[1]!) &&
    after.text.includes('Nosník je prvek namáhaný ohybem a průhyb se posuzuje zvlášť podle normy.') && !after.text.includes('I l l l')
  );
}

/** A question in the AI chat, by real input: the answer streams in and the model got the sheet. */
async function aiChatWithRealInput(contents: Electron.WebContents, picture: string): Promise<boolean> {
  const pane = (await contents.executeJavaScript(`localStorage.getItem('kalketa.pane') ?? 'details'`)) as string;
  // Theory in a sources layer: a heading gets its id when the user leaves the text.
  await clickOn('.menubar-item:nth-child(4) > button');
  await clickMenu('Nová vrstva');
  await clickMenu('Podklady');
  await pressKey('Enter'); // default name
  await pause(300);
  // Focus and blur events need a page with focus, as the user's window has.
  contents.focus();
  await clickOn('.layer-view.active .notes-word .ProseMirror');
  await typeText('## Klopení');
  await pressKey('Enter');
  await typeText('Klopení je ztráta stability ohýbaného nosníku.');
  // Ctrl+V puts text from the clipboard into the sources, Ctrl+Z takes it back (the editor's own keys).
  const lastParagraph = `[...document.querySelectorAll('.layer-view.active .word-text .ProseMirror p')].map((p) => p.textContent).filter((t) => t !== '').at(-1) ?? ''`;
  clipboard.writeText(' Vloženo ze schránky.');
  // Typing within half a second is one undo step; a person pauses before pasting.
  await pause(700);
  await pressKey('V', ['control']);
  await pause(200);
  const pasted = (await contents.executeJavaScript(lastParagraph)) as string;
  await pause(700);
  await pressKey('Z', ['control']);
  await pause(200);
  const unpasted = (await contents.executeJavaScript(lastParagraph)) as string;
  // "## " made a heading, Enter a new paragraph under it.
  const typed = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view.active .word-text .ProseMirror > *')].filter((e) => e.textContent !== '').map((e) => e.tagName + ':' + e.textContent).join('|')`,
  )) as string;
  // Leaves the text by keyboard (a click elsewhere does the same for the user).
  await pressKey('Tab');
  await pause(300);
  const theory = (await contents.executeJavaScript(`({
    heading: document.querySelector('.layer-view.active .word-text h2')?.textContent ?? '',
    badge: document.querySelector('.layer-view.active .word-text h2')?.getAttribute('data-tid') ?? '',
    focused: (document.activeElement?.tagName ?? '') + '.' + (document.activeElement?.className ?? ''),
    hasFocus: document.hasFocus(),
  })`)) as { heading: string; badge: string; focused: string; hasFocus: boolean };
  if (await contents.executeJavaScript(`!!document.querySelector('.layer-tab[data-layer="main"]')`)) await clickOn('.layer-tab[data-layer="main"]');
  // Settings: the provider list from Claude (saved before) down to the other server.
  await clickOn('.menubar-item:nth-child(6) > button');
  await clickMenu('Nastavení');
  await pause(400);
  await clickOn('.ai-settings label.field > span');
  for (let i = 0; i < 3; i++) await pressKey('Down');
  for (let i = 0; i < 40 && !((await contents.executeJavaScript(`document.querySelector('.ai-status')?.textContent ?? ''`)) as string).includes('Připojeno'); i++) await pause(150);
  // Thinking depth: from "as the model decides" past "none" (a local server offers it) to "low".
  await clickOn('.ai-settings label.field:has(.ai-effort) > span');
  await pressKey('Down');
  await pressKey('Down');
  await pause(200);
  await clickOn('.dialog-buttons button.default');
  await pause(300);

  await clickOn('.tool-button[title^="Rozhovor s AI"]');
  await pause(300);
  // Switched off, the pane offers to switch it on again and sends nothing until then.
  await clickOn('.chat-ai-off');
  await pause(200);
  const offered = (await contents.executeJavaScript(`!!document.querySelector('.chat-ai-on') && !document.querySelector('.chat-input')`)) as boolean;
  const requestsOff = await fakeRequests();
  await pause(500);
  const quietWhileOff = (await fakeRequests()) === requestsOff;
  await clickOn('.chat-ai-on');
  await pause(300);
  const head = (await contents.executeJavaScript(`document.querySelector('.chat-model')?.textContent ?? ''`)) as string;
  await clickOn('.chat-input');
  await typeText('Co počítá řádek 3?');
  await pressKey('Enter');
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`!!document.querySelector('.chat-turn.assistant:not(.writing)')`)); i++) await pause(150);
  const shown = (await contents.executeJavaScript(`({
    user: document.querySelector('.chat-turn.user')?.textContent ?? '',
    answer: document.querySelector('.chat-turn.assistant:not(.writing)')?.textContent ?? '',
    bold: document.querySelector('.chat-turn.assistant:not(.writing) strong')?.textContent ?? '',
    code: document.querySelector('.chat-turn.assistant:not(.writing) code')?.textContent ?? '',
    table: document.querySelector('.chat-turn.assistant:not(.writing) table.md td')?.textContent ?? '',
    citesOk: [...document.querySelectorAll('.chat-turn.assistant:not(.writing) .cite.ok')].map((c) => c.textContent),
    citesBad: [...document.querySelectorAll('.chat-turn.assistant:not(.writing) .cite.bad')].map((c) => c.textContent),
    citeSummary: document.querySelector('.chat-turn.assistant:not(.writing) .cite-summary')?.textContent ?? '',
    input: document.querySelector('.chat-input')?.value ?? '',
    title: document.querySelector('.doc-tab.active')?.textContent ?? '',
  })`)) as { user: string; answer: string; bold: string; code: string; table: string; citesOk: string[]; citesBad: string[]; citeSummary: string; input: string; title: string };
  await takePicture(picture.replace(/[.]png$/, '-ai-chat.png'));
  // A model that spends the whole length limit thinking: no empty answer, the user is told why.
  await clickOn('.chat-input');
  await typeText('Analyzuj výpočet.');
  await pressKey('Enter');
  // While the model thinks, its thinking is a folded line; a click opens it.
  for (let i = 0; i < 20 && !(await contents.executeJavaScript(`!!document.querySelector('.chat-thought summary')`)); i++) await pause(100);
  const thoughtFolded = (await contents.executeJavaScript(`!document.querySelector('.chat-thought')?.open`)) as boolean;
  await clickOn('.chat-thought summary');
  await pause(200);
  const thought = (await contents.executeJavaScript(`document.querySelector('.chat-thought')?.open ? document.querySelector('.chat-thought-text')?.textContent ?? '' : ''`)) as string;
  for (let i = 0; i < 40 && !(await contents.executeJavaScript(`!!document.querySelector('.chat-error')`)); i++) await pause(150);
  const cutOff = (await contents.executeJavaScript(`({
    error: document.querySelector('.chat-error')?.textContent ?? '',
    answers: document.querySelectorAll('.chat-turn.assistant').length,
    empty: [...document.querySelectorAll('.chat-turn.assistant')].some((t) => t.textContent.trim() === ''),
  })`)) as { error: string; answers: number; empty: boolean };
  await clickOn('.chat-new');
  await pause(200);
  const cleared = (await contents.executeJavaScript(`document.querySelectorAll('.chat-turn').length`)) as number;
  // The conversation is kept in the AI notes layer, which came with it; from there it is taken up again.
  const aiTab = (await contents.executeJavaScript(`!!document.querySelector('.layer-tab[data-layer="ai"]')`)) as boolean;
  let kept = { count: 0, text: '' };
  let layerShown = { memory: '', sheet: [] as string[], unknown: [] as string[], hiddenConversations: -1 };
  let resumed: string[] = [];
  let newSheet = { head: '', others: '', opened: { tab: '', rows: 0, marked: 0, errors: '' }, state: '' };
  let thinkingCut = '';
  let together = { allButton: '', acceptedAll: 0, undoneAll: -1, copy: { tab: '', rows: 0, marked: 0, badges: 0 }, original: { rows: -1, state: 0 } };
  let proposal = { card: '', accepted: false, state: '', undone: false, journal: '', marked: '', reviewed: false, markedAgain: false, printAsks: '', printClosed: false };
  if (aiTab) {
    await clickOn('.layer-tab[data-layer="ai"]');
    // New chat ended the conversation: the model rewrote the memory, in the background.
    for (let i = 0; i < 40 && !(await contents.executeJavaScript(`!!document.querySelector('.layer-view.active .ai-memory-text')`)); i++) await pause(150);
    layerShown = (await contents.executeJavaScript(`({
      memory: document.querySelector('.layer-view.active .ai-memory-text')?.textContent ?? '',
      sheet: [...document.querySelectorAll('.layer-view.active .ai-source.sheet li')].map((l) => l.textContent),
      unknown: [...document.querySelectorAll('.layer-view.active .ai-source.unknown li')].map((l) => l.textContent),
      hiddenConversations: document.querySelectorAll('.layer-view.active .ai-conversation').length,
    })`)) as typeof layerShown;
    // The conversations are shown on request.
    await clickOn('.layer-view.active .conv-toggle');
    await pause(300);
    kept = (await contents.executeJavaScript(`({
      count: document.querySelectorAll('.layer-view.active .ai-conversation').length,
      text: document.querySelector('.layer-view.active .ai-conversation')?.textContent ?? '',
    })`)) as { count: number; text: string };
    await takePicture(picture.replace(/[.]png$/, '-ai-kept.png'));
    await clickOn('.layer-view.active .conv-continue');
    await pause(300);
    resumed = (await contents.executeJavaScript(`[...document.querySelectorAll('.chat-turn')].map((t) => t.className.replace('chat-turn ', '') + ':' + t.textContent.slice(0, 40))`)) as string[];
    // A proposed change: a card under the answer, accepted with a click, one step to undo.
    // The sheet in view, to see the accepted line arrive in it.
    await clickOn('.layer-tab[data-layer="main"]');
    await pause(300);
    await clickOn('.chat-input');
    await typeText('Navrhni změnu.');
    await pressKey('Enter');
    for (let i = 0; i < 40 && !(await contents.executeJavaScript(`!!document.querySelector('.chat-pane .proposal-accept')`)); i++) await pause(150);
    const card = (await contents.executeJavaScript(`document.querySelector('.chat-pane .proposal')?.textContent ?? ''`)) as string;
    await takePicture(picture.replace(/[.]png$/, '-ai-proposal.png'));
    await clickOn('.chat-pane .proposal-accept');
    await pause(400);
    const inSheet = `[...document.querySelectorAll('.layer-view.active .row[data-line]')].some((r) => r.textContent.includes('smoke'))`;
    const accepted = (await contents.executeJavaScript(inSheet)) as boolean;
    const state = (await contents.executeJavaScript(`document.querySelector('.chat-pane .proposal-state')?.textContent ?? ''`)) as string;
    // The accepted line carries the AI mark until it is reviewed.
    const markedRow = `[...document.querySelectorAll('.layer-view.active .row.ai-made')].map((r) => r.getAttribute('data-line') + ':' + (r.querySelector('.ai-mark')?.getAttribute('title') ?? '')).join('|')`;
    const marked = (await contents.executeJavaScript(markedRow)) as string;
    await takePicture(picture.replace(/[.]png$/, '-ai-marked.png'));
    // Printing asks first while such lines are there; Esc prints nothing.
    await clickOn('.menubar-item:nth-child(1) > button');
    await clickMenu('Tisk');
    await pause(300);
    const printAsks = (await contents.executeJavaScript(`document.querySelector('p.ask')?.textContent ?? ''`)) as string;
    await pressKey('Escape');
    await pause(200);
    const printClosed = (await contents.executeJavaScript(`!document.querySelector('p.ask')`)) as boolean;
    await clickOn('.layer-tab[data-layer="ai"]');
    await pause(300);
    const journal = (await contents.executeJavaScript(`document.querySelector('.layer-view.active .ai-changes')?.textContent ?? ''`)) as string;
    await clickOn('.layer-tab[data-layer="main"]');
    await pause(200);
    // Reviewed from the mark's menu: the mark goes; Undo brings it back.
    await clickOn('.layer-view.active .row.ai-made .ai-mark');
    await pause(200);
    await clickMenu('Označit jako prověřené');
    await pause(300);
    const reviewed = (await contents.executeJavaScript(`document.querySelectorAll('.layer-view.active .row.ai-made').length === 0`)) as boolean;
    await clickOn('.menubar-item:nth-child(2) > button');
    await clickMenu('Zpět');
    await pause(400);
    const markedAgain = (await contents.executeJavaScript(markedRow)) === marked;
    // Undo takes the line and the decision back together: the proposal is open again.
    await clickOn('.menubar-item:nth-child(2) > button');
    await clickMenu('Zpět');
    await pause(400);
    const undone = !(await contents.executeJavaScript(inSheet)) && (await contents.executeJavaScript(`!!document.querySelector('.chat-pane .proposal-accept')`));
    proposal = { card, accepted, state, undone: undone as boolean, journal, marked, reviewed, markedAgain, printAsks, printClosed };
    // A model thinking past the limit of the settings: asked again without thinking, the answer says so.
    await clickOn('.chat-input');
    await typeText('Přemýšlej dlouho.');
    await pressKey('Enter');
    for (let i = 0; i < 60 && !(await contents.executeJavaScript(`[...document.querySelectorAll('.chat-turn.assistant:not(.writing)')].some((t) => t.textContent.includes('Odpověď hned.'))`)); i++) await pause(150);
    thinkingCut = (await contents.executeJavaScript(`[...document.querySelectorAll('.chat-turn.assistant:not(.writing)')].pop()?.textContent ?? ''`)) as string;
    // Two changes that belong together: accepted at once (one Undo takes both back), then into a new sheet.
    await clickOn('.chat-input');
    await typeText('Navrhni dvě změny.');
    await pressKey('Enter');
    for (let i = 0; i < 40 && !(await contents.executeJavaScript(`!!document.querySelector('.chat-pane .proposal-accept-all')`)); i++) await pause(150);
    const smokeRows = `[...document.querySelectorAll('.layer-view.active .row[data-line]')].filter((r) => r.textContent.includes('smoke')).length`;
    const allButton = (await contents.executeJavaScript(`document.querySelector('.chat-pane .proposal-accept-all')?.textContent ?? ''`)) as string;
    await clickOn('.chat-pane .proposal-accept-all');
    await pause(400);
    const acceptedAll = (await contents.executeJavaScript(smokeRows)) as number;
    await clickOn('.menubar-item:nth-child(2) > button');
    await clickMenu('Zpět');
    await pause(400);
    const undoneAll = (await contents.executeJavaScript(smokeRows)) as number;
    const tabBefore = (await contents.executeJavaScript(`[...document.querySelectorAll('.doc-tab')].findIndex((t) => t.classList.contains('active'))`)) as number;
    await clickOn('.chat-pane .proposal-all:has(.proposal-accept-all) .proposal-new-sheet');
    await pause(600);
    const copy = (await contents.executeJavaScript(`({
      tab: document.querySelector('.doc-tab.active')?.textContent ?? '',
      rows: ${smokeRows},
      marked: document.querySelectorAll('.layer-view.active .row.ai-made').length,
      badges: document.querySelectorAll('.layer-view.active .ai-mark').length,
    })`)) as { tab: string; rows: number; marked: number; badges: number };
    await takePicture(picture.replace(/[.]png$/, '-ai-copy.png'));
    await clickOn(`.doc-tab:nth-child(${tabBefore + 1}) .doc-tab-title`);
    await pause(400);
    const original = (await contents.executeJavaScript(`({ rows: ${smokeRows}, state: [...document.querySelectorAll('.chat-pane .proposal-state')].map((s) => s.textContent).filter((s) => s.startsWith('Přijato do nového listu')).length })`)) as { rows: number; state: number };
    together = { allButton, acceptedAll, undoneAll, copy, original };
    // A whole new calculation by the model: a card under the answer, opened as a new sheet.
    await clickOn('.chat-input');
    await typeText('Napiš nový výpočet nosníku se silou uprostřed.');
    await pressKey('Enter');
    for (let i = 0; i < 40 && !(await contents.executeJavaScript(`!!document.querySelector('.chat-pane .new-sheet-open')`)); i++) await pause(150);
    const sheetCard = (await contents.executeJavaScript(`({
      head: document.querySelector('.chat-pane .new-sheet .proposal-head')?.textContent ?? '',
      answer: [...document.querySelectorAll('.chat-turn.assistant:not(.writing)')].pop()?.textContent ?? '',
    })`)) as { head: string; answer: string };
    const sheetTab = (await contents.executeJavaScript(`[...document.querySelectorAll('.doc-tab')].findIndex((t) => t.classList.contains('active'))`)) as number;
    await clickOn('.chat-pane .new-sheet-open');
    await pause(600);
    const opened = (await contents.executeJavaScript(`({
      tab: document.querySelector('.doc-tab.active')?.textContent ?? '',
      rows: document.querySelectorAll('.layer-view.active .row[data-line]').length,
      marked: document.querySelectorAll('.layer-view.active .row.ai-made').length,
      errors: document.querySelector('.statusbar')?.textContent ?? '',
    })`)) as { tab: string; rows: number; marked: number; errors: string };
    await clickOn(`.doc-tab:nth-child(${sheetTab + 1}) .doc-tab-title`);
    await pause(400);
    const sheetState = (await contents.executeJavaScript(`document.querySelector('.chat-pane .new-sheet .proposal-state')?.textContent ?? ''`)) as string;
    newSheet = { head: sheetCard.head, others: /Jiné listy: (\d+)/.exec(sheetCard.answer)?.[1] ?? '', opened, state: sheetState };
    if (await contents.executeJavaScript(`!!document.querySelector('.layer-tab[data-layer="main"]')`)) await clickOn('.layer-tab[data-layer="main"]');
  }
  // The side pane's tabs switch what it shows with one click.
  await clickOn('.pane-tab[data-pane="tables"]');
  await pause(200);
  const paneTabs = (await contents.executeJavaScript(`[...document.querySelectorAll('.pane-tab')].map((t) => (t.classList.contains('active') ? '*' : '') + t.textContent).join(' ') + '|' + localStorage.getItem('kalketa.pane')`)) as string;
  // Back to the pane the later steps expect.
  const back = { details: 'Podrobnosti', tables: 'Tabulky', layers: 'Vrstvy', none: 'Skrytý' }[pane] ?? 'Podrobnosti';
  await clickOn('.menubar-item:nth-child(3) > button');
  await clickMenu('Boční panel');
  await clickMenu(back);
  await pause(300);
  await writeFile(picture.replace(/[.]png$/, '-ai-chat.json'), JSON.stringify({ pasted, unpasted, typed, theory, offered, quietWhileOff, head, shown, cutOff, cleared, aiTab, layerShown, kept, resumed, proposal, together, newSheet, paneTabs, thoughtFolded, thought }, null, 2));
  return (
    pasted === 'Klopení je ztráta stability ohýbaného nosníku. Vloženo ze schránky.' && unpasted === 'Klopení je ztráta stability ohýbaného nosníku.' &&
    typed === 'H2:Klopení|P:Klopení je ztráta stability ohýbaného nosníku.' && theory.heading === 'Klopení' && /^T\d+$/.test(theory.badge) &&
    shown.citesOk.length === 1 && shown.citesOk[0] === theory.badge && shown.citesBad.length === 1 && shown.citesBad[0]!.startsWith('T99') &&
    shown.citeSummary.includes('ověřené 1, nepodložené 1') && shown.answer.includes('Model dostal celé podklady (úseků: 1).') &&
    offered && quietWhileOff &&
    head.includes('Jiný server') && head.includes('local-smoke-7b') &&
    shown.user === 'Co počítá řádek 3?' && shown.input === '' &&
    /list: [^?;*]+;/.test(shown.answer) && shown.bold !== '' && !shown.answer.includes('**') && shown.code === 'Co počítá řádek 3?' && shown.table === 'IPE 220' && shown.answer.includes('jazyk: Czech') && shown.answer.includes('úsilí: low') && shown.answer.includes('výsledky: ano') && shown.answer.includes('otázka: Co počítá řádek 3?') &&
    cleared === 0 &&
    aiTab && layerShown.memory === 'Intent: smoke memory.' && layerShown.hiddenConversations === 0 &&
    layerShown.sheet.length === 1 && layerShown.sheet[0]!.startsWith('T1 Klopení') && layerShown.sheet[0]!.includes('ověřeno 1×') &&
    layerShown.unknown.length === 1 && layerShown.unknown[0]!.startsWith('T99') &&
    kept.count === 1 && kept.text.includes('Co počítá řádek 3?') && kept.text.includes('local-smoke-7b') &&
    cutOff.error.includes('vyčerpal limit') && cutOff.answers === 1 && !cutOff.empty &&
    resumed.length === 3 && resumed[0] === 'user:Co počítá řádek 3?' && resumed[1]!.startsWith('assistant:list:') && resumed[2] === 'user:Analyzuj výpočet.' &&
    proposal.card.includes('+ smoke_ai := 2 m') && proposal.card.includes('Výsledky posudků se nezmění.') && proposal.accepted && proposal.state.startsWith('Přijato') &&
    proposal.journal.includes('Návrhy změn') && proposal.journal.includes('Přijato') && proposal.undone &&
    /^\d+:Řádek navrhla AI \(local-smoke-7b, přijato /.test(proposal.marked) && !proposal.marked.includes('|') && proposal.reviewed && proposal.markedAgain &&
    proposal.printAsks.startsWith('Výpočet obsahuje řádky navržené AI') && proposal.printClosed &&
    newSheet.head === 'Nový list: Nosník se silou · řádků: 4' && Number(newSheet.others) >= 2 &&
    newSheet.opened.tab.startsWith('Nosník se silou') && newSheet.opened.marked >= 3 && newSheet.opened.errors.startsWith('chyba: 0') && newSheet.state.startsWith('Otevřeno jako „Nosník se silou“') &&
    thinkingCut.includes('Odpověď hned.') && thinkingCut.includes('bez přemýšlení') &&
    together.allButton === 'Přijmout vše (2)' && together.acceptedAll === 2 && together.undoneAll === 0 &&
    together.copy.tab.includes('(upravená kopie)') && together.copy.rows === 2 && together.copy.marked === 2 && together.copy.badges === 2 && together.original.rows === 0 && together.original.state === 2 &&
    paneTabs === 'Podrobnosti *Tabulky Vrstvy AI|tables' && thoughtFolded && thought === 'Nejdřív zkontroluji průhyb na řádku 12.'
  );
}

/** How many requests the fake servers of scripts/smoke.mjs have had. */
async function fakeRequests(): Promise<number> {
  try {
    const response = await fetch(`${process.env['ANTHROPIC_BASE_URL'] ?? ''}/stats`);
    return ((await response.json()) as { requests: number }).requests;
  } catch {
    return -1;
  }
}

/** The AI part of the Settings dialog, driven by real mouse and keyboard input. */
async function aiSettingsWithRealInput(contents: Electron.WebContents, picture: string): Promise<boolean> {
  const read = () =>
    contents.executeJavaScript(`(() => {
      const section = document.querySelector('.ai-settings');
      const selects = section ? [...section.querySelectorAll('select')] : [];
      return {
        provider: selects[0]?.value ?? '',
        model: selects[1]?.value ?? '',
        models: selects[1] ? [...selects[1].options].map((o) => o.value) : [],
        keyField: !!section?.querySelector('.ai-key'),
        keyValue: section?.querySelector('.ai-key')?.value ?? '',
        url: section?.querySelector('.ai-url')?.value ?? '',
        keyPlaceholder: section?.querySelector('.ai-key')?.placeholder ?? '',
        forget: !!section?.querySelector('.ai-forget'),
        status: section?.querySelector('.ai-status')?.textContent ?? '',
        providers: selects[0] ? [...selects[0].options].map((o) => o.textContent) : [],
      };
    })()`) as Promise<{ provider: string; model: string; models: string[]; keyField: boolean; keyValue: string; url: string; keyPlaceholder: string; forget: boolean; status: string; providers: string[] }>;
  const openSettings = async () => {
    await clickOn('.menubar-item:nth-child(6) > button');
    await clickMenu('Nastavení');
    await pause(400);
  };
  const waitForStatus = async (text: string) => {
    for (let i = 0; i < 40 && !(await read()).status.includes(text); i++) await pause(150);
  };

  // The AI is off after the start: nothing went to any server. Tools > Switch the AI on.
  const beforeOn = await fakeRequests();
  const menuOff = (await contents.executeJavaScript(`!!document.querySelector('.side-pane .chat-pane')`)) as boolean;
  await clickOn('.menubar-item:nth-child(6) > button');
  await clickMenu('Zapnout AI');
  await pause(300);
  await openSettings();
  const off = await read();
  // The provider list is a plain <select>: a click on its label focuses it without
  // opening the list, and the arrow key moves to the next provider.
  await clickOn('.ai-settings label.field > span');
  await pressKey('Down');
  await pause(300);
  const claude = await read();
  await clickOn('.ai-key');
  await typeText('sk-smoke-bad');
  await clickOn('.ai-test');
  await waitForStatus('nepřijal');
  const bad = await read();
  await clickOn('.ai-key');
  await pressKey('A', ['control']);
  await typeText('sk-smoke-good');
  await clickOn('.ai-test');
  await waitForStatus('Připojeno');
  const good = await read();
  await takePicture(picture.replace(/[.]png$/, '-ai-settings.png'));
  await clickOn('.dialog-buttons button.default');
  await pause(300);
  const saved = (await contents.executeJavaScript(`localStorage.getItem('kalketa.ai') ?? ''`)) as string;
  const keyFile = join(app.getPath('userData'), 'ai-keys.json');
  const onDisk = existsSync(keyFile) ? await readFile(keyFile, 'utf8') : '';
  // Without a system keyring (Linux in a bare session) the key is not written at all.
  const sealed = canSealKeys() ? onDisk.includes('anthropic') && !onDisk.includes('sk-smoke-good') : !onDisk.includes('anthropic');

  await openSettings();
  const reopened = await read();
  await clickOn('.ai-forget');
  await pause(300);
  const forgotten = await read();
  // Local servers: LM Studio (the fake one) runs and offers its model without a key; Ollama does not run.
  await clickOn('.ai-settings label.field > span');
  await pressKey('Down');
  await waitForStatus('Připojeno');
  const local = await read();
  await takePicture(picture.replace(/[.]png$/, '-ai-local.png'));
  await clickOn('.ai-settings label.field > span');
  await pressKey('Down');
  await waitForStatus('neběží');
  const absent = await read();
  // Another server: found at its default address; a wrong address is refused before anything is sent.
  await clickOn('.ai-settings label.field > span');
  await pressKey('Down');
  await waitForStatus('Připojeno');
  const other = await read();
  // The button also asks the model a short question, so the user sees it answer.
  await clickOn('.ai-test');
  await waitForStatus('odpověděl');
  const answered = await read();
  await clickOn('.ai-url');
  await pressKey('A', ['control']);
  await typeText('ftp://server');
  await clickOn('.ai-test');
  await waitForStatus('http://');
  const wrongUrl = await read();
  // What the dialog showed at each step, for finding a failed check.
  await writeFile(picture.replace(/[.]png$/, '-ai-settings.json'), JSON.stringify({ off, claude, bad, good, reopened, forgotten, local, absent, other, answered, wrongUrl }, null, 2));
  await pressKey('Escape');
  await pause(300);

  return (
    beforeOn === 0 && !menuOff &&
    off.provider === 'none' && !off.keyField &&
    claude.provider === 'anthropic' && claude.model === 'claude-opus-5-5' && claude.keyField &&
    bad.status.includes('nepřijal') &&
    good.status.includes('Dostupné modely: 2') && good.models.includes('claude-smoke-1') && good.keyValue === '' && good.forget &&
    saved.includes('"provider":"anthropic"') && sealed &&
    reopened.provider === 'anthropic' && reopened.keyPlaceholder.startsWith('klíč je zadán') && reopened.forget &&
    !forgotten.forget && forgotten.keyPlaceholder === '' &&
    local.provider === 'lmstudio' && !local.keyField && local.model === 'local-smoke-7b' && !local.models.includes('text-embedding-smoke') && local.status.includes('Dostupné modely: 1') &&
    local.providers.some((p) => p.startsWith('LM Studio') && p.includes('běží')) && local.providers.some((p) => p.startsWith('Ollama') && !p.includes('běží')) &&
    absent.provider === 'ollama' && absent.status.includes('Ollama v tomto počítači neběží') &&
    other.provider === 'server' && other.model === 'local-smoke-7b' && other.url === 'http://127.0.0.1:8080/v1' && other.providers.some((p) => p.startsWith('Jiný server') && p.includes('běží')) &&
    answered.status.includes('local-smoke-7b odpověděl') && answered.status.includes('„OK“') &&
    wrongUrl.url === 'ftp://server' && wrongUrl.status.includes('musí začínat http://')
  );
}

/**
 * A hidden window does not paint: it is shown fully transparent, with mouse
 * clicks passing through it, just for the picture.
 */
async function takePicture(path: string): Promise<void> {
  smokeWindow!.setOpacity(0);
  smokeWindow!.setIgnoreMouseEvents(true);
  smokeWindow!.showInactive();
  smokeWindow!.webContents.invalidate();
  await pause(800);
  const image = await smokeWindow!.webContents.capturePage();
  smokeWindow!.hide();
  await writeFile(path, image.toPNG());
}

/** Hidden window with the printout; no preload, no scripts needed. */
async function printWindow(html: string): Promise<BrowserWindow> {
  // A printout with pages by sections lays out its pages with a script of its own: only then
  // scripts run, and its policy lets in that one script alone (by its nonce).
  const paged = html.includes('data-paged-flow=');
  const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: paged } });
  await printer.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`);
  if (paged) {
    // Printed once the pages are laid out (the pictures decoded first), or after ten seconds as they are.
    for (let waited = 0; waited < 10000; waited += 100) {
      if ((await printer.webContents.executeJavaScript('document.documentElement.dataset.paged ?? ""')) !== '') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return printer;
}

// Ubuntu 23.10 and newer (AppArmor) forbid the user namespaces Chromium's sandbox needs.
// An AppImage cannot bring its own AppArmor profile or a setuid helper, so it would not
// start at all: there it runs without that sandbox. The .deb package keeps the sandbox.
if (process.platform === 'linux' && process.env['APPIMAGE'] && userNamespacesRestricted()) app.commandLine.appendSwitch('no-sandbox');

// On Linux the window goes through X11 (XWayland on Wayland desktops): under Wayland without
// a usable GPU, as in a virtual machine without 3D, it never showed (Ubuntu 26.04 in VMware).
// --ozone-platform=wayland given by the user still wins. In a virtual machine Chromium draws
// without the GPU, which there fails (VMware: "No 3D enabled").
if (process.platform === 'linux') {
  if (!app.commandLine.hasSwitch('ozone-platform')) app.commandLine.appendSwitch('ozone-platform', 'x11');
  if (virtualMachine()) app.disableHardwareAcceleration();
}

/** VMware, VirtualBox, QEMU/KVM, Hyper-V, Parallels: by the vendor of the system the firmware reports. */
function virtualMachine(): boolean {
  try {
    const vendor = ['sys_vendor', 'product_name'].map((f) => readFileSync(`/sys/class/dmi/id/${f}`, 'utf8')).join(' ');
    return /vmware|virtualbox|innotek|qemu|kvm|bochs|parallels|microsoft corporation virtual|hyper-v/i.test(vendor);
  } catch {
    return false;
  }
}

function userNamespacesRestricted(): boolean {
  try {
    return readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1';
  } catch {
    return false;
  }
}

// One running instance: double-clicking another .kalk file opens it there.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const window = targetWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    // A window never shown (its first paint was not reported) shows now, where the user looks for it.
    if (!window.isVisible()) window.show();
    window.focus();
    const path = sheetArgument(argv);
    if (path) void sendOpen(path);
  });
  app.on('open-file', (event, path) => {
    // macOS delivers files this way.
    event.preventDefault();
    if (editors.size > 0) void sendOpen(path);
    else pendingOpen = path;
  });

  void app.whenReady().then(() => {
    startupMark('ready');
    Menu.setApplicationMenu(null); // the editor has its own menus, toolbars and shortcuts
    registerBridge();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
