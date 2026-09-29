/**
 * CalcCanvas desktop application (Electron main process).
 *
 * The window shows the editor (packages/editor). The editor has no access to
 * Node or the disk; it gets a small, fixed set of functions through the
 * preload bridge: open and save files, print, export PDF, and a guard against
 * closing with unsaved changes.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
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

  const entry = editorEntry();
  if (entry.url) void window.loadURL(entry.url);
  else void window.loadFile(entry.file!);
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
      errors: document.querySelector('.status')?.textContent ?? ''
    })`)) as { bridge: boolean; rows: number; summary: number; math: number; errors: string };
    const printer = await printWindow('<!doctype html><meta charset="utf-8"><h1>CalcCanvas</h1><math><mfrac><mi>a</mi><mn>2</mn></mfrac></math>');
    const pdf = await printer.webContents.printToPDF({ preferCSSPageSize: true });
    printer.destroy();
    await writeFile(pdfPath, pdf);
    ok = state.bridge && state.rows > 10 && state.summary > 0 && state.math > 0 && pdf.length > 1000;
    console.log(JSON.stringify({ ok, ...state, pdfBytes: pdf.length }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: (err as Error).message }));
  }
  app.exit(ok ? 0 : 1);
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
