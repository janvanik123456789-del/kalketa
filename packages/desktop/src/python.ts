/**
 * Python for checking a calculation (packages/sheet/src/pythonCheck.ts): a script written into the
 * sources layer, by a person or by the AI, runs here and its results are set beside the sheet.
 *
 * Two engines:
 *  - the built-in one: Pyodide (CPython compiled to WebAssembly) in a process of its own
 *    (pyodideChild.cts). The script sees nothing of the program: no files of the computer, no network
 *    (the `js` module is an empty object, `pyodide_js` is taken away); NumPy is loaded from the wheel
 *    shipped with the program. A script that runs too long is stopped with its process.
 *  - Python of the computer, when the user chose it in the settings: it can do what the user can,
 *    so the editor asks before every run. It runs isolated (-I) in an empty folder of its own.
 *
 * No Electron here: the tests run it in Node (main.ts gives Electron's utility process by setPyodideLauncher).
 */

import { fork, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** The process of the built-in Python as python.ts sees it: Electron's utility process or a Node child. */
export interface PyodideProcess {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: () => void): void;
  kill(): void;
}

/** Starts the process of the built-in Python from its script; Electron gives its own (a utility process). */
export type PyodideLauncher = (script: string) => PyodideProcess;

/** By default a Node child, as in the tests: an own process with its memory limited. */
const forkNode: PyodideLauncher = (script) => {
  const child = fork(script, [], { execArgv: ['--max-old-space-size=1024'], serialization: 'advanced', stdio: 'ignore' });
  return {
    postMessage: (m) => child.send(m as never),
    onMessage: (l) => child.on('message', l),
    onExit: (l) => child.on('exit', l),
    kill: () => child.kill(),
  };
};
let launcher: PyodideLauncher = forkNode;

/** Sets how the process of the built-in Python is started (Electron: utilityProcess.fork). */
export function setPyodideLauncher(launch: PyodideLauncher): void {
  launcher = launch;
}

/** The script of the process: compiled next to this module, or the source in the tests (Node strips its types). */
export function pyodideChildScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const built = join(here, 'pyodideChild.cjs');
  return existsSync(built) ? built : join(here, 'pyodideChild.cts');
}

interface Running {
  readonly child: PyodideProcess;
  readonly place: string;
  readonly waiting: Map<number, (m: { ok: boolean; stdout: string; stderr: string; error?: string } | undefined) => void>;
}
let running: Running | undefined;
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

/** The process of the built-in Python for this place: started once (loading takes a few seconds), kept while it behaves. */
function pyodideProcess(place: PyodidePlace): Running {
  const key = `${place.indexDir}|${place.packagesDir ?? ''}`;
  if (running && running.place === key) return running;
  running?.child.kill();
  const child = launcher(pyodideChildScript());
  const own: Running = { child, place: key, waiting: new Map() };
  child.onMessage((m) => {
    const message = m as { id: number; ok: boolean; stdout: string; stderr: string; error?: string };
    own.waiting.get(message.id)?.(message);
  });
  // A process that ended (crashed, out of memory, stopped) is not used again; what it ran fails.
  child.onExit(() => {
    if (running === own) running = undefined;
    for (const answer of own.waiting.values()) answer(undefined);
  });
  child.postMessage({ start: { pyodideUrl: pathToFileURL(join(place.indexDir, 'pyodide.mjs')).href, indexDir: place.indexDir + (place.indexDir.endsWith('/') || place.indexDir.endsWith('\\') ?'' : '/'), ...(place.packagesDir ? { packagesDir: place.packagesDir } : {}) } });
  running = own;
  return own;
}

/** Runs a script in the built-in Python, in a process of its own. */
export function runPyodide(code: string, place: PyodidePlace, timeoutMs = PYTHON_TIMEOUT_MS): Promise<PythonOutcome> {
  const start = Date.now();
  const own = pyodideProcess(place);
  const id = ++nextId;
  const numpy = usesNumpy(code) && hasNumpy(place.packagesDir);
  return new Promise((resolve) => {
    let timedOut = false;
    const done = (outcome: Omit<PythonOutcome, 'engine' | 'ms'>) => {
      clearTimeout(timer);
      own.waiting.delete(id);
      resolve({ ...outcome, engine: 'pyodide', ms: Date.now() - start });
    };
    own.waiting.set(id, (m) =>
      done(m ? { ok: m.ok, stdout: m.stdout, stderr: m.stderr, ...(m.error ? { error: lastError(m.error) } : {}) } : { ok: false, stdout: '', stderr: '', error: timedOut ? `timeout ${Math.round(timeoutMs / 1000)} s` : 'The built-in Python stopped' }),
    );
    // Too long: the process is stopped with the script and started anew next time.
    const timer = setTimeout(() => {
      timedOut = true;
      if (running === own) running = undefined;
      own.child.kill();
      done({ ok: false, stdout: '', stderr: '', error: `timeout ${Math.round(timeoutMs / 1000)} s` });
    }, timeoutMs);
    own.child.postMessage({ job: { id, code, numpy } });
  });
}

/** Stops the process of the built-in Python (when the program ends). */
export async function stopPyodide(): Promise<void> {
  const own = running;
  running = undefined;
  own?.child.kill();
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
