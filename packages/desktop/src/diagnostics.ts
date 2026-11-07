/**
 * What the program notes for finding faults. All of it stays in the profile of the program (userData), on this
 * computer; no key and nothing of a calculation is written to a log.
 *
 *   logs/ai.log           each request to a model: provider, model, sizes, time, how it ended (one JSON line each)
 *   logs/ai-answers/      the text of the last answers of models, written before the editor reads them
 *   logs/hang.log         the editor stopped answering: where its JavaScript ran (call stack), its last steps, memory
 */

import { app, dialog, ipcMain, session, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LOG_LIMIT = 5 * 1024 * 1024;
const ANSWERS_KEPT = 20;
const STEPS_KEPT = 30;

const logsDir = () => join(app.getPath('userData'), 'logs');

/** One line of JSON into a log of the program; a log past its limit becomes .old and starts anew. */
export function appendLog(name: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(logsDir(), { recursive: true });
    const file = join(logsDir(), name);
    if (existsSync(file) && statSync(file).size > LOG_LIMIT) renameSync(file, `${file}.old`);
    appendFileSync(file, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // A log that cannot be written must not stop the program.
  }
}

/** The text of an answer of a model, kept with what it answered; only the last ones stay. Returns its file name. */
export function saveAnswerText(id: string, text: string, meta: Record<string, unknown>): string | undefined {
  try {
    const dir = join(logsDir(), 'ai-answers');
    mkdirSync(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${id.replace(/[^\w-]/g, '').slice(0, 40)}.txt`;
    writeFileSync(join(dir, name), `${JSON.stringify(meta)}\n\n${text}`);
    const all = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - ANSWERS_KEPT))) rmSync(join(dir, old), { force: true });
    return name;
  } catch {
    return undefined;
  }
}

/** The last steps the editor of each window said it took (reading an answer, the effect of a proposal…). */
const steps = new Map<number, { time: string; step: string }[]>();

/**
 * Call stacks of a page that hangs (WebFrameMain.collectJavaScriptCallStack) need a feature and a document
 * policy of the page; both are set here, the switch before the program is ready.
 */
export function enableCallStacks(): void {
  app.commandLine.appendSwitch('enable-features', 'DocumentPolicyIncludeJSCallStacksInCrashReports');
}

export function allowCallStacks(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Document-Policy': ['include-js-call-stacks-in-crash-reports'] } });
  });
}

/** What the window asks when its editor hangs, in the language of the editor (sent with the close guard). */
export interface HangWords {
  readonly message: string;
  readonly wait: string;
  readonly reload: string;
}

const DEFAULT_WORDS: HangWords = {
  message: 'Kalketa is not responding. It may still be working, or it is stuck.',
  wait: 'Wait',
  reload: 'Reload the window',
};

/**
 * Watches a window: when its editor stops answering, notes where its JavaScript runs, its last steps and memory,
 * and asks whether to wait or reload it. `ask` is off in the smoke test.
 */
export function watchWindow(win: BrowserWindow, words: () => HangWords | undefined, ask = true): void {
  const contents = win.webContents;
  let since: number | undefined;
  let asking = false;
  contents.on('unresponsive', () => {
    since = Date.now();
    void (async () => {
      const stack = await Promise.race([contents.mainFrame.collectJavaScriptCallStack().catch(() => undefined), new Promise<undefined>((done) => setTimeout(() => done(undefined), 5000))]);
      const pid = contents.getOSProcessId();
      const metrics = app.getAppMetrics().find((m) => m.pid === pid);
      appendLog('hang.log', {
        event: 'unresponsive',
        title: win.getTitle(),
        stack: typeof stack === 'string' ? stack.trim() : null,
        steps: steps.get(contents.id) ?? [],
        memoryKB: metrics?.memory.workingSetSize ?? null,
        cpuPercent: metrics?.cpu.percentCPUUsage ?? null,
        version: app.getVersion(),
      });
      if (!ask || asking || win.isDestroyed()) return;
      asking = true;
      const w = words() ?? DEFAULT_WORDS;
      const { response } = await dialog.showMessageBox(win, { type: 'warning', title: 'Kalketa', message: w.message, buttons: [w.wait, w.reload], defaultId: 0, cancelId: 0, noLink: true });
      asking = false;
      if (response === 1 && !win.isDestroyed()) {
        appendLog('hang.log', { event: 'reload', title: win.getTitle() });
        contents.reload();
      }
    })();
  });
  contents.on('responsive', () => {
    if (since !== undefined) appendLog('hang.log', { event: 'responsive', afterMs: Date.now() - since, title: win.getTitle() });
    since = undefined;
  });
  contents.on('render-process-gone', (_event, details) => appendLog('hang.log', { event: 'gone', reason: details.reason, exitCode: details.exitCode, steps: steps.get(contents.id) ?? [] }));
  contents.on('destroyed', () => steps.delete(contents.id));
}

export function registerDiagnostics(fromEditor: (event: IpcMainInvokeEvent) => unknown): void {
  ipcMain.on('kalketa:diag-step', (event, step: unknown) => {
    fromEditor(event as unknown as IpcMainInvokeEvent);
    if (typeof step !== 'string') return;
    const list = steps.get(event.sender.id) ?? [];
    list.push({ time: new Date().toISOString(), step: step.slice(0, 200) });
    if (list.length > STEPS_KEPT) list.splice(0, list.length - STEPS_KEPT);
    steps.set(event.sender.id, list);
  });
}
