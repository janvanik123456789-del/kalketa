/**
 * CalcCanvas desktop application (Electron main process).
 *
 * The window shows the editor (packages/editor). The editor has no access to
 * Node or the disk; it gets a small, fixed set of functions through the
 * preload bridge: open and save files, print, export PDF, and a guard against
 * closing with unsaved changes.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import { mkdtempSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEET_EXTENSIONS = ['.calc', '.cc'];

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

let window: BrowserWindow | undefined;
const closeGuard: CloseGuard = { dirty: false, message: '', discard: 'Discard', cancel: 'Cancel' };
/** File given on the command line or by double click, before the window was ready. */
let pendingOpen: string | undefined = sheetArgument(process.argv);

// The smoke test runs with a fresh profile, so it neither sees nor changes the
// user's toolbars, language or recent files.
if (process.env['CALCCANVAS_SMOKE_TEST']) app.setPath('userData', mkdtempSync(join(tmpdir(), 'calccanvas-smoke-')));

function editorEntry(): { url?: string; file?: string } {
  const devUrl = process.env['CALCCANVAS_DEV_URL'];
  if (devUrl) return { url: devUrl };
  return { file: app.isPackaged ? join(process.resourcesPath, 'editor', 'index.html') : join(HERE, '../../editor/dist/index.html') };
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'CalcCanvas',
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
  Menu.setApplicationMenu(null); // the editor has its own toolbar and shortcuts

  // The window only ever shows the editor; links open in the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  window.on('close', (event) => {
    if (!closeGuard.dirty || !window) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: closeGuard.message,
      buttons: [closeGuard.discard, closeGuard.cancel],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice !== 0) event.preventDefault();
  });

  const smokeTest = process.env['CALCCANVAS_SMOKE_TEST'];
  if (smokeTest) window.webContents.once('did-finish-load', () => void runSmokeTest(smokeTest));
  else window.once('ready-to-show', () => window?.show());
  window.webContents.once('did-finish-load', () => {
    if (pendingOpen) {
      void sendOpen(pendingOpen);
      pendingOpen = undefined;
    }
  });

  // The editor starts in the language of the operating system (until the user picks another).
  const lang = (app.getPreferredSystemLanguages()[0] ?? app.getLocale()).slice(0, 2);
  const entry = editorEntry();
  if (entry.url) void window.loadURL(`${entry.url}?lang=${encodeURIComponent(lang)}`);
  else void window.loadFile(entry.file!, { query: { lang } });
}

async function sendOpen(path: string): Promise<void> {
  try {
    window?.webContents.send('calccanvas:open-file', await readSheet(path));
  } catch (err) {
    dialog.showErrorBox('CalcCanvas', `${path}\n${(err as Error).message}`);
  }
}

async function readSheet(path: string): Promise<OpenedFile> {
  return { path, name: basename(path), bytes: new Uint8Array(await readFile(path)) };
}

function sheetArgument(argv: readonly string[]): string | undefined {
  return argv.slice(1).find((arg) => SHEET_EXTENSIONS.includes(extname(arg).toLowerCase()));
}

/** Only the editor's own window may call the bridge. */
function fromEditor(event: IpcMainInvokeEvent): BrowserWindow {
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (!sender || sender !== window) throw new Error('Unknown sender');
  return sender;
}

function registerBridge(): void {
  ipcMain.handle('calccanvas:open-dialog', async (event, labels: { sheets: string }) => {
    const owner = fromEditor(event);
    const result = await dialog.showOpenDialog(owner, {
      properties: ['openFile'],
      filters: [{ name: String(labels?.sheets ?? 'CalcCanvas'), extensions: ['calc', 'cc'] }],
    });
    const path = result.filePaths[0];
    return result.canceled || !path ? undefined : readSheet(path);
  });

  // Recent files: only sheet files can be opened this way.
  ipcMain.handle('calccanvas:open-path', async (event, path: unknown) => {
    fromEditor(event);
    if (typeof path !== 'string' || !SHEET_EXTENSIONS.includes(extname(path).toLowerCase())) return undefined;
    try {
      return await readSheet(path);
    } catch {
      return undefined;
    }
  });

  ipcMain.handle('calccanvas:save', async (event, request: { path?: string; suggestedName: string; bytes: Uint8Array }) => {
    const owner = fromEditor(event);
    let path = typeof request.path === 'string' && extname(request.path).toLowerCase() === '.calc' ? request.path : undefined;
    if (!path) {
      const result = await dialog.showSaveDialog(owner, {
        defaultPath: `${request.suggestedName}.calc`,
        filters: [{ name: 'CalcCanvas', extensions: ['calc'] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      path = result.filePath;
    }
    await writeFile(path, request.bytes);
    return path;
  });

  ipcMain.handle('calccanvas:print', async (event, html: string) => {
    fromEditor(event);
    const printer = await printWindow(html);
    return new Promise<boolean>((resolve) => {
      printer.webContents.print({}, (success) => {
        printer.destroy();
        resolve(success);
      });
    });
  });

  ipcMain.handle('calccanvas:export-pdf', async (event, request: { html: string; suggestedName: string }) => {
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

  ipcMain.on('calccanvas:close-guard', (event, guard: CloseGuard) => {
    if (BrowserWindow.fromWebContents(event.sender) !== window) return;
    closeGuard.dirty = Boolean(guard?.dirty);
    closeGuard.message = String(guard?.message ?? '');
    closeGuard.discard = String(guard?.discard ?? 'Discard');
    closeGuard.cancel = String(guard?.cancel ?? 'Cancel');
  });
}

/**
 * Automated check without showing a window (CALCCANVAS_SMOKE_TEST=<pdf path>):
 * the editor loaded, the bridge is present, the example sheet evaluated, and a
 * PDF can be produced. Prints a JSON line and exits with 0 or 1.
 */
async function runSmokeTest(pdfPath: string): Promise<void> {
  let ok = false;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = (await window!.webContents.executeJavaScript(`({
      bridge: typeof window.calccanvasDesktop === 'object',
      rows: document.querySelectorAll('.row').length,
      summary: document.querySelectorAll('.summary-box tbody tr').length,
      math: document.querySelectorAll('math').length,
      errors: document.querySelector('.statusbar')?.textContent ?? '',
      menus: document.querySelectorAll('.menubar-item').length,
      toolbars: document.querySelectorAll('.toolbar-box').length,
      language: document.documentElement.lang
    })`)) as { bridge: boolean; rows: number; summary: number; math: number; errors: string; menus: number; toolbars: number; language: string };
    const reshapedColumns = await reshapeWithRealMouse();
    const layers = await layersWithRealInput(pdfPath.replace(/\.pdf$/i, '') + '-layers.png');
    const printer = await printWindow('<!doctype html><meta charset="utf-8"><h1>CalcCanvas</h1><math><mfrac><mi>a</mi><mn>2</mn></mfrac></math>');
    const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true });
    printer.destroy();
    await writeFile(pdfPath, pdf);
    ok =
      state.bridge && state.menus === 7 && state.toolbars > 0 && state.rows > 10 && state.summary > 0 && state.math > 0 && reshapedColumns === 3 && pdf.length > 1000 &&
      layers.tabs === 5 && layers.used === 1 && layers.errors === 0 && layers.citations === 1 && layers.aiReadOnly && layers.multi && layers.mainHidden && /^main:\d+ layer\d+\*:\d+$/.test(layers.split) && layers.addKinds === 3 && !layers.aiDeletable && layers.q.includes('16,73');
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
  const contents = window!.webContents;
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

async function clickOn(selector: string, modifiers: Array<'control'> = []): Promise<void> {
  const contents = window!.webContents;
  const point = (await contents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return undefined;
    element.scrollIntoView({ block: 'center' });
    const r = element.getBoundingClientRect();
    return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) };
  })()`)) as { x: number; y: number } | undefined;
  if (!point) throw new Error(`Not found: ${selector}`);
  contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1, modifiers });
  contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1, modifiers });
  await pause(150);
}

async function typeText(text: string): Promise<void> {
  for (const ch of text) window!.webContents.sendInputEvent({ type: 'char', keyCode: ch });
  await pause(150);
}

async function pressKey(keyCode: string, modifiers: Array<'control' | 'shift'> = []): Promise<void> {
  window!.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  window!.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await pause(150);
}

/**
 * Layers with real input: adds an auxiliary calculation with a load, lets the
 * sheet take it over, adds a sources layer with a citation. Saves a picture
 * of the window. Returns what the editor shows afterwards.
 */
async function layersWithRealInput(picture: string) {
  const contents = window!.webContents;
  contents.focus();
  await clickOn('.layer-tab.add'); // opens the Layers panel
  await clickOn('.layer-add button:nth-child(1)'); // auxiliary calculation
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

  await clickOn('.layer-add button:nth-child(3)'); // sources
  await pressKey('Enter'); // default name
  await clickOn('.notes-text');
  await typeText('> ČSN EN 1990, tab. A1.2(B)');
  const citations = (await contents.executeJavaScript(`document.querySelectorAll('.notes blockquote.citation').length`)) as number;
  await takePicture(picture.replace(/\.png$/, '-notes.png'));

  // AI notes can only be read: no text field, and typing changes nothing.
  await clickOn('.layer-tab[data-layer="ai"]');
  await clickOn('.notes-view.ai .notes-preview');
  await typeText('ruční zásah');
  const aiReadOnly = (await contents.executeJavaScript(
    `!!document.querySelector('.notes-view.ai') && !document.querySelector('.notes-view textarea') && !document.body.textContent.includes('ruční zásah')`,
  )) as boolean;
  await takePicture(picture.replace(/\.png$/, '-ai.png'));
  await clickOn('.layer-tab[data-layer="main"]');
  await takePicture(picture);
  const state = (await contents.executeJavaScript(`({
    tabs: document.querySelectorAll('.layer-tab:not(.add)').length,
    used: document.querySelectorAll('.layer-note').length,
    errors: Number(document.querySelector('.statusbar span')?.textContent.replace(/\\D+/g, '') ?? -1),
    addKinds: document.querySelectorAll('.layer-add button').length,
    aiDeletable: document.querySelectorAll('.layer-item[data-layer="ai"] .layer-actions button').length > 4,
    q: [...document.querySelectorAll('.row')].find((r) => r.textContent.includes('q_d'))?.textContent ?? '',
  })`)) as { tabs: number; used: number; errors: number; addKinds: number; aiDeletable: boolean; q: string };

  // Side by side: Ctrl+click on the tab of the auxiliary calculation.
  await clickOn('.layer-tab:nth-child(4)', ['control']);
  await clickOn('.layer-view:nth-child(2) .page .row');
  const split = (await contents.executeJavaScript(
    `[...document.querySelectorAll('.layer-view')].map((v) => v.dataset.layer + (v.classList.contains('active') ? '*' : '') + ':' + v.querySelectorAll('.page').length).join(' ')`,
  )) as string;
  await takePicture(picture.replace(/\.png$/, '-split.png'));

  // Work only in the layers: hide the printed sheet.
  await clickOn('.layer-item[data-layer="main"] .layer-flags input');
  const mainHidden = (await contents.executeJavaScript(
    `!document.querySelector('.layer-view[data-layer="main"], .layer-tab[data-layer="main"]') && document.querySelectorAll('.layer-view').length === 1`,
  )) as boolean;
  await takePicture(picture.replace(/\.png$/, '-nomain.png'));

  // More calculations at once: a new one in its own tab, back to the first, Ctrl+Tab, Ctrl+W.
  await clickOn('.doc-tab-new');
  const second = (await contents.executeJavaScript(
    `[document.querySelectorAll('.doc-tab').length, document.querySelectorAll('.layer-tab:not(.add)').length]`,
  )) as [number, number];
  await takePicture(picture.replace(/[.]png$/, '-docs.png'));
  await clickOn('.doc-tab:nth-child(1) .doc-tab-title');
  const firstKept = (await contents.executeJavaScript(
    `document.querySelectorAll('.layer-tab:not(.add)').length === 4 && !!document.querySelector('.doc-tab:nth-child(1).active .doc-dirty')`,
  )) as boolean;
  await pressKey('Tab', ['control']);
  await pressKey('W', ['control']);
  const documents = (await contents.executeJavaScript(`document.querySelectorAll('.doc-tab').length`)) as number;
  const multi = second[0] === 2 && second[1] === 3 && firstKept && documents === 1;
  return { ...state, citations, aiReadOnly, split, mainHidden, second, firstKept, documents, multi };
}

/**
 * A hidden window does not paint: it is shown fully transparent, with mouse
 * clicks passing through it, just for the picture.
 */
async function takePicture(path: string): Promise<void> {
  window!.setOpacity(0);
  window!.setIgnoreMouseEvents(true);
  window!.showInactive();
  window!.webContents.invalidate();
  await pause(800);
  const image = await window!.webContents.capturePage();
  window!.hide();
  await writeFile(path, image.toPNG());
}

/** Hidden window with the printout; no preload, no scripts needed. */
async function printWindow(html: string): Promise<BrowserWindow> {
  const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  await printer.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`);
  return printer;
}

// One running instance: double-clicking another .calc file opens it there.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
    const path = sheetArgument(argv);
    if (path) void sendOpen(path);
  });
  app.on('open-file', (event, path) => {
    // macOS delivers files this way.
    event.preventDefault();
    if (window) void sendOpen(path);
    else pendingOpen = path;
  });

  void app.whenReady().then(() => {
    registerBridge();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
