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
    const printer = await printWindow('<!doctype html><meta charset="utf-8"><h1>CalcCanvas</h1><math><mfrac><mi>a</mi><mn>2</mn></mfrac></math>');
    const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true });
    printer.destroy();
    await writeFile(pdfPath, pdf);
    ok =
      state.bridge && state.menus === 6 && state.toolbars > 0 && state.rows > 10 && state.summary > 0 && state.math > 0 && reshapedColumns === 3 && pdf.length > 1000;
    console.log(JSON.stringify({ ok, ...state, reshapedColumns, pdfBytes: pdf.length }));
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
