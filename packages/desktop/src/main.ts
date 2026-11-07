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

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell, utilityProcess, type IpcMainInvokeEvent } from 'electron';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { registerAiBridge } from './ai.js';
import { allowCallStacks, enableCallStacks, registerDiagnostics, watchWindow, type HangWords } from './diagnostics.js';
import { registerTheoryBridge } from './theory.js';
import { systemFonts } from './fonts.js';
import { pyodidePlace, PYTHON_PRELUDE, runPyodide, runSystemPython, scriptExcerpt, setPyodideLauncher, stopPyodide } from './python.js';

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
  save: string;
  discard: string;
  cancel: string;
  /** Words of the menu of the right button over text, in the language of the editor. */
  textMenu?: { cut: string; copy: string; paste: string; selectAll: string };
  /** What the window asks when its editor hangs. */
  hang?: HangWords;
}

/**
 * Editor windows by their web contents, each with its own close guard and the
 * files it has open. A file is open in one window at most: two copies would
 * overwrite each other's changes.
 */
/**
 * The editor windows: the files each has open (as it says), and the files this process gave it (opened or saved
 * through it): only into those it saves without a dialog, only next to those it looks for theory.
 */
const editors = new Map<number, { readonly window: BrowserWindow; readonly guard: CloseGuard; files: Set<string>; readonly granted: Set<string> }>();
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

// Only from the source: the test skips the questions the user answers (Python of the computer among them), so a
// packaged program does not listen to it; smoke.ts is not even in the package (scripts/packaged-check.mjs checks both).
const smokeTest = app.isPackaged ? undefined : process.env['KALKETA_SMOKE_TEST'];
/** Errors of the page during the smoke test: a failed step then says why. */
const smokeConsole: string[] = [];
/** Web addresses the smoke test clicked, instead of opening them in the browser. */
const openedLinks: string[] = [];
/** The smoke test's export to PDF: where it goes, and the page numbers the printout laid out. */
const smokePdf: { path?: string | undefined; pages?: string[] | undefined } = {};
/** The smoke test saves a new file where it says, without the dialog, and answers the question on closing a window. */
const smokeSave: { path?: string | undefined } = {};
const smokeClose: { choice?: number | undefined } = {};

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
/** The file keeping the folder of the calculation opened or saved last: open and save dialogs start there. */
const lastFolderFile = () => join(app.getPath('userData'), 'last-folder.json');

function lastFolder(): string | undefined {
  try {
    const folder = (JSON.parse(readFileSync(lastFolderFile(), 'utf8')) as { folder?: unknown }).folder;
    return typeof folder === 'string' && existsSync(folder) ? folder : undefined;
  } catch {
    return undefined;
  }
}

function rememberFolder(path: string): void {
  try {
    writeFileSync(lastFolderFile(), JSON.stringify({ folder: dirname(resolve(path)) }));
  } catch {
    // Not kept: the dialogs start where the system says.
  }
}

/** Where a dialog starts: in the last folder, with the suggested name when there is one. */
function inLastFolder(name?: string): { defaultPath?: string } {
  const folder = lastFolder();
  return folder ? { defaultPath: name ? join(folder, name) : folder } : name ? { defaultPath: name } : {};
}

/** File given on the command line or by double click, before the window was ready. */
let pendingOpen: string | undefined = sheetArgument(process.argv);

// The smoke test runs with a fresh profile, so it neither sees nor changes the
// user's toolbars, language or recent files.
if (smokeTest) app.setPath('userData', mkdtempSync(join(tmpdir(), 'kalketa-smoke-')));
// A profile of its own, to measure or try a start beside a running Kalketa.
else if (process.env['KALKETA_USER_DATA']) app.setPath('userData', process.env['KALKETA_USER_DATA']);

function editorEntry(): { url?: string; file?: string } {
  // Only from the source: a page loaded here has the bridge of the program, so a packaged program loads its own editor alone.
  const devUrl = app.isPackaged ? undefined : process.env['KALKETA_DEV_URL'];
  if (devUrl) return { url: devUrl };
  return { file: app.isPackaged ? join(process.resourcesPath, 'editor', 'index.html') : join(HERE, '../../editor/dist/index.html') };
}

/** Opens an editor window; `blank` starts it with an empty calculation instead of the example. */
// Call stacks of a hanging editor need this switch before the program is ready.
enableCallStacks();

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
      // The smoke test drives a hidden window: it is to take its input as a shown one does, move by move.
      ...(smokeTest ? { backgroundThrottling: false } : {}),
    },
  });
  const contentsId = win.webContents.id;
  const guard: CloseGuard = { dirty: false, message: '', save: 'Save', discard: "Don't save", cancel: 'Cancel' };
  editors.set(contentsId, { window: win, guard, files: new Set(), granted: new Set() });
  lastFocused = win;
  win.on('focus', () => (lastFocused = win));
  // A hanging editor: where it hangs goes to logs/hang.log, the user may wait or reload it (docs: diagnostics.ts).
  watchWindow(win, () => guard.hang, !smokeTest);
  // The right button over text (the question to the AI, a field of a dialog, a line being edited, text marked):
  // cut, copy, paste, select all. Where the editor has a menu of its own, it keeps it (the page prevents this one).
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText.trim()) return;
    const words = guard.textMenu ?? { cut: 'Cu&t', copy: '&Copy', paste: '&Paste', selectAll: 'Select &all' };
    const flags = params.editFlags;
    Menu.buildFromTemplate([
      ...(params.isEditable ? [{ label: words.cut, role: 'cut' as const, enabled: flags.canCut }] : []),
      { label: words.copy, role: 'copy' as const, enabled: flags.canCopy },
      ...(params.isEditable ? [{ label: words.paste, role: 'paste' as const, enabled: flags.canPaste }] : []),
      { type: 'separator' as const },
      { label: words.selectAll, role: 'selectAll' as const, enabled: flags.canSelectAll },
    ]).popup({ window: win });
  });
  win.on('closed', () => {
    editors.delete(contentsId);
    if (lastFocused === win) lastFocused = [...editors.values()].at(-1)?.window;
  });

  // The window only ever shows the editor; links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // The smoke test only notes the address it clicked; it opens no browser.
    if (smokeTest) openedLinks.push(url);
    else if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  // Unsaved documents: Save (the page saves them, then closes the window), Don't save, or Cancel.
  win.on('close', (event) => {
    if (!guard.dirty) return;
    const choice =
      smokeClose.choice ??
      dialog.showMessageBoxSync(win, {
        type: 'warning',
        title: 'Kalketa',
        message: guard.message,
        buttons: [guard.save, guard.discard, guard.cancel],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
    if (choice === 1) return;
    event.preventDefault();
    if (choice === 0) win.webContents.send('kalketa:save-and-close');
  });

  if (smokeTest && !smokeWindow) {
    smokeWindow = win;
    // Errors of the page go into the result: a failed step then says why.
    win.webContents.on('console-message', (details) => {
      if (details.level === 'error') smokeConsole.push(details.message.slice(0, 300));
    });
    win.webContents.once('did-finish-load', () => {
      void import('./smoke.js').then(({ runSmokeTest }) =>
        runSmokeTest(smokeTest, {
          window: win,
          openedLinks,
          pdf: smokePdf,
          save: smokeSave,
          close: smokeClose,
          console: smokeConsole,
          editors,
          sendOpen,
          printWindow,
          lastFolder,
          focus: (window) => (lastFocused = window),
        }),
      );
    });
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
  const editor = editors.get(window.webContents.id);
  editor?.files.add(fileKey(path));
  editor?.granted.add(fileKey(path));
  rememberFolder(path);
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

/** Whether this process gave the window that file: opened by it, or saved where the user chose. */
function grantedTo(event: IpcMainInvokeEvent, path: unknown): path is string {
  return typeof path === 'string' && path !== '' && !!editors.get(event.sender.id)?.granted.has(fileKey(path));
}

function registerBridge(): void {
  ipcMain.handle('kalketa:open-dialog', async (event, labels: { sheets: string }) => {
    const owner = fromEditor(event);
    const result = await dialog.showOpenDialog(owner, {
      ...inLastFolder(),
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
    // A file from before the rename (.calc) is saved where it is; new files get .kalk. Without a dialog only into a
    // file this process gave the window: a path the page made up gets the dialog.
    let path = grantedTo(event, request.path) && ['.kalk', '.calc'].includes(extname(request.path).toLowerCase()) ? request.path : undefined;
    if (!path) {
      const result = smokeSave.path
        ? { canceled: false, filePath: smokeSave.path }
        : await dialog.showSaveDialog(owner, {
            ...inLastFolder(`${request.suggestedName}.kalk`),
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
    if (!(request.bytes instanceof Uint8Array)) throw new Error('Bad request');
    await writeFile(path, request.bytes);
    editors.get(event.sender.id)?.files.add(fileKey(path));
    editors.get(event.sender.id)?.granted.add(fileKey(path));
    rememberFolder(path);
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
          ...inLastFolder(`${request.suggestedName}.pdf`),
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

  // The documents of the window saved after Save on closing: it closes now, asking no more.
  ipcMain.on('kalketa:close-window', (event) => {
    const editor = editors.get(event.sender.id);
    if (!editor) return;
    editor.guard.dirty = false;
    editor.window.close();
  });

  ipcMain.on('kalketa:close-guard', (event, guard: CloseGuard) => {
    const editor = editors.get(event.sender.id);
    if (!editor) return;
    editor.guard.dirty = Boolean(guard?.dirty);
    editor.guard.message = String(guard?.message ?? '');
    editor.guard.save = String(guard?.save ?? 'Save');
    editor.guard.discard = String(guard?.discard ?? "Don't save");
    editor.guard.cancel = String(guard?.cancel ?? 'Cancel');
    const words = (o: unknown, keys: readonly string[]) => (o && typeof o === 'object' && keys.every((k) => typeof (o as Record<string, unknown>)[k] === 'string') ? o : undefined);
    const menu = words(guard?.textMenu, ['cut', 'copy', 'paste', 'selectAll']);
    if (menu) editor.guard.textMenu = menu as NonNullable<CloseGuard['textMenu']>;
    const hang = words(guard?.hang, ['message', 'wait', 'reload']);
    if (hang) editor.guard.hang = hang as HangWords;
  });

  // Each window tells which files it has open (after opening, saving as, closing).
  ipcMain.on('kalketa:open-files', (event, paths: unknown) => {
    const editor = editors.get(event.sender.id);
    if (!editor || !Array.isArray(paths)) return;
    editor.files = new Set(paths.filter((p): p is string => typeof p === 'string').map(fileKey).filter((key) => editor.granted.has(key)));
  });

  ipcMain.handle('kalketa:system-fonts', async (event) => {
    fromEditor(event);
    return systemFonts();
  });

  // The text of the clipboard (rows copied in a calculation, for Ctrl+V outside a line): the page may not read it itself.
  ipcMain.handle('kalketa:clipboard-text', (event) => {
    fromEditor(event);
    return clipboard.readText();
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
  registerDiagnostics(fromEditor);
  registerTheoryBridge(fromEditor, grantedTo);
  // A check of the calculation in Python: the built-in one (no files, no network) or, chosen in the settings and
  // confirmed in the editor before each run, Python of the computer. The editor puts result() before the script.
  ipcMain.handle('kalketa:python-run', async (event, request: { code: unknown; engine: unknown; ask?: { message?: unknown; run?: unknown; cancel?: unknown; more?: unknown } }) => {
    const owner = fromEditor(event);
    if (typeof request?.code !== 'string' || request.code.length > 200_000) throw new Error('Not a script');
    // The prelude (result()) is put before the script here, so the script shown is all that runs besides it.
    const script = `${PYTHON_PRELUDE}\n${request.code}`;
    if (request.engine === 'system') {
      // Python of the computer reaches files and the network: the user agrees to each script, asked by this
      // process (not by the page), the script itself shown. The words come from the editor in the user's language.
      const ask = request.ask ?? {};
      const word = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.slice(0, 400) : fallback);
      if (!smokeTest) {
        const { response } = await dialog.showMessageBox(owner, {
          type: 'warning',
          title: 'Kalketa',
          message: word(ask.message, 'Run the script in the Python of this computer? It can reach your files and the network.'),
          detail: scriptExcerpt(request.code, word(ask.more, '… {n} more lines')),
          buttons: [word(ask.run, 'Run'), word(ask.cancel, 'Cancel')],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        if (response !== 0) return { ok: false, stdout: '', stderr: '', declined: true, engine: 'system', ms: 0 };
      }
      return runSystemPython(script);
    }
    return runPyodide(script, pyodidePlace(app.isPackaged ? process.resourcesPath : undefined));
  });
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
// Drawing without the GPU on request (KALKETA_SOFTWARE_RENDERING=1): a way out where the GPU misbehaves,
// and the way to see the program as it runs in a virtual machine.
if (process.env['KALKETA_SOFTWARE_RENDERING'] === '1') app.disableHardwareAcceleration();

/** VMware, VirtualBox, QEMU/KVM, Hyper-V, Parallels: by the vendor of the system the firmware reports. */
function virtualMachine(): boolean {
  try {
    // Each file ends with a line break: trimmed, "Microsoft Corporation" and "Virtual Machine" meet as one phrase.
    const vendor = ['sys_vendor', 'product_name'].map((f) => readFileSync(`/sys/class/dmi/id/${f}`, 'utf8').trim()).join(' ');
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
    allowCallStacks();
    startupMark('ready');
    Menu.setApplicationMenu(null); // the editor has its own menus, toolbars and shortcuts
    registerBridge();
    // The built-in Python runs in a utility process of its own: whatever a script does there stays out of this process.
    setPyodideLauncher((script) => {
      const child = utilityProcess.fork(script, [], { serviceName: 'Kalketa Python', execArgv: ['--max-old-space-size=1024'], stdio: 'ignore' });
      return {
        postMessage: (m) => child.postMessage(m),
        onMessage: (l) => child.on('message', l),
        onExit: (l) => child.on('exit', l),
        kill: () => void child.kill(),
      };
    });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => void stopPyodide());
}
