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

contextBridge.exposeInMainWorld('kalketaDesktop', {
  openDialog: (labels: { sheets: string }): Promise<OpenedFile | undefined> => ipcRenderer.invoke('kalketa:open-dialog', labels),
  openPath: (path: string): Promise<OpenedFile | undefined> => ipcRenderer.invoke('kalketa:open-path', path),
  save: (request: { path?: string; current?: string; suggestedName: string; bytes: Uint8Array; openElsewhere?: string }): Promise<string | undefined> => ipcRenderer.invoke('kalketa:save', request),
  print: (html: string): Promise<boolean> => ipcRenderer.invoke('kalketa:print', html),
  exportPdf: (request: { html: string; suggestedName: string }): Promise<string | undefined> => ipcRenderer.invoke('kalketa:export-pdf', request),
  newWindow: (): Promise<void> => ipcRenderer.invoke('kalketa:new-window'),
  setCloseGuard: (guard: { dirty: boolean; message: string; discard: string; cancel: string }): void => ipcRenderer.send('kalketa:close-guard', guard),
  setOpenFiles: (paths: string[]): void => ipcRenderer.send('kalketa:open-files', paths),
  onShowFile: (listener: (path: string) => void): void => {
    ipcRenderer.on('kalketa:show-file', (_event, path: string) => listener(path));
  },
  clipboardPictures: (): Promise<{ name: string; type: string; bytes: Uint8Array }[]> => ipcRenderer.invoke('kalketa:clipboard-pictures'),
  aiPolicy: (): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-policy'),
  aiKeyState: (provider: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-key-state', provider),
  aiSetKey: (request: { provider: string; key: string; remember: boolean }): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-set-key', request),
  aiForgetKey: (provider: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-forget-key', provider),
  aiTest: (provider: string, url?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-test', provider, url),
  aiDiscover: (): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-discover'),
  aiChat: (ask: unknown): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-chat', ask),
  theoryList: (sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-list', sheetPath),
  theoryRead: (path: string, sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-read', { path, sheetPath }),
  theorySave: (request: { folder: string; sheetPath?: string; title: string; bytes: Uint8Array; replace?: boolean }): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-save', request),
  theoryFolders: (sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-folders', sheetPath),
  aiChatCancel: (id: string): Promise<void> => ipcRenderer.invoke('kalketa:ai-chat-cancel', id),
  onAiChatEvent: (listener: (piece: { id: string; text?: string; thinking?: boolean }) => void): void => {
    ipcRenderer.on('kalketa:ai-chat-event', (_event, piece: { id: string; text?: string; thinking?: boolean }) => listener(piece));
  },
  aiTry: (provider: string, model: string, url?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-try', provider, model, url),
  onOpenFile: (listener: (file: OpenedFile) => void): void => {
    ipcRenderer.on('kalketa:open-file', (_event, file: OpenedFile) => listener(file));
  },
});
