/**
 * The bridge between the editor and the desktop application. Everything the
 * editor may do outside its window is listed here; nothing else is exposed.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
  /** Where a file dropped on the window lies on the disk (a calculation dropped is opened from there). */
  pathOfFile: (file: File): string => webUtils.getPathForFile(file),
  /** Kalketa as an MCP server: its state and settings, and the tools the AI calls (run by the editor). */
  mcpState: (): Promise<{ on: boolean; port: number; token: string; readOnly: boolean; paused: boolean; status: 'off' | 'waiting' | 'connected' | 'busy-port' | 'error' | 'forbidden'; client?: string; address: string; stdio: { command: string; args: string[] } }> => ipcRenderer.invoke('kalketa:mcp-state'),
  mcpSet: (change: { on?: boolean; readOnly?: boolean; paused?: boolean; newToken?: boolean; port?: number }): Promise<{ on: boolean; port: number; token: string; readOnly: boolean; paused: boolean; status: 'off' | 'waiting' | 'connected' | 'busy-port' | 'error' | 'forbidden'; client?: string; address: string; stdio: { command: string; args: string[] } }> => ipcRenderer.invoke('kalketa:mcp-set', change),
  onMcpState: (listener: (state: { on: boolean; port: number; token: string; readOnly: boolean; paused: boolean; status: 'off' | 'waiting' | 'connected' | 'busy-port' | 'error' | 'forbidden'; client?: string; address: string; stdio: { command: string; args: string[] } }) => void): void => {
    ipcRenderer.on('kalketa:mcp-state', (_event, state: { on: boolean; port: number; token: string; readOnly: boolean; paused: boolean; status: 'off' | 'waiting' | 'connected' | 'busy-port' | 'error' | 'forbidden'; client?: string; address: string; stdio: { command: string; args: string[] } }) => listener(state));
  },
  onMcpCall: (listener: (call: { id: string; tool: string; args: Record<string, unknown> }) => void): void => {
    ipcRenderer.on('kalketa:mcp-call', (_event, call: { id: string; tool: string; args: Record<string, unknown> }) => listener(call));
  },
  mcpResult: (answer: { id: string; ok: boolean; text: string }): void => ipcRenderer.send('kalketa:mcp-result', answer),
  /** A step the editor takes now (reading an answer, the checks of it): the last ones go to logs/hang.log when it hangs. */
  diagStep: (step: string): void => ipcRenderer.send('kalketa:diag-step', step),
  setCloseGuard: (guard: { dirty: boolean; message: string; save?: string; discard: string; cancel: string; textMenu?: { cut: string; copy: string; paste: string; selectAll: string }; hang?: { message: string; wait: string; reload: string } }): void => ipcRenderer.send('kalketa:close-guard', guard),
  onSaveAndClose: (listener: () => void): void => {
    ipcRenderer.on('kalketa:save-and-close', () => listener());
  },
  closeWindow: (): void => ipcRenderer.send('kalketa:close-window'),
  setOpenFiles: (paths: string[]): void => ipcRenderer.send('kalketa:open-files', paths),
  onShowFile: (listener: (path: string) => void): void => {
    ipcRenderer.on('kalketa:show-file', (_event, path: string) => listener(path));
  },
  systemFonts: (): Promise<string[]> => ipcRenderer.invoke('kalketa:system-fonts'),
  clipboardPictures: (): Promise<{ name: string; type: string; bytes: Uint8Array }[]> => ipcRenderer.invoke('kalketa:clipboard-pictures'),
  clipboardText: (): Promise<string> => ipcRenderer.invoke('kalketa:clipboard-text'),
  aiPolicy: (): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-policy'),
  aiKeyState: (provider: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-key-state', provider),
  aiSetKey: (request: { provider: string; key: string; remember: boolean }): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-set-key', request),
  aiForgetKey: (provider: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-forget-key', provider),
  aiTest: (provider: string, url?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-test', provider, url),
  aiDiscover: (): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-discover'),
  aiChat: (ask: unknown): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-chat', ask),
  aiMemory: (ask: unknown): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-memory', ask),
  theoryList: (sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-list', sheetPath),
  theoryRead: (path: string, sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-read', { path, sheetPath }),
  theorySave: (request: { folder: string; sheetPath?: string; title: string; bytes: Uint8Array; replace?: boolean }): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-save', request),
  theoryFolders: (sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:theory-folders', sheetPath),
  studyRead: (path: string, sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:study-read', { path, sheetPath }),
  studySave: (path: string, sheetPath: string | undefined, settings: unknown): Promise<unknown> => ipcRenderer.invoke('kalketa:study-save', { path, sheetPath, settings }),
  studyBytes: (path: string, sheetPath?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:study-bytes', { path, sheetPath }),
  runPython: (code: string, engine: 'pyodide' | 'system', ask?: { message: string; run: string; cancel: string; more: string }): Promise<unknown> => ipcRenderer.invoke('kalketa:python-run', { code, engine, ...(ask ? { ask } : {}) }),
  aiFormula: (ask: unknown): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-formula', ask),
  aiChatCancel: (id: string): Promise<void> => ipcRenderer.invoke('kalketa:ai-chat-cancel', id),
  onAiChatEvent: (listener: (piece: { id: string; text?: string; thinking?: string; cut?: boolean }) => void): void => {
    ipcRenderer.on('kalketa:ai-chat-event', (_event, piece: { id: string; text?: string; thinking?: string; cut?: boolean; phase?: 'context' | 'summing' | 'reading'; tokens?: number }) => listener(piece));
  },
  aiTry: (provider: string, model: string, url?: string): Promise<unknown> => ipcRenderer.invoke('kalketa:ai-try', provider, model, url),
  onOpenFile: (listener: (file: OpenedFile) => void): void => {
    ipcRenderer.on('kalketa:open-file', (_event, file: OpenedFile) => listener(file));
  },
});
