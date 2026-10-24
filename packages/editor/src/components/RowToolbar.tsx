/**
 * The floating toolbar of the line being edited: what the right button offers for a result, at hand above
 * the line. The precision and the unit of the result open their menus with the value as it would show,
 * the equation number is switched by a click, the source is asked for; ⋯ opens the whole menu of the line.
 * A click here never takes the cursor out of the line. It shows while the pointer is over the line (or over
 * it): above the line it covers the rows before, which a click elsewhere or typing must reach.
 */

import type { MouseEvent } from 'react';
import type { MenuItem } from './MenuBar.js';

export interface RowToolbarProps {
  /** The label of the precision button ("2 des. místa"); undefined: the line has no number to format. */
  readonly precision?: string;
  readonly precisionItems: readonly MenuItem[];
  /** The label of the unit button ("kN·m"); undefined: no unit to choose. */
  readonly unit?: string;
  readonly unitItems: readonly MenuItem[];
  /** The equation number: its label and whether the line has one; undefined: not offered. */
  readonly number?: { readonly label: string; readonly on: boolean; toggle(): void };
  readonly source: { readonly label: string; readonly title?: string; ask(): void };
  readonly more: { readonly title: string; open(at: { x: number; y: number }): void };
  /** Opens a menu of the toolbar at a point of the window (outside the zoomed pages, as the other menus). */
  onMenu(items: readonly MenuItem[], at: { x: number; y: number }): void;
}

export function RowToolbar(props: RowToolbarProps) {
  const below = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.bottom + 2) };
  };
  // Pressed buttons keep the focus in the line being edited.
  const keep = (e: MouseEvent) => e.preventDefault();
  return (
    // The wrap reaches down to the line, so the pointer passes from the line to the buttons without leaving.
    <div className="row-toolbar-wrap" onMouseDown={(e) => e.stopPropagation()}>
      <div className="row-toolbar" role="toolbar">
        {props.precision !== undefined && (
          <button type="button" data-row-tool="precision" onMouseDown={keep} onClick={(e) => props.onMenu(props.precisionItems, below(e))}>
            {props.precision} ▾
          </button>
        )}
        {props.unit !== undefined && props.unitItems.length > 0 && (
          <button type="button" data-row-tool="unit" onMouseDown={keep} onClick={(e) => props.onMenu(props.unitItems, below(e))}>
            {props.unit} ▾
          </button>
        )}
        {props.number && (
          <button type="button" data-row-tool="number" className={props.number.on ? 'on' : ''} aria-pressed={props.number.on} onMouseDown={keep} onClick={props.number.toggle}>
            {props.number.label}
          </button>
        )}
        <button type="button" data-row-tool="source" title={props.source.title} onMouseDown={keep} onClick={props.source.ask}>
          {props.source.label}
        </button>
        <span className="row-toolbar-sep" />
        <button type="button" data-row-tool="more" className="more" title={props.more.title} aria-label={props.more.title} onMouseDown={keep} onClick={(e) => props.more.open(below(e))}>
          ⋯
        </button>
      </div>
    </div>
  );
}
