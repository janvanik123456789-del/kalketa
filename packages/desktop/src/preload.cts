/**
 * The bridge between the editor and the desktop application. Everything the
 * editor may do outside its window is listed here; nothing else is exposed.
 */

import { contextBridge, ipcRenderer } from 'electron';

interface OpenedFile {
  readonly path: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

contextBridge.exposeInMainWorld('calccanvasDesktop', {
  openDialog: (labels: { sheets: string }): Promise<OpenedFile | undefined> => ipcRenderer.invoke('calccanvas:open-dialog', labels),
  openPath: (path: string): Promise<OpenedFile | undefined> => ipcRenderer.invoke('calccanvas:open-path', path),
  save: (request: { path?: string; suggestedName: string; bytes: Uint8Array }): Promise<string | undefined> => ipcRenderer.invoke('calccanvas:save', request),
  print: (html: string): Promise<boolean> => ipcRenderer.invoke('calccanvas:print', html),
  exportPdf: (request: { html: string; suggestedName: string }): Promise<string | undefined> => ipcRenderer.invoke('calccanvas:export-pdf', request),
  setCloseGuard: (guard: { dirty: boolean; message: string; discard: string; cancel: string }): void => ipcRenderer.send('calccanvas:close-guard', guard),
  onOpenFile: (listener: (file: OpenedFile) => void): void => {
    ipcRenderer.on('calccanvas:open-file', (_event, file: OpenedFile) => listener(file));
  },
});
