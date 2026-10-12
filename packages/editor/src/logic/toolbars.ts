/**
 * Toolbar layout in the style of classic CAD programs: toolbars dock at any
 * edge of the window, in bands (rows at the top and bottom, columns at the
 * sides), or float freely. Users can build their own toolbars from any
 * command. The layout is a user preference, stored outside the document.
 */

export type Dock = 'top' | 'bottom' | 'left' | 'right';

export type ToolbarPlace =
  | { readonly kind: 'dock'; readonly dock: Dock; readonly band: number; readonly order: number }
  | { readonly kind: 'float'; readonly x: number; readonly y: number };

export interface ToolbarState {
  readonly id: string;
  /** Built-in toolbars are named by a label key and cannot be deleted. */
  readonly builtin: boolean;
  /** User-given name (custom toolbars, or a renamed built-in one). */
  readonly name?: string;
  /** Command ids; SEPARATOR divides groups. */
  readonly items: readonly string[];
  readonly visible: boolean;
  readonly place: ToolbarPlace;
  /**
   * Buttons per row when the toolbar is a grid: floating toolbars, and
   * toolbars docked at the left or right edge (default one column there).
   */
  readonly columns?: number;
}

export interface ToolbarLayout {
  readonly version: 1;
  /** Which built-in buttons the layout knows (see ADDED_ITEMS); older layouts get the newer ones. */
  readonly items?: number;
  readonly toolbars: readonly ToolbarState[];
}

/**
 * Buttons added to built-in toolbars after their first version. A stored
 * layout gets them once, next to the button they follow; a button the user
 * removes later stays removed.
 */
const ADDED_ITEMS: readonly { readonly since: number; readonly toolbar: string; readonly after: string; readonly ids: readonly string[] }[] = [
  { since: 2, toolbar: 'operators', after: 'sym:√', ids: ['sym:∛', 'fn:root'] },
  { since: 2, toolbar: 'operators', after: 'sym:³', ids: ['sym:^'] },
  { since: 3, toolbar: 'view', after: 'view.paneTables', ids: ['view.paneChat'] },
  { since: 4, toolbar: 'functions', after: 'fn:solve', ids: ['fn:derive'] },
  // The definition sign first, above ·: a plain = typed by mistake is fixed with one click.
  { since: 5, toolbar: 'operators', after: '', ids: ['sym::='] },
  // A vector arrow over the letter before the cursor (p⃗_1), next to the index.
  { since: 6, toolbar: 'operators', after: 'sym:_', ids: ['sym:⃗'] },
  // Equal when rounded, for a rounded result of a derivation (5,47 ≐ 5,5 mm).
  { since: 7, toolbar: 'operators', after: 'sym:≠', ids: ['sym:≐'] },
  // Derivatives of a differential equation: w′, w″.
  { since: 8, toolbar: 'operators', after: 'sym:⃗', ids: ['sym:′', 'sym:″'] },
  // The conditions of a solution as on paper (solve x ∈ ℝ: …) and the two roots (−b ± √D)/(2·a).
  { since: 9, toolbar: 'operators', after: 'sym:≐', ids: ['sym:±', 'sym:∈', 'sym:ℝ', 'sym:ℂ'] },
];
export const ITEMS_VERSION = 9;

export const SEPARATOR = '|';

const dock = (d: Dock, band: number, order: number): ToolbarPlace => ({ kind: 'dock', dock: d, band, order });

export const GREEK_SYMBOLS = ['α', 'β', 'γ', 'δ', 'ε', 'η', 'θ', 'λ', 'μ', 'ν', 'π', 'ρ', 'σ', 'τ', 'φ', 'ψ', 'ω', 'Δ', 'Σ', 'Φ', 'Ω'];
export const OPERATOR_SYMBOLS = [':=', '·', '÷', '≤', '≥', '≠', '≐', '±', '∈', 'ℝ', 'ℂ', '√', '∛', '²', '³', '^', '⁻¹', '°', 'Δ°C', '_', '⃗', '′', '″', '|'];
/** Symbols shown otherwise than inserted: ^ is a general power. */
export const SYMBOL_GLYPHS: Readonly<Record<string, string>> = { '^': 'xⁿ', ':=': '≔', '⃗': 'a⃗' };

/**
 * Functions written for the user, as on the palettes of Mathcad: the template
 * of the call, with ‸ where the cursor goes. A line template (solve) becomes
 * a line of its own.
 */
export interface FunctionTemplate {
  readonly id: string;
  readonly glyph?: string;
  readonly text: string;
  readonly line?: boolean;
}

export const FUNCTION_TEMPLATES: readonly FunctionTemplate[] = [
  { id: 'integral', glyph: '∫', text: 'integral(‸, x: 0 .. 1)' },
  { id: 'derivative', glyph: 'd/dx', text: 'derivative(‸, x: 0)' },
  { id: 'sum', glyph: '∑', text: 'sum(‸, k: 1 .. 10)' },
  { id: 'matrix', text: '[‸, 0 | 0, 0]' },
  { id: 'abs', glyph: '|x|', text: 'abs(‸)' },
  { id: 'if', glyph: 'if', text: 'if(‸, a, b)' },
  { id: 'solve', glyph: 'solve', text: 'solve x: ‸ == 0', line: true },
  { id: 'derive', glyph: 'a=b', text: 'derive ‸ == ', line: true },
];

/** Templates on the Operators toolbar (not on Functions): the n-th root. */
export const OPERATOR_TEMPLATES: readonly FunctionTemplate[] = [{ id: 'root', glyph: 'ⁿ√', text: 'root(‸, n)' }];

/** The template without its cursor mark, and where the cursor goes. */
export function templateParts(template: string): { text: string; cursor: number } {
  const cursor = template.indexOf('‸');
  return cursor < 0 ? { text: template, cursor: template.length } : { text: template.replace('‸', ''), cursor };
}

export function defaultLayout(): ToolbarLayout {
  return {
    version: 1,
    items: ITEMS_VERSION,
    toolbars: [
      {
        id: 'standard',
        builtin: true,
        visible: true,
        place: dock('top', 0, 0),
        items: ['file.new', 'file.open', 'file.save', SEPARATOR, 'file.print', 'file.pdf', SEPARATOR, 'edit.undo', 'edit.redo'],
      },
      {
        id: 'insert',
        builtin: true,
        visible: true,
        place: dock('top', 0, 1),
        items: ['insert.text', 'insert.definition', 'insert.check', 'insert.pick', 'insert.pageBreak'],
      },
      {
        id: 'view',
        builtin: true,
        visible: true,
        place: dock('top', 0, 2),
        items: ['view.zoomOut', 'view.zoomIn', SEPARATOR, 'view.fit1', 'view.fit2', 'view.fit3', SEPARATOR, 'view.paneDetails', 'view.paneTables', 'view.paneChat'],
      },
      {
        id: 'functions',
        builtin: true,
        visible: true,
        place: dock('top', 0, 3),
        items: [...FUNCTION_TEMPLATES.map((f) => `fn:${f.id}`), SEPARATOR, 'insert.chart', 'help.functions'],
      },
      { id: 'operators', builtin: true, visible: true, place: dock('left', 0, 0), items: OPERATOR_SYMBOLS.flatMap((s) => (s === '∛' ? [`sym:${s}`, 'fn:root'] : [`sym:${s}`])) },
      { id: 'greek', builtin: true, visible: true, place: dock('left', 1, 0), items: GREEK_SYMBOLS.map((s) => `sym:${s}`) },
    ],
  };
}

/** Visible docked toolbars of one edge, grouped into bands and ordered. */
export function bandsOf(layout: ToolbarLayout, edge: Dock): ToolbarState[][] {
  const docked = layout.toolbars.filter((t) => t.visible && t.place.kind === 'dock' && t.place.dock === edge);
  const bands = [...new Set(docked.map((t) => (t.place as Extract<ToolbarPlace, { kind: 'dock' }>).band))].sort((a, b) => a - b);
  return bands.map((band) =>
    docked
      .filter((t) => (t.place as Extract<ToolbarPlace, { kind: 'dock' }>).band === band)
      .sort((a, b) => (a.place as Extract<ToolbarPlace, { kind: 'dock' }>).order - (b.place as Extract<ToolbarPlace, { kind: 'dock' }>).order),
  );
}

export function floating(layout: ToolbarLayout): ToolbarState[] {
  return layout.toolbars.filter((t) => t.visible && t.place.kind === 'float');
}

function update(layout: ToolbarLayout, id: string, change: (t: ToolbarState) => ToolbarState): ToolbarLayout {
  return { ...layout, toolbars: layout.toolbars.map((t) => (t.id === id ? change(t) : t)) };
}

/**
 * Docks a toolbar at an edge. `band` is the index among the visible bands of
 * that edge; one past the last creates a new band. `order` places it among
 * the toolbars of the band (default: at the end).
 */
export function dockToolbar(layout: ToolbarLayout, id: string, edge: Dock, band: number, order?: number): ToolbarLayout {
  // Take the toolbar out first; bands are then numbered 0..n-1 without gaps.
  const without = compactBands(update(layout, id, (t) => ({ ...t, visible: true, place: { kind: 'float', x: 0, y: 0 } })));
  const bands = bandsOf(without, edge);
  const target = Math.max(0, Math.min(band, bands.length));
  const members = (bands[target] ?? []).map((t) => t.id);
  members.splice(Math.max(0, Math.min(order ?? members.length, members.length)), 0, id);
  return {
    ...without,
    toolbars: without.toolbars.map((t) => {
      const index = members.indexOf(t.id);
      return index === -1 ? t : { ...t, place: { kind: 'dock', dock: edge, band: target, order: index } };
    }),
  };
}

export function floatToolbar(layout: ToolbarLayout, id: string, x: number, y: number): ToolbarLayout {
  return compactBands(update(layout, id, (t) => ({ ...t, visible: true, place: { kind: 'float', x: Math.round(x), y: Math.round(y) } })));
}

/** Removes empty bands left behind after a toolbar moved away. */
export function compactBands(layout: ToolbarLayout): ToolbarLayout {
  let result = layout;
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    bandsOf(result, edge).forEach((band, i) =>
      band.forEach((t, order) => {
        result = update(result, t.id, (s) => ({ ...s, place: { kind: 'dock', dock: edge, band: i, order } }));
      }),
    );
  }
  return result;
}

export function setVisible(layout: ToolbarLayout, id: string, visible: boolean): ToolbarLayout {
  return compactBands(update(layout, id, (t) => ({ ...t, visible })));
}

/** Reshapes a toolbar into a grid of `columns` buttons per row. */
export function setColumns(layout: ToolbarLayout, id: string, columns: number): ToolbarLayout {
  return update(layout, id, (t) => {
    const buttons = t.items.filter((i) => i !== SEPARATOR).length;
    return { ...t, columns: Math.max(1, Math.min(Math.round(columns), Math.max(1, buttons))) };
  });
}

/** Rows of a grid with the given number of columns. */
export function gridRows(items: readonly string[], columns: number): number {
  return Math.ceil(items.filter((i) => i !== SEPARATOR).length / Math.max(1, columns));
}

export function setItems(layout: ToolbarLayout, id: string, items: readonly string[]): ToolbarLayout {
  return update(layout, id, (t) => ({ ...t, items }));
}

export function renameToolbar(layout: ToolbarLayout, id: string, name: string): ToolbarLayout {
  const trimmed = name.trim();
  return update(layout, id, (t) => {
    const { name: _old, ...rest } = t;
    return trimmed ? { ...rest, name: trimmed } : rest;
  });
}

/** A new empty custom toolbar, floating near the top left. */
export function addToolbar(layout: ToolbarLayout, name: string): { layout: ToolbarLayout; id: string } {
  let n = 1;
  while (layout.toolbars.some((t) => t.id === `custom${n}`)) n++;
  const id = `custom${n}`;
  const toolbar: ToolbarState = { id, builtin: false, name, items: [], visible: true, place: { kind: 'float', x: 120 + n * 20, y: 140 + n * 20 } };
  return { layout: { ...layout, toolbars: [...layout.toolbars, toolbar] }, id };
}

export function removeToolbar(layout: ToolbarLayout, id: string): ToolbarLayout {
  return compactBands({ ...layout, toolbars: layout.toolbars.filter((t) => t.id !== id || t.builtin) });
}

/**
 * Reads a stored layout. Unknown or damaged data gives the default layout;
 * built-in toolbars added in newer versions are appended.
 */
export function parseLayout(json: string | null): ToolbarLayout {
  const fallback = defaultLayout();
  if (!json) return fallback;
  try {
    const stored = JSON.parse(json) as ToolbarLayout;
    if (stored.version !== 1 || !Array.isArray(stored.toolbars)) return fallback;
    const valid = stored.toolbars.filter(
      (t) =>
        typeof t.id === 'string' &&
        Array.isArray(t.items) &&
        t.items.every((i: unknown) => typeof i === 'string') &&
        isPlace(t.place) &&
        (t.columns === undefined || (Number.isInteger(t.columns) && t.columns > 0)),
    );
    const missing = fallback.toolbars.filter((b) => !valid.some((t) => t.id === b.id));
    const known = typeof stored.items === 'number' ? stored.items : 1;
    const updated = valid.map((t) => withAddedItems(t, known));
    return compactBands({ version: 1, items: ITEMS_VERSION, toolbars: [...updated, ...missing] });
  } catch {
    return fallback;
  }
}

function isPlace(place: unknown): place is ToolbarPlace {
  const p = place as ToolbarPlace;
  if (p?.kind === 'float') return Number.isFinite(p.x) && Number.isFinite(p.y);
  return p?.kind === 'dock' && ['top', 'bottom', 'left', 'right'].includes(p.dock) && Number.isInteger(p.band) && Number.isInteger(p.order);
}

/** A built-in toolbar of a layout that knows the buttons up to `known`, with the buttons added since. */
function withAddedItems(toolbar: ToolbarState, known: number): ToolbarState {
  if (!toolbar.builtin) return toolbar;
  let items = [...toolbar.items];
  for (const added of ADDED_ITEMS) {
    if (added.since <= known || added.toolbar !== toolbar.id) continue;
    const fresh = added.ids.filter((id) => !items.includes(id));
    // after '': at the very start.
    if (added.after === '') {
      items = [...fresh, ...items];
      continue;
    }
    const at = items.indexOf(added.after);
    items = at < 0 ? [...items, ...fresh] : [...items.slice(0, at + 1), ...fresh, ...items.slice(at + 1)];
  }
  return items.length === toolbar.items.length ? toolbar : { ...toolbar, items };
}
