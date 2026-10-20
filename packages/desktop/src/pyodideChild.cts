/**
 * The process of the built-in Python (Pyodide), started by python.ts: by Electron as a utility process of its own,
 * by the tests as a Node child. A script that breaks out of Python reaches only this process: it is locked down
 * once Pyodide is loaded (no other processes, no network, no threads, no writing of files), and a crash
 * or a script eating memory takes only it down, never the program.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs') as typeof import('node:fs');
const os = require('node:os') as typeof import('node:os');
const Module = require('node:module') as { _load: (request: string, ...rest: unknown[]) => unknown };

interface Start {
  readonly pyodideUrl: string;
  readonly indexDir: string;
  readonly packagesDir?: string;
}
interface Job {
  readonly id: number;
  readonly code: string;
  readonly numpy: boolean;
}
interface Py {
  runPython(code: string): unknown;
  runPythonAsync(code: string, options: { globals: unknown }): Promise<unknown>;
  loadPackage(name: string, options: object): Promise<unknown>;
  unregisterJsModule(name: string): void;
  globals: { get(name: string): () => { destroy?: () => void } };
}

// Emscripten reads the flags of files from the constants binding: given from the public constants, the rest of
// process.binding stays shut.
(process as unknown as { binding: (name: string) => unknown }).binding = (name: string) => {
  if (name === 'constants') return { fs: fs.constants, os: os.constants };
  throw new Error(`No binding ${name}`);
};

// Any JavaScript object a script gets hold of leads by .constructor to Function, which builds code: here functions have none.
for (const f of [function () {}, async function () {}, function* () {}, async function* () {}]) {
  Object.defineProperty(Object.getPrototypeOf(f), 'constructor', { value: undefined, writable: false, configurable: false });
}

/** What this process may no longer do once Python is loaded. */
const DENIED = ['child_process', 'cluster', 'dgram', 'dns', 'http', 'http2', 'https', 'inspector', 'net', 'tls', 'vm', 'worker_threads', 'wasi'];
const WRITES = ['appendFile', 'chmod', 'chown', 'copyFile', 'cp', 'createWriteStream', 'link', 'mkdir', 'mkdtemp', 'rename', 'rm', 'rmdir', 'symlink', 'truncate', 'unlink', 'utimes', 'writeFile', 'write'];

function lockDown(): void {
  const load = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (DENIED.includes(request.replace(/^node:/, ''))) throw new Error(`Not allowed here: ${request}`);
    return load.call(this, request, ...rest);
  };
  const refuse = () => {
    throw new Error('Writing files is not allowed here');
  };
  const own = fs as unknown as Record<string, unknown>;
  const promises = fs.promises as unknown as Record<string, unknown>;
  for (const name of WRITES) {
    for (const key of [name, `${name}Sync`]) if (typeof own[key] === 'function') own[key] = refuse;
    if (typeof promises[name] === 'function') promises[name] = refuse;
  }
  (process as unknown as { dlopen: unknown }).dlopen = refuse;
  for (const name of ['fetch', 'WebSocket', 'EventSource']) delete (globalThis as Record<string, unknown>)[name];
}

let start: Start | undefined;
let ready: Promise<Py> | undefined;
let out: string[] = [];
let err: string[] = [];

async function load(): Promise<Py> {
  const { loadPyodide } = (await import(start!.pyodideUrl)) as { loadPyodide(options: object): Promise<Py> };
  const py = await loadPyodide({
    indexURL: start!.indexDir,
    ...(start!.packagesDir ? { packageCacheDir: start!.packagesDir } : {}),
    // The script sees no JavaScript: no fetch, no require, no files of the computer (not even Object's prototype).
    jsglobals: Object.create(null),
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
  });
  py.unregisterJsModule('pyodide_js');
  py.runPython("import sys\nsys.modules.pop('pyodide_js', None)");
  lockDown();
  return py;
}

async function run(job: Job): Promise<object> {
  out = [];
  err = [];
  let globals: { destroy?: () => void } | undefined;
  try {
    ready ??= load();
    const py = await ready;
    // Only the wheels shipped with the program (read, never fetched: the network is shut).
    if (job.numpy) await py.loadPackage('numpy', { messageCallback: () => {}, errorCallback: (line: string) => err.push(line) });
    globals = py.globals.get('dict')();
    await py.runPythonAsync(job.code, { globals });
    return { id: job.id, ok: true, stdout: out.join('\n'), stderr: err.join('\n') };
  } catch (e) {
    return { id: job.id, ok: false, stdout: out.join('\n'), stderr: err.join('\n'), error: String((e as Error)?.message ?? e) };
  } finally {
    globals?.destroy?.();
  }
}

// Messages from the program: from Electron's parent port, or from Node's IPC channel in the tests.
const port = (process as unknown as { parentPort?: { on(event: 'message', listener: (e: { data: unknown }) => void): void; postMessage(m: unknown): void } }).parentPort;
const send = (m: object) => (port ? port.postMessage(m) : process.send?.(m));
const receive = (m: unknown) => {
  const message = m as { start?: Start; job?: Job };
  if (message.start) start = message.start;
  if (message.job) void run(message.job).then(send);
};
if (port) port.on('message', (e) => receive(e.data));
else process.on('message', receive);
