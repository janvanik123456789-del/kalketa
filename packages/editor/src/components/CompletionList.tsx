/**
 * The suggestions under the line being typed: the values of the sheet and the built-in functions whose names
 * start with the word at the cursor. Tab takes the marked one, ↑ ↓ move, Esc closes the list for that word.
 */

import type { Completion } from '../logic/shortcuts.js';

export function CompletionList(props: { readonly title: string; readonly items: readonly Completion[]; readonly active: number; onChoose(item: Completion): void; onHover(index: number): void }) {
  return (
    <div className="completion-list" role="listbox" aria-label={props.title} onMouseDown={(e) => e.preventDefault()}>
      <div className="completion-title">{props.title}</div>
      {props.items.map((c, i) => (
        <div key={`${c.kind}:${c.name}`} role="option" aria-selected={i === props.active} className={`completion${i === props.active ? ' active' : ''}`} data-completion={c.name} onMouseEnter={() => props.onHover(i)} onClick={() => props.onChoose(c)}>
          <span className={`completion-kind ${c.kind}`}>{c.kind === 'function' ? 'f' : 'x'}</span>
          <span className="completion-name">{c.kind === 'function' ? c.detail : c.name}</span>
          <span className="completion-detail">{c.kind === 'function' ? (c.note ?? '') : c.detail}</span>
          {c.kind === 'value' && c.note && <span className="completion-note">{c.note}</span>}
        </div>
      ))}
    </div>
  );
}
