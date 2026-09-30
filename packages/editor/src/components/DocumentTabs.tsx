/**
 * Tabs of the open calculations above the workspace. A click switches, the
 * cross or the middle mouse button closes, "+" starts a new calculation.
 */

import { t, type Catalog } from '@calccanvas/i18n';

export interface DocumentTabInfo {
  readonly id: number;
  readonly title: string;
  readonly dirty: boolean;
  readonly path?: string;
}

interface Props {
  readonly tabs: readonly DocumentTabInfo[];
  readonly active: number;
  readonly catalog: Catalog;
  onSelect(id: number): void;
  onClose(id: number): void;
  onNew(): void;
}

export function DocumentTabs({ tabs, active, catalog, onSelect, onClose, onNew }: Props) {
  return (
    <nav className="doc-tabs" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          className={`doc-tab${tab.id === active ? ' active' : ''}`}
          data-doc={tab.id}
          title={tab.path ?? tab.title}
          onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
        >
          <button type="button" className="doc-tab-title" onClick={() => onSelect(tab.id)}>
            {tab.title}
            {tab.dirty && <span className="doc-dirty"> •</span>}
          </button>
          <button type="button" className="doc-tab-close" title={t(catalog, 'docs.close')} onClick={() => onClose(tab.id)}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="doc-tab-new" title={t(catalog, 'docs.new')} onClick={onNew}>
        +
      </button>
    </nav>
  );
}
