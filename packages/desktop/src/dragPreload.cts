/**
 * The bridge of the small window of an export for AI: it may only start dragging its file and show its folder.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kalketaDrag', {
  start: (): void => ipcRenderer.send('kalketa:drag-start'),
  folder: (): void => ipcRenderer.send('kalketa:drag-folder'),
});
