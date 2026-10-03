/**
 * Kalketa desktop application (Electron main process).
 *
 * Each window shows the editor (packages/editor); Window > New window opens
 * another one, e.g. to compare two calculations on two monitors. The editor
 * has no access to Node or the disk; it gets a small, fixed set of functions
 * through the preload bridge: open and save files, print, export PDF, a new
 * window, and a guard against closing with unsaved changes.
 */

import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, shell, type IpcMainInvokeEvent } from 'electron';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';

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
      layers.newKeepsExample && layers.tabs === 4 && layers.used === 1 && layers.errors === 0 && layers.citations === 1 && layers.aiReadOnly && layers.multi && layers.functions && layers.solved && layers.ownUnits && layers.complex && layers.finance && layers.money && layers.rod && layers.calculus && layers.matrices && layers.charts && layers.functionBar && layers.revisions && layers.roots && layers.toolIcons && layers.licences && layers.help && layers.pictures && layers.blocksOk !== false && layers.mainHidden && layers.twoLayers === 'layer3 layer4' && /^main:\d+ layer\d+\*:\d+$/.test(layers.split) && layers.addKinds === 3 && !layers.aiDeletable && layers.aiMenu > 2 && layers.tableStrip && !layers.aiTabWhileEmpty && !layers.aiTabAfterClose && layers.q.includes('16,73');
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
  await clickOn('.notes-text');
  await typeText('> ČSN EN 1990, tab. A1.2(B)');
  const citations = (await contents.executeJavaScript(`document.querySelectorAll('.notes blockquote.citation').length`)) as number;
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
  return { ...state, newKeepsExample, citations, split, mainHidden, twoLayers, addKinds, tableStrip, aiTabWhileEmpty, aiTabAfterClose, second, firstKept, documents, newWindow, oneCopy, multi, userFunction, functions, solved, ownUnits, complex, finance, money, rod, calculus, matrices, charts, chartTip, functionBar, templateLine, revisions, roots, toolIcons, cubeLine, rootLine, frozen, verifiedText, statusAfterFreeze, statusDraft, footerDraft, comparedText, licences, aiReadOnly, aiDeletable, aiMenu, help, pasted, resized, dropped, fileCopied, pastedIdle, shownAfterPaste, pictureMenu, sideGroup, widened, movedPicture, wrapped, cleared, unwrapped, canvasOk, besideText, pictures, blocksOk };
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
