/**
 * Theory libraries (.kalkt) on disk (docs/01-filozofie.md, ch. 9.6): the
 * program looks for them in three folders, in this order: next to the
 * calculation (project), the company folder named by the company rules, and
 * the user's own (Documents\Kalketa\Teorie; KALKETA_THEORY_USER_DIR points
 * elsewhere, e.g. for the smoke test). The editor reads only files from these
 * folders and writes only into them; the project folder is that of a calculation
 * the window opened or saved through the program.
 */

import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { readPolicy } from './ai.js';
import { isStudyFile, readStudyFile, readStudySettings, writeStudySettings } from './study.js';

export type TheoryFolder = 'project' | 'company' | 'user';

const EXTENSION = '.kalkt';

function userFolder(): string {
  return process.env['KALKETA_THEORY_USER_DIR'] ?? join(app.getPath('documents'), 'Kalketa', 'Teorie');
}

/** The folders searched for a calculation at `sheetPath`, in order. */
function folders(sheetPath: unknown): { kind: TheoryFolder; dir: string }[] {
  const list: { kind: TheoryFolder; dir: string }[] = [];
  if (typeof sheetPath === 'string' && sheetPath) list.push({ kind: 'project', dir: dirname(resolve(sheetPath)) });
  const company = readPolicy().theoryFolder;
  if (company) list.push({ kind: 'company', dir: resolve(company) });
  list.push({ kind: 'user', dir: userFolder() });
  return list;
}

/** A path to a library (or, with `study`, a study file) inside one of the folders, or undefined. */
function allowedPath(path: unknown, sheetPath: unknown, study = false): string | undefined {
  if (typeof path !== 'string' || !(study ? isStudyFile(path) : extname(path).toLowerCase() === EXTENSION)) return undefined;
  const full = resolve(path);
  return folders(sheetPath).some((f) => dirname(full).toLowerCase() === f.dir.toLowerCase()) ? full : undefined;
}

/** A file name from a title: letters, digits and dashes. */
function fileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'teorie'}${EXTENSION}`;
}

export function registerTheoryBridge(fromEditor: (event: IpcMainInvokeEvent) => unknown, granted: (event: IpcMainInvokeEvent, path: unknown) => boolean): void {
  // The project folder only of a calculation this window opened or saved: not any folder the page names.
  const sheetOf = (event: IpcMainInvokeEvent, sheetPath: unknown) => (granted(event, sheetPath) ? sheetPath : undefined);
  // Libraries and study files found for a calculation: where they are, not their contents.
  ipcMain.handle('kalketa:theory-list', async (event, sheetPath: unknown) => {
    fromEditor(event);
    const found: { path: string; folder: TheoryFolder; study?: true }[] = [];
    for (const f of folders(sheetOf(event, sheetPath))) {
      if (!existsSync(f.dir)) continue;
      try {
        for (const name of await readdir(f.dir)) {
          if (extname(name).toLowerCase() === EXTENSION) found.push({ path: join(f.dir, name), folder: f.kind });
          else if (isStudyFile(name)) found.push({ path: join(f.dir, name), folder: f.kind, study: true });
        }
      } catch {
        // A folder that cannot be read is left out.
      }
    }
    return found;
  });

  ipcMain.handle('kalketa:theory-read', async (event, request: { path: unknown; sheetPath?: unknown }) => {
    fromEditor(event);
    const path = allowedPath(request.path, sheetOf(event, request.sheetPath));
    if (!path) throw new Error('Not a theory library of the searched folders');
    return new Uint8Array(await readFile(path));
  });

  // Saves into one of the folders; an existing file is replaced only when the editor says so.
  ipcMain.handle('kalketa:theory-save', async (event, request: { folder: unknown; sheetPath?: unknown; title: unknown; bytes: unknown; replace?: unknown }) => {
    fromEditor(event);
    const target = folders(sheetOf(event, request.sheetPath)).find((f) => f.kind === request.folder);
    if (!target || typeof request.title !== 'string' || !(request.bytes instanceof Uint8Array)) throw new Error('Bad request');
    await mkdir(target.dir, { recursive: true });
    const path = join(target.dir, fileName(request.title));
    if (existsSync(path) && request.replace !== true) return { exists: true, path };
    await writeFile(path, request.bytes);
    return { path };
  });

  // A study file's text (read once, then from the cache) and its card.
  ipcMain.handle('kalketa:study-read', async (event, request: { path: unknown; sheetPath?: unknown }) => {
    fromEditor(event);
    const path = allowedPath(request.path, sheetOf(event, request.sheetPath), true);
    if (!path) throw new Error('Not a study file of the searched folders');
    return { content: await readStudyFile(path), settings: await readStudySettings(path) };
  });

  // The bytes of a study file, for drawing its pages in the editor (a cut-out from a PDF).
  ipcMain.handle('kalketa:study-bytes', async (event, request: { path: unknown; sheetPath?: unknown }) => {
    fromEditor(event);
    const path = allowedPath(request.path, sheetOf(event, request.sheetPath), true);
    if (!path) throw new Error('Not a study file of the searched folders');
    return new Uint8Array(await readFile(path));
  });

  // The card of a study file: its key, title, and the chapters or pages read.
  ipcMain.handle('kalketa:study-save', async (event, request: { path: unknown; sheetPath?: unknown; settings: unknown }) => {
    fromEditor(event);
    const path = allowedPath(request.path, sheetOf(event, request.sheetPath), true);
    if (!path || typeof request.settings !== 'object' || request.settings === null) throw new Error('Bad request');
    await writeStudySettings(path, request.settings);
  });

  // Which folders there are, for the save dialog.
  ipcMain.handle('kalketa:theory-folders', (event, sheetPath: unknown) => {
    fromEditor(event);
    return folders(sheetOf(event, sheetPath));
  });
}
