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
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';
import { registerAiBridge } from './ai.js';
import { registerTheoryBridge } from './theory.js';

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
/** File given on the command line or by double click, before the window was ready. */
let pendingOpen: string | undefined = sheetArgument(process.argv);

// The smoke test runs with a fresh profile, so it neither sees nor changes the
// user's toolbars, language or recent files.
if (smokeTest) app.setPath('userData', mkdtempSync(join(tmpdir(), 'kalketa-smoke-')));

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
    win.webContents.once('did-finish-load', () => void runSmokeTest(smokeTest));
  } else if (!smokeTest) {
    win.once('ready-to-show', () => win.show());
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
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: `${request.suggestedName}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return undefined;
    const printer = await printWindow(request.html);
    try {
      // CSS @page decides the paper size, margins and page numbers.
      const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
      await writeFile(result.filePath, pdf);
    } finally {
      printer.destroy();
    }
    void shell.openPath(result.filePath);
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
      state.bridge && state.sideBySide && state.menus === 7 && state.toolbars > 0 && state.rows > 10 && state.summary > 0 && state.math > 0 && reshapedColumns === 3 && pdf.length > 1000 &&
      layers.newKeepsExample && layers.tabs === 4 && layers.used === 1 && layers.errors === 0 && layers.citations === 1 && layers.notesPicture === 'FIGURE+img BLOCKQUOTE' && layers.aiReadOnly && layers.multi && layers.functions && layers.solved && layers.ownUnits && layers.complex && layers.finance && layers.money && layers.rod && layers.calculus && layers.matrices && layers.charts && layers.functionBar && layers.revisions && layers.roots && layers.toolIcons && layers.aiSettings && layers.aiChat && layers.pdfCleanup && layers.theoryLibrary && layers.study && layers.licences && layers.help && layers.pictures && layers.blocksOk !== false && layers.mainHidden && layers.twoLayers === 'layer3 layer4' && /^main:\d+ layer\d+\*:\d+$/.test(layers.split) && layers.addKinds === 3 && !layers.aiDeletable && layers.aiMenu > 2 && layers.tableStrip && !layers.aiTabWhileEmpty && !layers.aiTabAfterClose && layers.q.includes('16,73');
    console.log(JSON.stringify({ ok, ...state, reshapedColumns, layers, pdfBytes: pdf.length }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: (err as Error).message }));
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

// Real input for the smoke test: the events go through Chromium's input
// pipeline like the user's mouse and keyboard.
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickOn(selector: string, modifiers: Array<'control'> = [], button: 'left' | 'right' = 'left'): Promise<void> {
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
  for (const ch of text) smokeWindow!.webContents.sendInputEvent({ type: 'char', keyCode: ch });
  await pause(150);
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
  await clickOn('.layer-tab.add'); // a menu of the kinds of layers
  const addKinds = (await contents.executeJavaScript(`document.querySelectorAll('.context-menu .menu-row').length`)) as number;
  await clickMenu('∑'); // auxiliary calculation
  await pressKey('A', ['control']);
  await typeText('Zatížení');
  await pressKey('Enter');
  await clickOn('.page .row');
  await typeText('q_d := 1,35·3,5 kN/m + 1,5·8 kN/m');
  await clickOn('.sheet-scroll'); // done editing

  await clickOn('.layer-tab[data-layer="main"]');
  const loadRow = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.row')].find((r) => r.textContent.includes('12') && r.textContent.includes('kN/m'))?.dataset.line`,
  )) as string | undefined;
  await clickOn(`.row[data-line="${loadRow}"]`);
  await pressKey('A', ['control']);
  await typeText('q := q_d');
  await clickOn('.sheet-scroll');

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
  })`)) as { errors: number; rows: string[] };
  await takePicture(picture.replace(/[.]png$/, '-function.png'));
  const functions = userFunction.errors === 0 && userFunction.rows.some((r) => r.includes('314,2'));
  const money = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=105Kč')) && userFunction.rows.some((r) => r.includes('10 kWp'));
  const solved = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('x=2'));
  const finance = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=2,6')) && userFunction.rows.some((r) => r.includes('29. 10. 2026'));
  const rod = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=157100mm³'));
  const calculus = userFunction.rows.some((r) => r.includes('∫') && r.replace(/\s+/g, '').endsWith('=9'));
  const matrices = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('=[0,6667;0,3333]m')) && (await contents.executeJavaScript(`!!document.querySelector('.page mtable')`)) as boolean;
  const complex = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('(27,6−36,8j)A'));
  const ownUnits = userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('100EUR=2500CZK'));
  const help = listed > 50 && userFunction.rows.some((r) => r.replace(/\s+/g, '').includes('hypot(3m;4m)=5m'));

  // Charts: Insert > Chart plots the last function of the sheet; the pointer over it reads the values.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].at(-1).id = 'smoke-last-row'`);
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
  const charts = !!chartBox && chartBox.paths > 0 && /^x = [\d,]+ \| Mt\(x\) = /.test(chartTip);

  // The Functions toolbar: ∫ writes the integral with the cursor inside, the user types the integrand.
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].at(-1).id = 'smoke-last-row'`);
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
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].at(-1).id = 'smoke-last-row'`);
  const rowOpen = (await contents.executeJavaScript(`!!document.querySelector('textarea.row-editor')`)) as boolean;
  await clickOn(rowOpen ? 'textarea.row-editor' : '#smoke-last-row');
  await pause(300);
  await pressKey('End');
  await pressKey('Enter');
  await typeText('z_r := 7 kN');
  await clickOn('.statusbar');
  await pause(1500);
  await takePicture(picture.replace(/[.]png$/, '-revisions.png'));
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
  await contents.executeJavaScript(`[...document.querySelectorAll('.layer-view.active .page .row')].at(-1).id = 'smoke-last-row'`);
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
  // Dragging the picture with the mouse moves it: from above the given values to below them.
  const grab = (await contents.executeJavaScript(`(() => {
    const img = document.querySelector('.layer-view.active .row[data-line="2"] figure img').getBoundingClientRect();
    const q = document.querySelector('.layer-view.active .row[data-line="4"]').getBoundingClientRect();
    return { x: Math.round(img.left + img.width / 2), y: Math.round(img.top + img.height / 2), tx: Math.round(q.left + q.width / 2), ty: Math.round(q.bottom + 2) };
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
  // Placement > Right, text flows around; dragged above the values, they stand beside it.
  await clickOn('.layer-view.active .row[data-line="4"] figure img');
  await clickMenu('Umístění');
  await clickMenu('Vpravo s obtékáním');
  await pause(300);
  const lift = (await contents.executeJavaScript(`(() => {
    const img = document.querySelector('.layer-view.active .row[data-line="4"] figure img').getBoundingClientRect();
    const l = document.querySelector('.layer-view.active .row[data-line="2"]').getBoundingClientRect();
    return { x: Math.round(img.left + img.width / 2), y: Math.round(img.top + img.height / 2), tx: Math.round(l.left + l.width / 2), ty: Math.round(l.top + 2) };
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
    await typeText('L = 5 m');
    await pressKey('Enter');
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
    await pressKey('Escape');
    await pause(300);
    canvasOk =
      /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+"/.test(items) && shown.includes('<rect') && shown.includes('marker-end') && shown.includes('L = 5 m') && reopened === 3 && inlineEditing && windowEditing && !(await contents.executeJavaScript(`!!document.querySelector('.canvas-window, .canvas-inline')`));
  }
  const besideText = sideGroup.rows === '3,4' && sideGroup.picture && sideGroup.side !== '' && widened > parseFloat(sideGroup.side) && movedPicture && wrapped && cleared && unwrapped && canvasOk;
  const pictures = pasted.img && resized && dropped === 'Obr. 1: Schéma nosníku' && fileCopied && pastedIdle && pictureMenu.menu >= 5 && pictureMenu.full && pictureMenu.caption.includes('Detail kotvení') && besideText;

  // Help > About > Third-party licences: the notices of the shipped packages.
  await clickOn('.menubar-item:nth-child(7) > button');
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
  return { ...state, newKeepsExample, citations, notesPicture, split, mainHidden, twoLayers, addKinds, tableStrip, aiTabWhileEmpty, aiTabAfterClose, second, firstKept, documents, newWindow, oneCopy, multi, userFunction, functions, solved, ownUnits, complex, finance, money, rod, calculus, matrices, charts, chartTip, functionBar, templateLine, revisions, roots, toolIcons, aiSettings, aiChat, pdfCleanup, theoryLibrary, study, cubeLine, rootLine, frozen, verifiedText, statusAfterFreeze, statusDraft, footerDraft, comparedText, licences, aiReadOnly, aiDeletable, aiMenu, help, pasted, resized, dropped, fileCopied, pastedIdle, shownAfterPaste, pictureMenu, sideGroup, widened, movedPicture, wrapped, cleared, unwrapped, canvasOk, besideText, pictures, blocksOk };
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
  const pages = Array.from({ length: 62 }, (_, i) => `<section style="break-after: page">${heading(i + 1)}<p>Strana ${i + 1}. ${topic(i + 1)}</p></section>`).join('');
  const printer = await printWindow(`<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Pružnost a pevnost</title></head><body>${pages}</body></html>`);
  const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true, generateTaggedPDF: true, generateDocumentOutline: true });
  printer.destroy();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'Pruznost a pevnost.pdf'), pdf);

  await clickOn('.menubar-item:nth-child(5) > button');
  await clickMenu('Studijní podklady');
  for (let i = 0; i < 80 && !(await contents.executeJavaScript(`!!document.querySelector('.study-chapters li')`)); i++) await pause(150);
  const offered = (await contents.executeJavaScript(`({
    file: document.querySelector('.study-file.active')?.textContent ?? '',
    reads: document.querySelector('.study-reads')?.textContent ?? '',
    large: !!document.querySelector('.study-advice.warn'),
    chapters: [...document.querySelectorAll('.study-chapters li')].map((l) => l.textContent),
    key: document.querySelector('.study-key')?.value ?? '',
  })`)) as { file: string; reads: string; large: boolean; chapters: string[]; key: string };
  const ohyb = offered.chapters.findIndex((c) => c.startsWith('2 Ohyb'));
  await clickOn(`.study-chapters li:nth-child(${ohyb + 1}) input`);
  await pause(200);
  const chosen = (await contents.executeJavaScript(`({ reads: document.querySelector('.study-reads')?.textContent ?? '', large: !!document.querySelector('.study-advice.warn') })`)) as { reads: string; large: boolean };
  await pause(400);
  await takePicture(picture.replace(/[.]png$/, '-study.png'));
  await clickOn('.dialog-buttons button.default');
  await pause(600);
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
  await writeFile(picture.replace(/[.]png$/, '-study.json'), JSON.stringify({ offered, chosen, card, listed, answer, cited }, null, 2));
  return (
    offered.file.startsWith('Pruznost a pevnost.pdf') && offered.file.includes('PDF, 62 s.') && offered.reads === 'AI čte 62 z 62.' && offered.large && offered.key === 'PP' &&
    offered.chapters.length === 4 && ohyb >= 0 && chosen.reads === 'AI čte 21 z 62.' && !chosen.large &&
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
  await clickOn('.menubar-item:nth-child(5) > button');
  await clickMenu('Nastavení');
  await pause(400);
  await clickOn('.ai-settings label.field > span');
  for (let i = 0; i < 3; i++) await pressKey('Down');
  for (let i = 0; i < 40 && !((await contents.executeJavaScript(`document.querySelector('.ai-status')?.textContent ?? ''`)) as string).includes('Připojeno'); i++) await pause(150);
  // Thinking depth: from "as the model decides" one down to "low".
  await clickOn('.ai-settings label.field:has(.ai-effort) > span');
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
  await writeFile(picture.replace(/[.]png$/, '-ai-chat.json'), JSON.stringify({ pasted, unpasted, typed, theory, offered, quietWhileOff, head, shown, cutOff, cleared, aiTab, layerShown, kept, resumed, proposal, paneTabs, thoughtFolded, thought }, null, 2));
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
    await clickOn('.menubar-item:nth-child(5) > button');
    await clickMenu('Nastavení');
    await pause(400);
  };
  const waitForStatus = async (text: string) => {
    for (let i = 0; i < 40 && !(await read()).status.includes(text); i++) await pause(150);
  };

  // The AI is off after the start: nothing went to any server. Tools > Switch the AI on.
  const beforeOn = await fakeRequests();
  const menuOff = (await contents.executeJavaScript(`!!document.querySelector('.side-pane .chat-pane')`)) as boolean;
  await clickOn('.menubar-item:nth-child(5) > button');
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
  const sealed = onDisk.includes('anthropic') && !onDisk.includes('sk-smoke-good');

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
  const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  await printer.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`);
  return printer;
}

// One running instance: double-clicking another .kalk file opens it there.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const window = targetWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
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
    Menu.setApplicationMenu(null); // the editor has its own menus, toolbars and shortcuts
    registerBridge();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
