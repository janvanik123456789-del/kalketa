/**
 * A ```python block of the sources layer: run it, and its results stand beside the values the core
 * calculated (packages/sheet/src/pythonCheck.ts). The program gives the way to run it through
 * PythonRunner; outside the desktop application there is none, and the block stays plain text.
 */

import { createContext, useContext, useState } from 'react';
import { formatNumber, t, unitGap, type Catalog, type UiKey } from '@kalketa/i18n';
import type { PythonComparison, PythonRun } from '@kalketa/sheet';

/** A run of a script and its results set beside the sheet; undefined when the user did not let it run. */
export type PythonRunner = (code: string) => Promise<(PythonRun & { readonly comparisons: readonly PythonComparison[] }) | undefined>;

export const PythonRunnerContext = createContext<PythonRunner | undefined>(undefined);

export function PythonPanel({ code, catalog }: { code: string; catalog: Catalog | undefined }) {
  const run = useContext(PythonRunnerContext);
  const [state, setState] = useState<{ running: boolean; last?: Awaited<ReturnType<PythonRunner>> }>({ running: false });
  if (!run || !catalog) return null;
  const say = (key: UiKey, params?: Record<string, string | number>) => t(catalog, key, params);
  const number = (v: number) => formatNumber(v, catalog, { digits: 6 }).replace('-', '−');
  const start = async () => {
    setState({ running: true });
    try {
      setState({ running: false, last: await run(code) });
    } catch (e) {
      setState({ running: false, last: { ok: false, output: '', error: String((e as Error).message ?? e), results: [], comparisons: [], engine: 'pyodide', ms: 0 } });
    }
  };
  const last = state.last;
  const agreed = last?.comparisons.filter((c) => c.state === 'agree').length ?? 0;
  return (
    <div className="python-panel" contentEditable={false}>
      <div className="python-actions">
        <button type="button" className="python-run" disabled={state.running} onClick={() => void start()} title={say('python.runTip')}>
          {state.running ? say('python.running') : say('python.run')}
        </button>
        {last && (
          <span className={`python-summary ${last.ok && agreed === last.comparisons.length ? 'ok' : 'bad'}`}>
            {last.ok
              ? last.comparisons.length > 0
                ? say('python.agreed', { agreed, all: last.comparisons.length })
                : say('python.noResults')
              : say('python.failed')}
            <span className="python-engine">{say(last.engine === 'system' ? 'python.engineSystem' : 'python.enginePyodide', { ms: last.ms })}</span>
          </span>
        )}
      </div>
      {last && last.comparisons.length > 0 && (
        <table className="python-compare">
          <thead>
            <tr>
              <th>{say('python.name')}</th>
              <th>Kalketa</th>
              <th>Python</th>
              <th>{say('python.difference')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {last.comparisons.map((c, i) => (
              <tr key={i} className={c.state}>
                <td>{c.name}</td>
                <td>{c.kalketa ? `${number(c.kalketa.value)}${unitGap(c.kalketa.unit)}${c.kalketa.unit}` : '–'}</td>
                <td>{`${number(c.python.value)}${unitGap(c.python.unit)}${c.python.unit}`}</td>
                <td>{c.difference !== undefined ? `${formatNumber(c.difference * 100, catalog, { digits: 2 })} %` : ''}</td>
                <td title={say(`python.state.${c.state}` as UiKey)}>{c.state === 'agree' ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {last && last.comparisons.some((c) => c.state !== 'agree') && (
        <ul className="python-notes">
          {last.comparisons
            .filter((c) => c.state !== 'agree')
            .map((c, i) => (
              <li key={i}>
                {c.name}: {say(`python.state.${c.state}` as UiKey)}
              </li>
            ))}
        </ul>
      )}
      {last?.error && <pre className="python-error">{last.error}</pre>}
      {last?.output && <pre className="python-output">{last.output}</pre>}
    </div>
  );
}
