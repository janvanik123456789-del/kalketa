/**
 * Classic drop-down menu bar: File, Edit, View, Insert, Tools, Help.
 * Alt shows the underlined letters, Alt+letter opens a menu, arrows move,
 * Enter runs, Esc closes. Clicking keeps the focus where the user was typing.
 */

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Command } from '../commands.js';
import { commandIcon } from '../icons.js';

export type MenuItem =
  | { readonly kind: 'command'; readonly id: string }
  | { readonly kind: 'separator' }
  | { readonly kind: 'submenu'; readonly label: string; readonly items: readonly MenuItem[] }
  | { readonly kind: 'action'; readonly label: string; readonly checked?: boolean; readonly enabled?: boolean; readonly shortcut?: string; run(): void };

export interface Menu {
  readonly label: string;
  readonly items: readonly MenuItem[];
}

interface Props {
  readonly menus: readonly Menu[];
  readonly commands: ReadonlyMap<string, Command>;
}

/** "&Soubor" -> "Soubor" with the letter after "&" underlined when `underline`. */
export function Mnemonic({ label, underline }: { label: string; underline: boolean }): ReactNode {
  const at = label.indexOf('&');
  if (at === -1 || at === label.length - 1) return label;
  return (
    <>
      {label.slice(0, at)}
      {underline ? <u>{label[at + 1]}</u> : label[at + 1]}
      {label.slice(at + 2)}
    </>
  );
}

function mnemonicOf(label: string): string | undefined {
  const at = label.indexOf('&');
  return at === -1 ? undefined : label[at + 1]?.toLowerCase();
}

export function MenuBar({ menus, commands }: Props) {
  const [open, setOpen] = useState<number | undefined>();
  const [altMode, setAltMode] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let altAlone = false;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altAlone = true;
        setAltMode(true);
        return;
      }
      altAlone = false;
      if (e.altKey && !e.ctrlKey && e.key.length === 1) {
        const index = menus.findIndex((m) => mnemonicOf(m.label) === e.key.toLowerCase());
        if (index !== -1) {
          e.preventDefault();
          setOpen(index);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      setAltMode(false);
      // Alt pressed and released alone opens the first menu, as in Windows.
      if (altAlone) {
        e.preventDefault();
        setOpen((current) => (current === undefined ? 0 : undefined));
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [menus]);

  useEffect(() => {
    if (open === undefined) return;
    const close = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(undefined);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="menubar" ref={bar} role="menubar" onMouseDown={(e) => e.preventDefault()}>
      {menus.map((menu, i) => (
        <div key={i} className={`menubar-item${open === i ? ' open' : ''}`}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? undefined : i)}
            onMouseEnter={() => open !== undefined && setOpen(i)}
          >
            <Mnemonic label={menu.label} underline={altMode || open !== undefined} />
          </button>
          {open === i && (
            <MenuPanel
              items={menu.items}
              commands={commands}
              onClose={() => setOpen(undefined)}
              onNeighbour={(d) => setOpen((i + d + menus.length) % menus.length)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** A menu at a point of the window: right click, or a small ▾ button. */
export function ContextMenu({ items, commands, at, onClose }: { items: readonly MenuItem[]; commands: ReadonlyMap<string, Command>; at: { x: number; y: number }; onClose(): void }) {
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!anchor.current?.contains(e.target as Node)) onClose();
    };
    // Listening starts after the event that opened the menu, which is still on its way up to the window.
    const timer = window.setTimeout(() => window.addEventListener('mousedown', close));
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', close);
    };
  }, [onClose]);
  return (
    <div ref={anchor} className="context-menu" style={{ left: at.x, top: at.y }} onMouseDown={(e) => e.preventDefault()}>
      <MenuPanel items={items} commands={commands} onClose={onClose} />
    </div>
  );
}

interface PanelProps {
  readonly items: readonly MenuItem[];
  readonly commands: ReadonlyMap<string, Command>;
  onClose(): void;
  /** Left/right arrow in a top-level menu moves to the neighbouring menu. */
  onNeighbour?(direction: 1 | -1): void;
}

interface Row {
  readonly label: string;
  readonly shortcut?: string;
  readonly checked?: boolean;
  readonly enabled: boolean;
  readonly icon?: ReactNode;
  readonly submenu?: readonly MenuItem[];
  run?(): void;
}

function rowOf(item: MenuItem, commands: ReadonlyMap<string, Command>): Row | undefined {
  switch (item.kind) {
    case 'separator':
      return undefined;
    case 'submenu':
      return { label: item.label, enabled: item.items.length > 0, submenu: item.items };
    case 'action':
      return { label: item.label, enabled: item.enabled ?? true, run: item.run, ...(item.checked !== undefined ? { checked: item.checked } : {}), ...(item.shortcut ? { shortcut: item.shortcut } : {}) };
    case 'command': {
      const cmd = commands.get(item.id);
      if (!cmd) return undefined;
      return {
        label: cmd.label,
        enabled: cmd.enabled,
        run: cmd.run,
        icon: commandIcon(cmd.id),
        ...(cmd.shortcut ? { shortcut: cmd.shortcut } : {}),
        ...(cmd.checked !== undefined ? { checked: cmd.checked } : {}),
      };
    }
  }
}

function MenuPanel({ items, commands, onClose, onNeighbour }: PanelProps) {
  const rows = items.map((item) => rowOf(item, commands));
  const selectable = rows.map((r, i) => (r?.enabled ? i : -1)).filter((i) => i !== -1);
  const [active, setActive] = useState<number>(selectable[0] ?? -1);
  const [submenu, setSubmenu] = useState<number | undefined>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submenu !== undefined) return; // the open submenu handles keys
      const pos = selectable.indexOf(active);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive(selectable[(pos + step + selectable.length) % selectable.length] ?? -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (rows[active]?.submenu) setSubmenu(active);
        else onNeighbour?.(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNeighbour?.(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activate(active);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key.length === 1 && !e.ctrlKey) {
        const index = rows.findIndex((r) => r?.enabled && mnemonicOf(r.label) === e.key.toLowerCase());
        if (index !== -1) {
          e.preventDefault();
          activate(index);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const activate = (index: number) => {
    const row = rows[index];
    if (!row?.enabled) return;
    if (row.submenu) {
      setActive(index);
      setSubmenu(index);
      return;
    }
    onClose();
    row.run?.();
  };

  // A menu that would leave the window opens to the other side (submenus) or shifts left.
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    // A menu opened near the bottom (the layer tabs) opens upwards.
    const below = rect.bottom - window.innerHeight;
    if (below > 0) element.style.top = `calc(100% - ${Math.min(rect.height, below + 2)}px)`;
    const overflow = rect.right - window.innerWidth;
    if (overflow <= 0) return;
    const anchor = element.parentElement;
    if (anchor?.classList.contains('submenu-anchor')) anchor.classList.add('flipped');
    else element.style.left = `${-overflow - 2}px`;
  }, []);

  return (
    <div ref={panel} className="menu-panel" role="menu">
      {items.map((item, i) => {
        const row = rows[i];
        if (!row) return item.kind === 'separator' ? <div key={i} className="menu-separator" role="separator" /> : <Fragment key={i} />;
        return (
          <div key={i} className="menu-entry">
            <button
              type="button"
              role={row.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={row.checked}
              disabled={!row.enabled}
              className={`menu-row${i === active ? ' active' : ''}`}
              onMouseEnter={() => {
                setActive(i);
                setSubmenu(row.submenu ? i : undefined);
              }}
              onClick={() => activate(i)}
            >
              <span className="menu-check">{row.checked ? '✓' : row.icon ?? ''}</span>
              <span className="menu-label">
                <Mnemonic label={row.label} underline />
              </span>
              <span className="menu-shortcut">{row.submenu ? '▸' : (row.shortcut ?? '')}</span>
            </button>
            {submenu === i && row.submenu && (
              <div className="submenu-anchor">
                <MenuPanel items={row.submenu} commands={commands} onClose={onClose} onNeighbour={() => setSubmenu(undefined)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
