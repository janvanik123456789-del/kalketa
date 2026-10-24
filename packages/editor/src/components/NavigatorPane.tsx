/**
 * Navigation of the calculation (a tab of the side pane): its outline by sections and positions, each with
 * the state of its checks; the checks with their utilization; the problems (errors, warnings). A click goes
 * to the row of it in the sheet.
 */

import { t, type Catalog } from '@kalketa/i18n';

export interface OutlineItem {
  readonly line: number;
  readonly level: number;
  readonly text: string;
  /** Its number when the sections are numbered (2.1). */
  readonly number?: string;
  /** "Pos. 2" of a position. */
  readonly position?: string;
  /** The checks in it: all met, some not, or none evaluated; undefined without checks. */
  readonly state?: 'ok' | 'fail' | 'open';
}

export interface CheckItem {
  readonly line: number;
  readonly label: string;
  readonly passed: boolean;
  readonly evaluated: boolean;
  readonly utilization?: string;
}

export interface ProblemItem {
  readonly line: number;
  readonly severity: 'error' | 'warning' | 'info';
  readonly text: string;
}

const STATE_SIGN = { ok: '✓', fail: '✗', open: '–' } as const;
const SEVERITY_SIGN = { error: '✗', warning: '⚠', info: 'ℹ' } as const;

export function NavigatorPane(props: { catalog: Catalog; outline: readonly OutlineItem[]; checks: readonly CheckItem[]; problems: readonly ProblemItem[]; onJump(line: number): void }) {
  const { catalog } = props;
  const passed = props.checks.filter((c) => c.evaluated && c.passed).length;
  return (
    <div className="navigator">
      <h3>{t(catalog, 'nav.outline')}</h3>
      {props.outline.length === 0 ? (
        <p className="nav-empty">{t(catalog, 'nav.outlineNone')}</p>
      ) : (
        <ul className="nav-list">
          {props.outline.map((h) => (
            <li key={h.line}>
              <button type="button" className={`nav-item level-${Math.min(h.level, 4)}`} data-nav-line={h.line} onClick={() => props.onJump(h.line)}>
                {h.position && <span className="nav-pos">{h.position}</span>}
                {h.number && <span className="nav-number">{h.number}</span>}
                <span className="nav-text">{h.text}</span>
                {h.state && <span className={`nav-state ${h.state}`}>{STATE_SIGN[h.state]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{props.checks.length === 0 ? t(catalog, 'nav.checksNone') : t(catalog, 'nav.checks', { passed: String(passed), total: String(props.checks.length) })}</h3>
      {props.checks.length > 0 && (
        <ul className="nav-list">
          {props.checks.map((c) => (
            <li key={c.line}>
              <button type="button" className="nav-item" data-nav-line={c.line} onClick={() => props.onJump(c.line)}>
                <span className={`nav-state ${!c.evaluated ? 'open' : c.passed ? 'ok' : 'fail'}`}>{!c.evaluated ? '?' : c.passed ? '✓' : '✗'}</span>
                <span className="nav-text">{c.label}</span>
                {c.utilization && <span className="nav-util">{c.utilization}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>{t(catalog, 'nav.problems')}</h3>
      {props.problems.length === 0 ? (
        <p className="nav-empty">{t(catalog, 'nav.problemsNone')}</p>
      ) : (
        <ul className="nav-list">
          {props.problems.map((p, i) => (
            <li key={`${p.line}:${i}`}>
              <button type="button" className={`nav-item problem ${p.severity}`} data-nav-line={p.line} onClick={() => props.onJump(p.line)}>
                <span className="nav-state">{SEVERITY_SIGN[p.severity]}</span>
                <span className="nav-text">
                  <span className="nav-line">{t(catalog, 'nav.line', { n: String(p.line) })}</span> {p.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
