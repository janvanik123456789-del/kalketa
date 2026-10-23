/**
 * The insert menu of an empty line: "/" typed at its start offers what can be put in, each with an example
 * of how it is written. More letters after "/" narrow it ("/pos" → Posudek), ↑ ↓ choose, Enter or Tab
 * takes it, Esc closes it and leaves the "/" as typed.
 */

import type { InsertChoice } from '../logic/insertMenu.js';

export { insertQuery, matchingChoices, type InsertChoice } from '../logic/insertMenu.js';

export function InsertMenu(props: { readonly title: string; readonly choices: readonly InsertChoice[]; readonly active: number; readonly empty: string; onChoose(choice: InsertChoice): void; onHover(index: number): void }) {
  return (
    <div className="insert-menu" role="listbox" aria-label={props.title} onMouseDown={(e) => e.preventDefault()}>
      <div className="insert-menu-title">{props.title}</div>
      {props.choices.length === 0 && <div className="insert-menu-empty">{props.empty}</div>}
      {props.choices.map((c, i) => (
        <div
          key={c.id}
          role="option"
          aria-selected={i === props.active}
          className={`insert-choice${i === props.active ? ' active' : ''}`}
          data-insert={c.id}
          onMouseEnter={() => props.onHover(i)}
          onClick={() => props.onChoose(c)}
        >
          <span className="insert-icon">{c.icon}</span>
          <span className="insert-text">
            <span className="insert-label">{c.label}</span>
            <code className="insert-example">{c.example}</code>
          </span>
          {i === props.active && <span className="insert-key">Enter</span>}
        </div>
      ))}
    </div>
  );
}
