/**
 * A calculation for an AI in a chat window as a file, and a small window holding it: the user drags the file from
 * there into ChatGPT, Claude.ai or Gemini (docs/navrhy/AI-Z-CHATU.md). The file lies in a folder of its own in the
 * temporary files; the window stays on top so it can be dragged from over the browser.
 */

import { app, BrowserWindow, ipcMain, nativeImage, shell, type IpcMainInvokeEvent } from 'electron';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface AiExportRequest {
  readonly name: string;
  readonly text: string;
  readonly labels: { readonly title: string; readonly hint: string; readonly folder: string };
}

/** The window of the last export and its file: one at a time. */
let dragWindow: BrowserWindow | undefined;
let dragFile: string | undefined;
let dragIcon: Electron.NativeImage | undefined;

/** A file name of the title: no characters a file system refuses, not too long. */
function fileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Kalketa';
  return `${base}.md`;
}

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Registers the export: `fromEditor` checks the request comes from an editor window. In the smoke test the window
 * is opened all the same; the drag itself is the operating system's and is not tested there.
 */
export function registerAiExport(fromEditor: (event: IpcMainInvokeEvent) => BrowserWindow): void {
  ipcMain.handle('kalketa:ai-export', async (event, request: AiExportRequest) => {
    const owner = fromEditor(event);
    if (typeof request?.name !== 'string' || typeof request.text !== 'string' || !request.labels) throw new Error('Bad request');
    const folder = join(tmpdir(), 'Kalketa pro AI');
    await mkdir(folder, { recursive: true });
    const path = join(folder, fileName(request.name));
    await writeFile(path, request.text, 'utf8');
    dragFile = path;
    const icon = await app.getFileIcon(path, { size: 'large' });
    dragIcon = await app.getFileIcon(path, { size: 'normal' });
    const nonce = randomBytes(16).toString('base64');
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'">
<title>${esc(request.labels.title)}</title>
<style>
body { margin: 0; font: 13px system-ui, sans-serif; background: #fff; color: #222; user-select: none; }
.file { display: flex; align-items: center; gap: 10px; margin: 12px; padding: 10px; border: 1px dashed #999; border-radius: 6px; cursor: grab; }
.file:active { cursor: grabbing; }
.file img { width: 32px; height: 32px; }
.name { font-weight: 600; word-break: break-all; }
.hint { margin: 0 12px; color: #555; }
a { display: inline-block; margin: 8px 12px; color: #1a5fb4; cursor: pointer; }
</style></head><body>
<div class="file" id="file" draggable="true"><img src="${icon.toDataURL()}" alt=""><span class="name">${esc(fileName(request.name))}</span></div>
<p class="hint">${esc(request.labels.hint)}</p>
<a id="folder">${esc(request.labels.folder)}</a>
<script nonce="${nonce}">
document.getElementById('file').addEventListener('dragstart', (e) => { e.preventDefault(); window.kalketaDrag.start(); });
document.getElementById('folder').addEventListener('click', () => window.kalketaDrag.folder());
</script>
</body></html>`;
    dragWindow?.destroy();
    dragWindow = new BrowserWindow({
      width: 340,
      height: 190,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      title: request.labels.title,
      show: false,
      webPreferences: { preload: join(HERE, 'dragPreload.cjs'), sandbox: true, contextIsolation: true },
    });
    dragWindow.setMenu(null);
    // Beside the editor at its right top corner, so the browser beside it stays free.
    const bounds = owner.getBounds();
    dragWindow.setPosition(Math.max(0, bounds.x + bounds.width - 360), bounds.y + 80);
    dragWindow.on('closed', () => (dragWindow = undefined));
    // The script of the page is only the two listeners above; inline, as the page is a data URL.
    await dragWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    dragWindow.show();
    return path;
  });

  ipcMain.on('kalketa:drag-start', (event) => {
    if (!dragWindow || event.sender !== dragWindow.webContents || !dragFile) return;
    // At once, while the mouse drags: the icon was made with the file.
    event.sender.startDrag({ file: dragFile, icon: dragIcon && !dragIcon.isEmpty() ? dragIcon : nativeImage.createEmpty() });
  });
  ipcMain.on('kalketa:drag-folder', (event) => {
    if (dragWindow && event.sender === dragWindow.webContents && dragFile) shell.showItemInFolder(dragFile);
  });
}

/** For the smoke test: the window of the last export, if open. */
export function aiExportWindow(): BrowserWindow | undefined {
  return dragWindow && !dragWindow.isDestroyed() ? dragWindow : undefined;
}
