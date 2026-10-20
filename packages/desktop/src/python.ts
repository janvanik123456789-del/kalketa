/**
 * Python for checking a calculation (packages/sheet/src/pythonCheck.ts): a script written into the
 * sources layer, by a person or by the AI, runs here and its results are set beside the sheet.
 *
 * Two engines:
 *  - the built-in one: Pyodide (CPython compiled to WebAssembly) in a thread of its own. The script
 *    sees nothing of the program: no files of the computer, no network (the `js` module is an empty
 *    object, `pyodide_js` is taken away); NumPy is loaded from the wheel shipped with the program.
 *    A script that runs too long is stopped with its thread.
 *  - Python of the computer, when the user chose it in the settings: it can do what the user can,
 *    so the editor asks before every run. It runs isolated (-I) in an empty folder of its own.
 *
 * No Electron here: the tests run it in Node.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

export type PythonEngine = 'pyodide' | 'system';

export interface PythonOutcome {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  /** Why it failed: the last line of a traceback, a timeout, Python not found. */
  readonly error?: string;
  readonly engine: PythonEngine;
  readonly ms: number;
}

export interface PyodidePlace {
  /** The folder of the pyodide package (pyodide.mjs, pyodide.asm.wasm, python_stdlib.zip, pyodide-lock.json). */
  readonly indexDir: string;
  /** The folder of the wheels shipped with the program (NumPy); none: only the standard library. */
  readonly packagesDir?: string;
}

/** Longest run of a script before it is stopped. */
export const PYTHON_TIMEOUT_MS = 30_000;

// The thread of Pyodide: started once (loading takes a few seconds) and kept while it behaves.
const WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
let ready;
let out = [];
let err = [];
// Any JavaScript object the script gets hold of (a callback, an array) leads by .constructor to Function,
// and Function builds code that reaches the computer: in this thread, functions have no constructor.
for (const f of [function () {}, async function () {}, function* () {}, async function* () {}]) {
  Object.defineProperty(Object.getPrototypeOf(f), 'constructor', { value: undefined, writable: false, configurable: false });
}
async function start() {
  const { loadPyodide } = await import(workerData.pyodideUrl);
  const py = await loadPyodide({
    indexURL: workerData.indexDir,
    ...(workerData.packagesDir ? { packageCacheDir: workerData.packagesDir } : {}),
    // The script sees no JavaScript: no fetch, no require, no files of the computer (not even Object's prototype).
    jsglobals: Object.create(null),
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  py.unregisterJsModule('pyodide_js');
  py.runPython("import sys\nsys.modules.pop('pyodide_js', None)");
  return py;
}
parentPort.on('message', async ({ id, code, numpy }) => {
  out = [];
  err = [];
  let globals;
  try {
    ready ??= start();
    const py = await ready;
    // Only the wheels shipped with the program: a package not there is never fetched.
    if (numpy) await py.loadPackage('numpy', { messageCallback: () => {}, errorCallback: (line) => err.push(line) });
    globals = py.globals.get('dict')();
    await py.runPythonAsync(code, { globals });
    parentPort.postMessage({ id, ok: true, stdout: out.join('\n'), stderr: err.join('\n') });
  } catch (e) {
    const text = String((e && e.message) || e);
    parentPort.postMessage({ id, ok: false, stdout: out.join('\n'), stderr: err.join('\n'), error: text });
  } finally {
    globals?.destroy?.();
  }
});
`;

let worker: Worker | undefined;
let workerPlace: string | undefined;
let nextId = 0;

/** Whether a script asks for NumPy (import numpy, from numpy import …). */
export function usesNumpy(code: string): boolean {
  return /^\s*(import\s+numpy\b|from\s+numpy\b)/m.test(code);
}

/** Whether the NumPy wheel is shipped in the folder of packages. */
function hasNumpy(dir: string | undefined): boolean {
  return !!dir && existsSync(dir) && readdirSync(dir).some((f) => f.startsWith('numpy-') && f.endsWith('.whl'));
}

/** The last line of a Python traceback: what went wrong, as Python says it. */
export function lastError(text: string): string {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  return lines[lines.length - 1] ?? text;
}

/** Runs a script in the built-in Python. */
export function runPyodide(code: string, place: PyodidePlace, timeoutMs = PYTHON_TIMEOUT_MS): Promise<PythonOutcome> {
  const start = Date.now();
  const key = `${place.indexDir}|${place.packagesDir ?? ''}`;
  if (!worker || workerPlace !== key) {
    void worker?.terminate();
    worker = new Worker(WORKER, {
      eval: true,
      workerData: { pyodideUrl: pathToFileURL(join(place.indexDir, 'pyodide.mjs')).href, indexDir: place.indexDir + (place.indexDir.endsWith('/') || place.indexDir.endsWith('\\') ? '' : '/'), packagesDir: place.packagesDir },
      resourceLimits: { maxOldGenerationSizeMb: 1024 },
    });
    workerPlace = key;
  }
  const own = worker;
  const id = ++nextId;
  const numpy = usesNumpy(code) && hasNumpy(place.packagesDir);
  return new Promise((resolve) => {
    const done = (outcome: Omit<PythonOutcome, 'engine' | 'ms'>) => {
      clearTimeout(timer);
      own.off('message', onMessage);
      own.off('error', onError);
      resolve({ ...outcome, engine: 'pyodide', ms: Date.now() - start });
    };
    const onMessage = (m: { id: number; ok: boolean; stdout: string; stderr: string; error?: string }) => {
      if (m.id !== id) return;
      done({ ok: m.ok, stdout: m.stdout, stderr: m.stderr, ...(m.error ? { error: lastError(m.error) } : {}) });
    };
    const onError = (e: Error) => {
      // A thread that broke is not used again.
      if (worker === own) worker = undefined;
      done({ ok: false, stdout: '', stderr: '', error: e.message });
    };
    // Too long: the thread is stopped with the script and started anew next time.
    const timer = setTimeout(() => {
      if (worker === own) worker = undefined;
      void own.terminate();
      done({ ok: false, stdout: '', stderr: '', error: `timeout ${Math.round(timeoutMs / 1000)} s` });
    }, timeoutMs);
    own.on('message', onMessage);
    own.on('error', onError);
    own.postMessage({ id, code, numpy });
  });
}

/** Stops the thread of the built-in Python (when the program ends). */
export async function stopPyodide(): Promise<void> {
  const own = worker;
  worker = undefined;
  await own?.terminate();
}

/** The commands that start Python of the computer, tried in order. */
function pythonCommands(): [string, string[]][] {
  return process.platform === 'win32' ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
}

/** Runs a script in Python of the computer: isolated (-I), in an empty folder of its own, stopped when too long. */
/** Variables of the environment Python needs to start and find itself; everything else (API keys, tokens) stays out. */
const KEPT_VARIABLES = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PYENV_ROOT', 'CONDA_PREFIX', 'VIRTUAL_ENV']);

/** The environment of Python of the computer: the variables it needs, its temporary folder, UTF-8 out. */
export function pythonEnvironment(env: NodeJS.ProcessEnv, folder: string): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(Object.entries(env).filter(([name]) => KEPT_VARIABLES.has(name.toUpperCase())));
  return { ...kept, TEMP: folder, TMP: folder, TMPDIR: folder, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
}

export async function runSystemPython(code: string, timeoutMs = PYTHON_TIMEOUT_MS): Promise<PythonOutcome> {
  const start = Date.now();
  const folder = await mkdtemp(join(tmpdir(), 'kalketa-python-'));
  try {
    for (const [command, args] of pythonCommands()) {
      const outcome = await new Promise<PythonOutcome | undefined>((resolve) => {
        const child = spawn(command, [...args, '-I', '-'], { cwd: folder, windowsHide: true, env: pythonEnvironment(process.env, folder) });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs);
        child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
        child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
        // Not there: the next command is tried.
        child.on('error', () => {
          clearTimeout(timer);
          resolve(undefined);
        });
        child.on('close', (status) => {
          clearTimeout(timer);
          const ok = status === 0 && !timedOut;
          resolve({ ok, stdout, stderr, ...(ok ? {} : { error: timedOut ? `timeout ${Math.round(timeoutMs / 1000)} s` : lastError(stderr) }), engine: 'system', ms: Date.now() - start });
        });
        child.stdin.end(code, 'utf8');
      });
      if (outcome) return outcome;
    }
    return { ok: false, stdout: '', stderr: '', error: 'Python not found', engine: 'system', ms: Date.now() - start };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Whether the built-in Python has NumPy (its wheel shipped with the program). */
export function pyodideHasNumpy(resources?: string): boolean {
  return hasNumpy(pyodidePlace(resources).packagesDir);
}

/** Where Pyodide is: next to this module in development, unpacked from the archive in the program. */
export function pyodidePlace(resources?: string): PyodidePlace {
  const candidates = [
    ...(resources ? [join(resources, 'app.asar.unpacked', 'node_modules', 'pyodide')] : []),
    join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'node_modules', 'pyodide'),
    join(process.cwd(), 'node_modules', 'pyodide'),
  ];
  const indexDir = candidates.find((dir) => existsSync(join(dir, 'pyodide.mjs'))) ?? candidates[candidates.length - 1]!;
  const packages = [...(resources ? [join(resources, 'pyodide-packages')] : []), join(indexDir, '..', '..', 'packages', 'desktop', 'pyodide-packages'), join(process.cwd(), 'packages', 'desktop', 'pyodide-packages')];
  const packagesDir = packages.find((dir) => existsSync(dir));
  return { indexDir, ...(packagesDir ? { packagesDir } : {}) };
}

/** The start of a script for the question before it runs: its first lines, and how many more there are. */
export function scriptExcerpt(code: string, more: string, lines = 30): string {
  const all = code.replace(/\r\n/g, '\n').split('\n');
  const shown = all.slice(0, lines).map((l) => (l.length > 160 ? `${l.slice(0, 160)}…` : l));
  return all.length > lines ? `${shown.join('\n')}\n${more.replace('{n}', String(all.length - lines))}` : shown.join('\n');
}

/**
 * Put before every script by this process (not by the page), so what the user is shown is all that runs besides
 * it: result(name, value, unit="", rel=1e-6). The same text as PYTHON_PRELUDE of @kalketa/sheet (a test keeps them so).
 */
export const PYTHON_PRELUDE = `def result(name, value, unit="", rel=1e-6):
    """Report a result of the check by its name in the sheet, with its unit as Kalketa writes it."""
    import json as _json
    print("@@kalketa " + _json.dumps({"name": str(name), "value": float(value), "unit": str(unit), "rel": float(rel)}), flush=True)
`;
