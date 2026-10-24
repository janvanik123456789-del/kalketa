/**
 * The ribbon (Settings > Controls > Layout): the menus of the program as tabs, each split into groups where
 * the menu has its separators. A command with an icon is a large button with its name under it, the others
 * small ones; a submenu (Samples, Recent files) is a button with its list. Made from the same menus, so
 * nothing is kept twice and the ribbon offers all the menus do. Collapsed, only the tabs show; a click on
 * one opens it again.
 */

import { useState, type MouseEvent } from 'react';
import { t, type Catalog } from '@kalketa/i18n';
import { plainLabel, type Command } from '../commands.js';
import { commandIcon } from '../icons.js';
import { ContextMenu, type Menu, type MenuItem } from './MenuBar.js';

/** The tab shown at first: Insert, what is used most. */
const FIRST_TAB = 3;

export function Ribbon({ menus, commands, catalog, collapsed, onCollapse }: { menus: readonly Menu[]; commands: ReadonlyMap<string, Command>; catalog: Catalog; collapsed: boolean; onCollapse(collapsed: boolean): void }) {
  const [tab, setTab] = useState(Math.min(FIRST_TAB, menus.length - 1));
  const [list, setList] = useState<{ items: readonly MenuItem[]; at: { x: number; y: number } } | undefined>();
  const menu = menus[tab];
  const groups = (menu?.items ?? []).reduce<MenuItem[][]>(
    (all, item) => {
      if (item.kind === 'separator') all.push([]);
      else all[all.length - 1]!.push(item);
      return all;
    },
    [[]],
  ).filter((g) => g.length > 0);
  const below = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.bottom + 2) };
  };
  // Pressed buttons keep the focus in the line being edited, as the toolbars do.
  const keep = (e: MouseEvent) => e.preventDefault();
  const button = (item: MenuItem, i: number) => {
    if (item.kind === 'separator') return null;
    if (item.kind === 'submenu') {
      return (
        <button key={i} type="button" className="ribbon-button small" onMouseDown={keep} onClick={(e) => setList({ items: item.items, at: below(e) })}>
          {plainLabel(item.label)} ▾
        </button>
      );
    }
    if (item.kind === 'action') {
      return (
        <button key={i} type="button" className={`ribbon-button small${item.checked ? ' checked' : ''}`} disabled={item.enabled === false} aria-pressed={item.checked} title={item.shortcut} onMouseDown={keep} onClick={item.run}>
          {plainLabel(item.label)}
        </button>
      );
    }
    const cmd = commands.get(item.id);
    if (!cmd) return null;
    const icon = commandIcon(item.id);
    const label = plainLabel(cmd.label);
    return (
      <button
        key={i}
        type="button"
        className={`ribbon-button ${icon ? 'large' : 'small'}${cmd.checked ? ' checked' : ''}`}
        data-command={item.id}
        disabled={!cmd.enabled}
        aria-pressed={cmd.checked}
        title={cmd.shortcut ? `${label} (${cmd.shortcut})` : label}
        onMouseDown={keep}
        onClick={(e) => {
          const choices = cmd.choices;
          if (!choices) return cmd.run();
          setList({ items: choices.map((c) => ({ kind: 'action' as const, label: c.label, run: c.run })), at: below(e) });
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };
  return (
    <div className={`ribbon${collapsed ? ' collapsed' : ''}`}>
      <div className="ribbon-tabs" role="tablist">
        {menus.map((m, i) => (
          <button
            key={m.label}
            type="button"
            role="tab"
            aria-selected={i === tab}
            className={`ribbon-tab${i === tab && !collapsed ? ' active' : ''}`}
            onMouseDown={keep}
            onClick={() => {
              setTab(i);
              if (collapsed) onCollapse(false);
            }}
          >
            {plainLabel(m.label)}
          </button>
        ))}
        <span className="grow" />
        <button type="button" className="ribbon-collapse" title={t(catalog, collapsed ? 'ribbon.expand' : 'ribbon.collapse')} aria-label={t(catalog, collapsed ? 'ribbon.expand' : 'ribbon.collapse')} onMouseDown={keep} onClick={() => onCollapse(!collapsed)}>
          {collapsed ? '⌄' : '⌃'}
        </button>
      </div>
      {!collapsed && (
        <div className="ribbon-panel" role="tabpanel">
          {groups.map((group, g) => (
            <div key={g} className="ribbon-group">
              {group.map(button)}
            </div>
          ))}
        </div>
      )}
      {list && <ContextMenu items={list.items} commands={commands} at={list.at} onClose={() => setList(undefined)} />}
    </div>
  );
}
