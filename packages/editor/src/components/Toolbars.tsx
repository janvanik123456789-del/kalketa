/**
 * Dockable toolbars (classic CAD style). Each toolbar has a grip; dragging it
 * to an edge of the window docks it there (in a band of that edge), dropping
 * it elsewhere leaves it floating in its own small window. Floating toolbars
 * and toolbars at the side edges can be reshaped into a grid by dragging a
 * handle.
 */

import { useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { t, type Catalog, type UiKey } from '@calccanvas/i18n';
import { plainLabel, type Command } from '../commands.js';
import { commandIcon } from '../icons.js';
import {
  bandsOf,
  compactBands,
  dockToolbar,
  floating,
  floatToolbar,
  SEPARATOR,
  setColumns,
  setVisible,
  type Dock,
  type ToolbarLayout,
  type ToolbarState,
} from '../logic/toolbars.js';

export function toolbarName(toolbar: ToolbarState, catalog: Catalog): string {
  return toolbar.name ?? (toolbar.builtin ? t(catalog, `toolbar.${toolbar.id}` as UiKey) : toolbar.id);
}

interface Drag {
  readonly id: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly x: number;
  readonly y: number;
}

export interface ToolbarFrameProps {
  readonly layout: ToolbarLayout;
  readonly commands: ReadonlyMap<string, Command>;
  readonly catalog: Catalog;
  onLayout(layout: ToolbarLayout): void;
  /** The working area (the sheet), surrounded by the four docks. */
  readonly children: ReactNode;
  /** Shown to the right of the right dock (the side panel), so side toolbars hug the sheet. */
  readonly aside?: ReactNode;
}

const DOCK_SNAP_PX = 40;
/** Width of one button cell in a grid toolbar (button + gap). */
const CELL_PX = 30;
/** Floating toolbars start as a grid of at most this many columns. */
const DEFAULT_FLOAT_COLUMNS = 8;

export function ToolbarFrame({ layout, commands, catalog, onLayout, children, aside }: ToolbarFrameProps) {
  const [drag, setDrag] = useState<Drag | undefined>();
  const docks = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), left: useRef<HTMLDivElement>(null), right: useRef<HTMLDivElement>(null) };

  // Reshaping sends many updates during one drag; each builds on the latest layout.
  const latest = useRef(layout);
  latest.current = layout;
  const reshape = (id: string, columns: number) => {
    const current = latest.current.toolbars.find((tb) => tb.id === id)?.columns;
    const next = setColumns(latest.current, id, columns);
    if (next.toolbars.find((tb) => tb.id === id)?.columns === current) return;
    latest.current = next;
    onLayout(next);
  };

  const startDrag = (id: string, e: ReactMouseEvent, box: HTMLElement) => {
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    const state = { id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, x: e.clientX, y: e.clientY };
    setDrag(state);
    const move = (m: MouseEvent) => setDrag((d) => (d ? { ...d, x: m.clientX, y: m.clientY } : d));
    const up = (m: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDrag(undefined);
      onLayout(drop(latest.current, id, m.clientX, m.clientY, state.offsetX, state.offsetY));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /** Where a toolbar dropped at (x, y) goes: an edge near the pointer, or floating. */
  const drop = (current: ToolbarLayout, id: string, x: number, y: number, offsetX: number, offsetY: number): ToolbarLayout => {
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      const el = docks[edge].current;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const horizontal = edge === 'top' || edge === 'bottom';
      const inside = horizontal
        ? x >= r.left && x <= r.right && y >= r.top - DOCK_SNAP_PX && y <= r.bottom + DOCK_SNAP_PX
        : y >= r.top && y <= r.bottom && x >= r.left - DOCK_SNAP_PX && x <= r.right + DOCK_SNAP_PX;
      if (!inside) continue;
      const bandEls = [...el.querySelectorAll<HTMLElement>(':scope > .toolbar-band')];
      let band = bandEls.findIndex((b) => {
        const br = b.getBoundingClientRect();
        return horizontal ? y >= br.top && y <= br.bottom : x >= br.left && x <= br.right;
      });
      if (band === -1) {
        // Beyond the existing bands: a new band on the outer or inner side.
        const outer = edge === 'top' ? y < r.top + 4 : edge === 'bottom' ? y > r.bottom - 4 : edge === 'left' ? x < r.left + 4 : x > r.right - 4;
        band = outer && (edge === 'top' || edge === 'left') ? 0 : bandEls.length;
        if (band === 0 && bandEls.length > 0) return insertBand(current, id, edge);
      }
      const boxes = bandEls[band] ? [...bandEls[band]!.querySelectorAll<HTMLElement>(':scope > .toolbar-box')].filter((b) => b.dataset['toolbar'] !== id) : [];
      const order = boxes.findIndex((b) => {
        const br = b.getBoundingClientRect();
        return horizontal ? x < br.left + br.width / 2 : y < br.top + br.height / 2;
      });
      return dockToolbar(current, id, edge, band, order === -1 ? undefined : order);
    }
    return floatToolbar(current, id, x - offsetX, y - offsetY);
  };

  const renderDock = (edge: Dock) => (
    <div ref={docks[edge]} className={`dock dock-${edge}${drag ? ' dragging' : ''}`}>
      {bandsOf(layout, edge).map((band, i) => (
        <div key={i} className="toolbar-band">
          {band.map((toolbar) => (
            <ToolbarBox
              key={toolbar.id}
              toolbar={toolbar}
              edge={edge}
              commands={commands}
              catalog={catalog}
              ghost={drag?.id === toolbar.id}
              onGrip={(e, box) => startDrag(toolbar.id, e, box)}
              onColumns={(columns) => reshape(toolbar.id, columns)}
            />
          ))}
        </div>
      ))}
    </div>
  );

  const dragged = drag ? layout.toolbars.find((tb) => tb.id === drag.id) : undefined;
  return (
    <div className="toolbar-frame">
      {renderDock('top')}
      <div className="toolbar-middle">
        {renderDock('left')}
        <div className="toolbar-center">{children}</div>
        {renderDock('right')}
        {aside}
      </div>
      {renderDock('bottom')}
      {floating(layout).map((toolbar) => (
        <FloatingToolbar
          key={toolbar.id}
          toolbar={toolbar}
          commands={commands}
          catalog={catalog}
          ghost={drag?.id === toolbar.id}
          onGrip={(e, box) => startDrag(toolbar.id, e, box)}
          onColumns={(columns) => reshape(toolbar.id, columns)}
          onHide={() => onLayout(setVisible(layout, toolbar.id, false))}
          onDock={() => onLayout(dockToolbar(layout, toolbar.id, 'top', Number.MAX_SAFE_INTEGER))}
        />
      ))}
      {drag && dragged && (
        <div className="toolbar-ghost" style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}>
          {toolbarName(dragged, catalog)}
        </div>
      )}
    </div>
  );
}

/** Docks a toolbar in a new band placed before all existing bands of an edge. */
function insertBand(layout: ToolbarLayout, id: string, edge: Dock): ToolbarLayout {
  return compactBands({
    ...layout,
    toolbars: layout.toolbars.map((tb) => {
      if (tb.id === id) return { ...tb, visible: true, place: { kind: 'dock', dock: edge, band: -1, order: 0 } };
      return tb;
    }),
  });
}

interface BoxProps {
  readonly toolbar: ToolbarState;
  readonly commands: ReadonlyMap<string, Command>;
  readonly catalog: Catalog;
  readonly ghost?: boolean;
  onGrip(e: ReactMouseEvent, box: HTMLElement): void;
  /** Reshapes the toolbar into a grid with this many columns. */
  onColumns(columns: number): void;
}

/**
 * Starts reshaping from a corner handle, like resizing a window: dragging
 * sideways adds or removes columns, dragging down or up adds or removes rows
 * (the toolbar gets taller and narrower). Whichever way the pointer moved
 * more wins. `direction` is -1 for toolbars docked at the right edge, which
 * grow towards the sheet (to the left).
 */
function startReshape(e: ReactMouseEvent, items: readonly string[], columns: number, direction: 1 | -1, onColumns: (columns: number) => void): void {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const count = Math.max(1, items.filter((i) => i !== SEPARATOR).length);
  const rows = Math.ceil(count / columns);
  const move = (m: MouseEvent) => {
    const dx = (m.clientX - startX) * direction;
    const dy = m.clientY - startY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      onColumns(columns + Math.round(dx / CELL_PX));
    } else {
      onColumns(Math.ceil(count / Math.max(1, rows + Math.round(dy / CELL_PX))));
    }
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function ToolbarBox({ toolbar, commands, catalog, edge, ghost, onGrip, onColumns }: BoxProps & { edge: Dock }) {
  const box = useRef<HTMLDivElement>(null);
  const vertical = edge === 'left' || edge === 'right';
  // Only toolbars at the side edges widen into several columns.
  const columns = vertical ? (toolbar.columns ?? 1) : undefined;
  return (
    <div ref={box} className={`toolbar-box${vertical ? ' vertical' : ''}${ghost ? ' ghost' : ''}`} data-toolbar={toolbar.id} role="toolbar" aria-label={toolbarName(toolbar, catalog)}>
      <span className="toolbar-grip" title={toolbarName(toolbar, catalog)} onMouseDown={(e) => box.current && onGrip(e, box.current)} />
      <Buttons items={toolbar.items} commands={commands} {...(columns !== undefined && columns > 1 ? { columns } : {})} />
      {columns !== undefined && (
        <span
          className={`reshape-handle corner${edge === 'right' ? ' mirrored' : ''}`}
          title={t(catalog, 'toolbar.reshape')}
          onMouseDown={(e) => startReshape(e, toolbar.items, columns, edge === 'right' ? -1 : 1, onColumns)}
        />
      )}
    </div>
  );
}

function FloatingToolbar({ toolbar, commands, catalog, ghost, onGrip, onColumns, onHide, onDock }: BoxProps & { onHide(): void; onDock(): void }) {
  const box = useRef<HTMLDivElement>(null);
  if (toolbar.place.kind !== 'float') return null;
  const buttons = toolbar.items.filter((i) => i !== SEPARATOR).length;
  const columns = toolbar.columns ?? Math.max(1, Math.min(buttons, DEFAULT_FLOAT_COLUMNS));
  return (
    <div ref={box} className={`float-toolbar${ghost ? ' ghost' : ''}`} style={{ left: toolbar.place.x, top: toolbar.place.y }} role="toolbar" aria-label={toolbarName(toolbar, catalog)}>
      <div className="float-title" onMouseDown={(e) => box.current && onGrip(e, box.current)} onDoubleClick={onDock}>
        <span>{toolbarName(toolbar, catalog)}</span>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onHide} aria-label={t(catalog, 'dlg.close')}>
          ×
        </button>
      </div>
      <div className="float-buttons">
        <Buttons items={toolbar.items} commands={commands} columns={columns} />
      </div>
      <span className="reshape-handle corner" title={t(catalog, 'toolbar.reshape')} onMouseDown={(e) => startReshape(e, toolbar.items, columns, 1, onColumns)} />
    </div>
  );
}

/** Buttons in a row or column, or in a grid of `columns` (separators then take no cell). */
function Buttons({ items, commands, columns }: { items: readonly string[]; commands: ReadonlyMap<string, Command>; columns?: number }) {
  const grid = columns !== undefined;
  const buttons = items.map((id, i) => {
    if (id === SEPARATOR) return grid ? null : <span key={i} className="toolbar-separator" />;
    const cmd = commands.get(id);
    if (!cmd) return null;
    const icon = commandIcon(id);
    const tip = plainLabel(cmd.label) + (cmd.shortcut ? ` (${cmd.shortcut})` : '');
    return (
      <button
        key={i}
        type="button"
        className={`tool-button${cmd.checked ? ' checked' : ''}${icon ? '' : ' glyph'}`}
        title={tip}
        aria-label={tip}
        aria-pressed={cmd.checked}
        disabled={!cmd.enabled}
        // Keep the focus in the line being edited, so symbols go where the caret is.
        onMouseDown={(e) => e.preventDefault()}
        onClick={cmd.run}
      >
        {icon ?? cmd.glyph ?? plainLabel(cmd.label)}
      </button>
    );
  });
  if (!grid) return <>{buttons}</>;
  return (
    <div className="button-grid" style={{ gridTemplateColumns: `repeat(${columns}, ${CELL_PX - 2}px)` }}>
      {buttons}
    </div>
  );
}
