import { afterAll, describe, expect, it } from 'vitest';
import { PYTHON_PRELUDE, readOutput } from '@kalketa/sheet';
import { PYTHON_PRELUDE as DESKTOP_PRELUDE } from '../src/python.js';
import { pythonEnvironment, pyodidePlace, runPyodide, runSystemPython, scriptExcerpt, stopPyodide, usesNumpy } from '../src/python.js';

const place = pyodidePlace();
afterAll(() => stopPyodide());

describe('the built-in Python (Pyodide)', () => {
  it('runs a check and reports its results by the names of the sheet', async () => {
    const run = await runPyodide(`${PYTHON_PRELUDE}\nfrom math import sqrt\nprint("ahoj")\nresult("v_A", sqrt(2*9.81*9), "m/s")\n`, place);
    expect(run.error).toBeUndefined();
    const read = readOutput(run.stdout);
    expect(read.output).toBe('ahoj');
    expect(read.results[0]!.name).toBe('v_A');
    expect(read.results[0]!.value).toBeCloseTo(13.2883, 4);
  }, 60_000);

  it('says what went wrong, and starts each script with names of its own', async () => {
    const wrong = await runPyodide('x = 1\nprint(1/0)', place);
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toContain('ZeroDivisionError');
    const fresh = await runPyodide('print(x)', place);
    expect(fresh.error).toContain('NameError');
  }, 60_000);

  it('sees nothing of the computer: no JavaScript, no files, no network', async () => {
    const js = await runPyodide('import js\nprint(js.fetch)', place);
    expect(js.ok).toBe(false);
    const bridge = await runPyodide('import pyodide_js', place);
    expect(bridge.error).toContain('ModuleNotFoundError');
    // Not by the constructor of a JavaScript object it gets hold of either.
    const constructed = await runPyodide('from pyodide.ffi import to_js\nx = to_js([1, 2])\nprint(x.constructor.constructor("return typeof process")())', place);
    expect(constructed.ok).toBe(false);
    const runJs = await runPyodide('from pyodide.code import run_js\nprint(run_js("typeof process"))', place);
    expect(runJs.ok).toBe(false);
    // Its files are those of its own memory, not of the computer.
    const files = await runPyodide('import os\nprint(os.path.exists("C:/Windows") or os.path.exists("/etc/passwd"))', place);
    expect(files.stdout.trim()).toBe('False');
  }, 60_000);

  it('stops a script that runs too long', async () => {
    const run = await runPyodide('while True: pass', place, 3000);
    expect(run.error).toContain('timeout');
    const after = await runPyodide('print(2 + 2)', place);
    expect(after.stdout.trim()).toBe('4');
  }, 90_000);

  it('runs in a process of its own: a script that ends it takes down only that process', async () => {
    const ended = await runPyodide('import os\nos._exit(3)', place, 20_000);
    expect(ended.ok).toBe(false);
    const after = await runPyodide('print(6 * 7)', place);
    expect(after.stdout.trim()).toBe('42');
  }, 120_000);

  it('loads NumPy from the wheel shipped with the program (scripts/pyodide-packages.mjs)', async () => {
    if (!place.packagesDir) return;
    const run = await runPyodide('import numpy as np\nprint(np.polyfit([1, 2, 3, 4, 5], [2.1, 3.9, 4.2, 6.2, 9.1], 2).round(4).tolist())', place);
    expect(run.error).toBeUndefined();
    expect(run.stdout.trim()).toBe('[0.2786, -0.0414, 2.16]');
  }, 120_000);

  it('knows a script that needs NumPy', () => {
    expect(usesNumpy('import numpy as np')).toBe(true);
    expect(usesNumpy('from numpy import linspace')).toBe(true);
    expect(usesNumpy('# numpy is not needed\nx = 1')).toBe(false);
  });
});

describe('Python of the computer', () => {
  it('runs a script isolated in an empty folder of its own, or says it is not there', async () => {
    const run = await runSystemPython(`${PYTHON_PRELUDE}
import os, sys
print(os.listdir("."), sys.flags.isolated)
result("x", 2.5, "m")
`);
    if (run.error === 'Python not found') return;
    expect(run.error).toBeUndefined();
    const read = readOutput(run.stdout);
    expect(read.output).toBe('[] 1');
    expect(read.results).toEqual([{ name: 'x', value: 2.5, unit: 'm', rel: 1e-6 }]);
    const slow = await runSystemPython('while True: pass', 2000);
    expect(slow.error).toContain('timeout');
  }, 60_000);
});


describe('Python of the computer', () => {
  it('gets only the variables it needs to start, not the keys and tokens of the environment', () => {
    const env = pythonEnvironment({ Path: 'C:\Python', SystemRoot: 'C:\Windows', ANTHROPIC_API_KEY: 'sk-secret', GITHUB_TOKEN: 'ghp', HOME: '/home/a' }, '/tmp/k');
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['GITHUB_TOKEN']).toBeUndefined();
    expect(env['Path']).toBe('C:\Python');
    expect(env['SystemRoot']).toBe('C:\Windows');
    expect(env['TEMP']).toBe('/tmp/k');
    expect(env['PYTHONIOENCODING']).toBe('utf-8');
  });

  it('is asked about with the start of the script shown, and how much more there is', () => {
    const code = Array.from({ length: 40 }, (_, i) => `x${i} = ${i}`).join('\n');
    const shown = scriptExcerpt(code, '… {n} more lines');
    expect(shown.split('\n')).toHaveLength(31);
    expect(shown.endsWith('… 10 more lines')).toBe(true);
    expect(scriptExcerpt('print(1)', '…')).toBe('print(1)');
  });
});

describe('the prelude of a script', () => {
  it('is put before it by the desktop exactly as the sheet reads its output', () => {
    expect(DESKTOP_PRELUDE).toBe(PYTHON_PRELUDE);
  });
});
