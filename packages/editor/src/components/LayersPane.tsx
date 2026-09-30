/**
 * Layers of the sheet: the side panel that manages them, and the tab strip
 * under the workspace that switches between the visible ones.
 */

import { t, type Catalog } from '@calccanvas/i18n';
import { isRemovable, moveLayer, updateLayer, type Layer, type LayerKind } from '@calccanvas/sheet';
import { useState } from 'react';
import type { Command } from '../commands.js';
import { ContextMenu, type MenuItem } from './MenuBar.js';
import { ask } from './Ask.js';

/** Two panels side by side. Drawn, so it does not depend on the fonts of the system. */
function BesideIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1.5" y="2.5" width="6" height="11" rx="1" fill="none" stroke="currentColor" />
      <rect x="8.5" y="2.5" width="6" height="11" rx="1" fill="none" stroke="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="inline-icon lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1" fill="currentColor" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export const LAYER_GLYPH: Readonly<Record<LayerKind, string>> = { sheet: '▤', calc: '∑', data: '▦', ai: '✦', sources: '❝' };
export const NEW_LAYER_KINDS = ['calc', 'data', 'sources'] as const;

interface PaneProps {
  readonly layers: readonly Layer[];
  readonly active: string;
  readonly catalog: Catalog;
  /** Auxiliary calculations the sheet takes values from. */
  readonly used: ReadonlySet<string>;
  /** Layers open in the workspace. */
  readonly open: readonly string[];
  nameOf(layer: Layer): string;
  onActivate(id: string): void;
  onOpenBeside(id: string): void;
  onChange(layers: Layer[]): void;
  onAdd(kind: (typeof NEW_LAYER_KINDS)[number]): void;
  onDelete(id: string): void;
  /** Blocks stored in the sheet. */
  readonly blocks: readonly { readonly name: string; readonly version: string; readonly origin?: string }[];
  onDeleteBlock(name: string): void;
}

export function LayersPane({ layers, active, catalog, used, open, nameOf, onActivate, onOpenBeside, onChange, onAdd, onDelete, blocks, onDeleteBlock }: PaneProps) {
  const set = (id: string, change: Parameters<typeof updateLayer>[2]) => onChange(updateLayer(layers, id, change));
  return (
    <aside className="layers-pane">
      <h2>{t(catalog, 'layers.title')}</h2>
      <ol className="layer-list">
        {layers.map((layer, i) => {
          const main = layer.kind === 'sheet';
          const printable = layer.kind === 'calc' || layer.kind === 'sources' || layer.kind === 'ai';
          return (
            <li key={layer.id} className={`layer-item${layer.id === active ? ' active' : open.includes(layer.id) ? ' open' : ''}${layer.visible ? '' : ' hidden'}`} data-layer={layer.id}>
              <div className="layer-head">
                <button type="button" className="layer-name" onClick={() => onActivate(layer.id)} title={t(catalog, 'layers.open')}>
                  <span className="glyph">{LAYER_GLYPH[layer.kind]}</span> {nameOf(layer)}
                  {layer.name && layer.name !== t(catalog, `layer.kind.${layer.kind}`) && <span className="kind"> · {t(catalog, `layer.kind.${layer.kind}`)}</span>}
                </button>
                <span className="layer-actions">
                  <button type="button" title={t(catalog, 'layers.openBeside')} onClick={() => onOpenBeside(layer.id)}>
                    <BesideIcon />
                  </button>
                  {!main && (
                    <>
                    <button type="button" disabled={i <= 1} title={t(catalog, 'layers.up')} onClick={() => onChange(moveLayer(layers, layer.id, -1))}>
                      ↑
                    </button>
                    <button type="button" disabled={i === layers.length - 1} title={t(catalog, 'layers.down')} onClick={() => onChange(moveLayer(layers, layer.id, 1))}>
                      ↓
                    </button>
                    <button
                      type="button"
                      title={t(catalog, 'layers.rename')}
                      onClick={async () => {
                        const name = (await ask(t(catalog, 'layers.newName'), nameOf(layer)))?.trim();
                        if (name) set(layer.id, { name });
                      }}
                    >
                      ✎
                    </button>
                    </>
                  )}
                  {isRemovable(layer) && (
                    <button type="button" title={t(catalog, 'layers.delete')} onClick={() => onDelete(layer.id)}>
                      ✕
                    </button>
                  )}
                </span>
              </div>
              <div className="layer-flags">
                <label title={main ? t(catalog, 'layers.mainHiddenHint') : undefined}>
                  <input type="checkbox" checked={layer.visible} onChange={(e) => set(layer.id, { visible: e.target.checked })} /> {t(catalog, 'layers.visible')}
                </label>
                {layer.kind !== 'ai' && (
                  <label>
                    <input type="checkbox" checked={layer.locked} onChange={(e) => set(layer.id, { locked: e.target.checked })} /> {t(catalog, 'layers.locked')}
                  </label>
                )}
                {printable && (
                  <label>
                    <input type="checkbox" checked={layer.appendix || used.has(layer.id)} disabled={used.has(layer.id)} onChange={(e) => set(layer.id, { appendix: e.target.checked })} />{' '}
                    {t(catalog, 'layers.appendix')}
                  </label>
                )}
              </div>
              {used.has(layer.id) && <div className="layer-note">{t(catalog, 'layers.used')}</div>}
            </li>
          );
        })}
      </ol>
      <h3>{t(catalog, 'layers.add')}</h3>
      <div className="layer-add">
        {NEW_LAYER_KINDS.map((kind) => (
          <button key={kind} type="button" className="secondary" onClick={() => onAdd(kind)}>
            <span className="glyph">{LAYER_GLYPH[kind]}</span> {t(catalog, `layer.kind.${kind}`)}
          </button>
        ))}
      </div>
      <h3>{t(catalog, 'blocks.title')}</h3>
      {blocks.length === 0 ? (
        <p className="muted small">{t(catalog, 'blocks.none')}</p>
      ) : (
        <ul className="block-list">
          {blocks.map((block) => (
            <li key={block.name} className="block-item" data-block={block.name}>
              <span className="glyph">▣</span>
              <span className="block-name">{block.name}</span>
              <span className="block-info">
                {t(catalog, 'blocks.version', { version: block.version })}
                {block.origin ? ` · ${t(catalog, 'blocks.origin', { origin: block.origin })}` : ''}
              </span>
              <button type="button" title={t(catalog, 'blocks.delete')} onClick={() => onDeleteBlock(block.name)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

interface TabsProps {
  readonly layers: readonly Layer[];
  readonly active: string;
  /** Layers open in the workspace. */
  readonly open: readonly string[];
  readonly catalog: Catalog;
  /** Auxiliary calculations the sheet takes values from. */
  readonly used: ReadonlySet<string>;
  readonly commands: ReadonlyMap<string, Command>;
  nameOf(layer: Layer): string;
  onActivate(id: string): void;
  onOpenBeside(id: string): void;
  onChange(layers: Layer[]): void;
  onAdd(kind: (typeof NEW_LAYER_KINDS)[number]): void;
  onDelete(id: string): void;
}

type OpenMenu = { readonly items: readonly MenuItem[]; readonly at: { x: number; y: number } };

/**
 * Tabs of all layers, like sheets of a workbook; a hidden layer has a greyed
 * tab. Ctrl+click opens a layer side by side, right click (or ▾ on the active
 * tab) offers what the layer can do, "+" adds a layer.
 */
export function LayerTabs({ layers, active, open, catalog, used, commands, nameOf, onActivate, onOpenBeside, onChange, onAdd, onDelete }: TabsProps) {
  const [menu, setMenu] = useState<OpenMenu | undefined>();
  const set = (id: string, change: Parameters<typeof updateLayer>[2]) => onChange(updateLayer(layers, id, change));

  const layerMenu = (layer: Layer): MenuItem[] => {
    const main = layer.kind === 'sheet';
    const i = layers.indexOf(layer);
    const printable = layer.kind === 'calc' || layer.kind === 'sources' || layer.kind === 'ai';
    const items: MenuItem[] = [
      { kind: 'action', label: t(catalog, 'layers.openBeside'), enabled: layer.visible, run: () => onOpenBeside(layer.id) },
      { kind: 'separator' },
      { kind: 'action', label: t(catalog, 'layers.visible'), checked: layer.visible, run: () => set(layer.id, { visible: !layer.visible }) },
    ];
    if (layer.kind !== 'ai') items.push({ kind: 'action', label: t(catalog, 'layers.locked'), checked: layer.locked, run: () => set(layer.id, { locked: !layer.locked }) });
    if (printable) {
      items.push({
        kind: 'action',
        label: used.has(layer.id) ? `${t(catalog, 'layers.appendix')} (${t(catalog, 'layers.used')})` : t(catalog, 'layers.appendix'),
        checked: Boolean(layer.appendix) || used.has(layer.id),
        enabled: !used.has(layer.id),
        run: () => set(layer.id, { appendix: !layer.appendix }),
      });
    }
    if (!main) {
      items.push(
        { kind: 'separator' },
        {
          kind: 'action',
          label: t(catalog, 'layers.rename'),
          run: () =>
            void ask(t(catalog, 'layers.newName'), nameOf(layer)).then((name) => {
              if (name?.trim()) set(layer.id, { name: name.trim() });
            }),
        },
        { kind: 'action', label: t(catalog, 'layers.moveLeft'), enabled: i > 1, run: () => onChange(moveLayer(layers, layer.id, -1)) },
        { kind: 'action', label: t(catalog, 'layers.moveRight'), enabled: i < layers.length - 1, run: () => onChange(moveLayer(layers, layer.id, 1)) },
      );
    }
    if (isRemovable(layer)) items.push({ kind: 'separator' }, { kind: 'action', label: t(catalog, 'layers.delete'), run: () => onDelete(layer.id) });
    return items;
  };

  const addMenu: MenuItem[] = NEW_LAYER_KINDS.map((kind) => ({ kind: 'action', label: `${LAYER_GLYPH[kind]}  ${t(catalog, `layer.kind.${kind}`)}`, run: () => onAdd(kind) }));

  const openMenu = (items: readonly MenuItem[], e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ items, at: { x: e.clientX, y: e.clientY } });
  };

  return (
    <nav className="layer-tabs" aria-label={t(catalog, 'layers.tabs')}>
      {layers.map((layer) => (
        <div
          key={layer.id}
          role="button"
          tabIndex={0}
          className={`layer-tab${layer.id === active ? ' active' : open.includes(layer.id) ? ' open' : ''}${layer.visible ? '' : ' hidden'}`}
          data-layer={layer.id}
          title={[t(catalog, 'layers.tabHint'), used.has(layer.id) ? t(catalog, 'layers.used') : '', layer.visible ? '' : t(catalog, 'layers.hiddenTab')].filter(Boolean).join('\n')}
          onClick={(e) => {
            // A hidden layer's tab shows the layer again.
            if (!layer.visible) set(layer.id, { visible: true });
            if (e.ctrlKey || e.metaKey) onOpenBeside(layer.id);
            else onActivate(layer.id);
          }}
          onContextMenu={(e) => openMenu(layerMenu(layer), e)}
        >
          <span className="glyph">{LAYER_GLYPH[layer.kind]}</span> {nameOf(layer)}
          {layer.locked && <LockIcon />}
          {layer.id === active && (
            <button type="button" className="tab-menu" title={t(catalog, 'layers.menu')} onClick={(e) => openMenu(layerMenu(layer), e)}>
              ▾
            </button>
          )}
        </div>
      ))}
      <button type="button" className="layer-tab add" title={t(catalog, 'layers.add')} onClick={(e) => openMenu(addMenu, e)}>
        +
      </button>
      {menu && <ContextMenu items={menu.items} commands={commands} at={menu.at} onClose={() => setMenu(undefined)} />}
    </nav>
  );
}
