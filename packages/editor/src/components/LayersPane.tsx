/**
 * Layers of the sheet: the side panel that manages them, and the tab strip
 * under the workspace that switches between the visible ones.
 */

import { t, type Catalog } from '@calccanvas/i18n';
import { isRemovable, moveLayer, updateLayer, type Layer, type LayerKind } from '@calccanvas/sheet';
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
  nameOf(layer: Layer): string;
  onActivate(id: string): void;
  onOpenBeside(id: string): void;
  onAdd(): void;
}

/** Tabs of the visible layers, like sheets of a workbook. Ctrl+click opens one side by side. */
export function LayerTabs({ layers, active, open, catalog, nameOf, onActivate, onOpenBeside, onAdd }: TabsProps) {
  return (
    <nav className="layer-tabs" aria-label={t(catalog, 'layers.tabs')}>
      {layers
        .filter((l) => l.visible || open.includes(l.id))
        .map((layer) => (
          <button
            key={layer.id}
            type="button"
            className={`layer-tab${layer.id === active ? ' active' : open.includes(layer.id) ? ' open' : ''}`}
            data-layer={layer.id}
            title={t(catalog, 'layers.tabHint')}
            onClick={(e) => (e.ctrlKey || e.metaKey ? onOpenBeside(layer.id) : onActivate(layer.id))}
          >
            <span className="glyph">{LAYER_GLYPH[layer.kind]}</span> {nameOf(layer)}
            {layer.locked && <LockIcon />}
          </button>
        ))}
      <button type="button" className="layer-tab add" title={t(catalog, 'layers.add')} onClick={onAdd}>
        +
      </button>
    </nav>
  );
}
