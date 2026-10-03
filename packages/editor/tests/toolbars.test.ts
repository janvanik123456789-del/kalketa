import { describe, expect, it } from 'vitest';
import {
  addToolbar,
  bandsOf,
  defaultLayout,
  dockToolbar,
  floatToolbar,
  floating,
  parseLayout,
  removeToolbar,
  renameToolbar,
  gridRows,
  setColumns,
  setItems,
  setVisible,
  templateParts,
} from '../src/logic/toolbars.js';

const ids = (bands: { id: string }[][]) => bands.map((b) => b.map((t) => t.id));

describe('toolbar layout', () => {
  it('starts with standard toolbars at the top and symbols at the left', () => {
    const layout = defaultLayout();
    expect(ids(bandsOf(layout, 'top'))).toEqual([['standard', 'insert', 'view', 'functions']]);
    expect(ids(bandsOf(layout, 'left'))).toEqual([['operators'], ['greek']]);
    expect(bandsOf(layout, 'right')).toEqual([]);
  });

  it('docks a toolbar into an existing band at a position', () => {
    const layout = dockToolbar(defaultLayout(), 'greek', 'top', 0, 1);
    expect(ids(bandsOf(layout, 'top'))).toEqual([['standard', 'greek', 'insert', 'view', 'functions']]);
    expect(ids(bandsOf(layout, 'left'))).toEqual([['operators']]);
  });

  it('creates a new band past the last one', () => {
    const layout = dockToolbar(defaultLayout(), 'view', 'top', 5);
    expect(ids(bandsOf(layout, 'top'))).toEqual([['standard', 'insert', 'functions'], ['view']]);
  });

  it('moves toolbars to any edge and removes empty bands', () => {
    let layout = dockToolbar(defaultLayout(), 'operators', 'right', 0);
    expect(ids(bandsOf(layout, 'left'))).toEqual([['greek']]);
    layout = dockToolbar(layout, 'greek', 'bottom', 0);
    expect(bandsOf(layout, 'left')).toEqual([]);
    expect(ids(bandsOf(layout, 'bottom'))).toEqual([['greek']]);
  });

  it('floats toolbars and docks them back', () => {
    let layout = floatToolbar(defaultLayout(), 'insert', 300.4, 200.6);
    expect(floating(layout).map((t) => [t.id, t.place])).toEqual([['insert', { kind: 'float', x: 300, y: 201 }]]);
    expect(ids(bandsOf(layout, 'top'))).toEqual([['standard', 'view', 'functions']]);
    layout = dockToolbar(layout, 'insert', 'top', 0, 0);
    expect(ids(bandsOf(layout, 'top'))).toEqual([['insert', 'standard', 'view', 'functions']]);
  });

  it('hides and shows toolbars', () => {
    const hidden = setVisible(defaultLayout(), 'greek', false);
    expect(ids(bandsOf(hidden, 'left'))).toEqual([['operators']]);
    expect(ids(bandsOf(setVisible(hidden, 'greek', true), 'left'))).toEqual([['operators'], ['greek']]);
  });

  it('builds custom toolbars; only those can be deleted', () => {
    const added = addToolbar(defaultLayout(), 'Moje');
    let layout = setItems(added.layout, added.id, ['file.save', '|', 'sym:π']);
    layout = renameToolbar(layout, added.id, 'Oblíbené');
    expect(layout.toolbars.find((t) => t.id === added.id)).toMatchObject({ name: 'Oblíbené', items: ['file.save', '|', 'sym:π'], builtin: false });
    expect(removeToolbar(layout, added.id).toolbars.some((t) => t.id === added.id)).toBe(false);
    expect(removeToolbar(layout, 'standard').toolbars.some((t) => t.id === 'standard')).toBe(true);
  });

  it('reshapes toolbars into grids, within sensible limits', () => {
    let layout = setColumns(defaultLayout(), 'greek', 4.4);
    const greek = layout.toolbars.find((t) => t.id === 'greek')!;
    expect(greek.columns).toBe(4);
    expect(gridRows(greek.items, 4)).toBe(6); // 21 letters
    layout = setColumns(layout, 'greek', 99);
    expect(layout.toolbars.find((t) => t.id === 'greek')!.columns).toBe(21);
    layout = setColumns(layout, 'standard', 0);
    expect(layout.toolbars.find((t) => t.id === 'standard')!.columns).toBe(1);
    expect(gridRows(['a', '|', 'b', 'c'], 2)).toBe(2); // separators take no cell
  });

  it('keeps the grid shape when stored', () => {
    const layout = setColumns(defaultLayout(), 'operators', 3);
    expect(parseLayout(JSON.stringify(layout)).toolbars.find((t) => t.id === 'operators')!.columns).toBe(3);
    const broken = JSON.stringify({ ...layout, toolbars: layout.toolbars.map((t) => (t.id === 'operators' ? { ...t, columns: -2 } : t)) });
    expect(parseLayout(broken).toolbars.find((t) => t.id === 'operators')!.columns).toBeUndefined();
  });

  it('writes functions with the cursor where the user goes on', () => {
    expect(templateParts('integral(‸, x: 0 .. 1)')).toEqual({ text: 'integral(, x: 0 .. 1)', cursor: 9 });
    expect(templateParts('abs')).toEqual({ text: 'abs', cursor: 3 });
    expect(defaultLayout().toolbars.find((t) => t.id === 'functions')!.items).toContain('fn:integral');
  });

  it('gives a stored layout the buttons added since, once', () => {
    const old = defaultLayout();
    const operators = old.toolbars.find((t) => t.id === 'operators')!;
    const before = operators.items.filter((i) => !['sym:∛', 'fn:root', 'sym:^'].includes(i));
    const stored = JSON.stringify({ version: 1, toolbars: old.toolbars.map((t) => (t.id === 'operators' ? { ...t, items: before } : t)) });
    const parsed = parseLayout(stored);
    const items = parsed.toolbars.find((t) => t.id === 'operators')!.items;
    expect(items.slice(items.indexOf('sym:√'), items.indexOf('sym:√') + 3)).toEqual(['sym:√', 'sym:∛', 'fn:root']);
    expect(items[items.indexOf('sym:³') + 1]).toBe('sym:^');
    // Removed by the user afterwards: it stays removed.
    const removed = { ...parsed, toolbars: parsed.toolbars.map((t) => (t.id === 'operators' ? { ...t, items: t.items.filter((i) => i !== 'sym:^') } : t)) };
    expect(parseLayout(JSON.stringify(removed)).toolbars.find((t) => t.id === 'operators')!.items).not.toContain('sym:^');
  });

  it('survives damaged storage and adds new built-in toolbars', () => {
    expect(parseLayout(null)).toEqual(defaultLayout());
    expect(parseLayout('{nonsense')).toEqual(defaultLayout());
    const custom = addToolbar(defaultLayout(), 'X');
    const stored = JSON.stringify({ ...custom.layout, toolbars: custom.layout.toolbars.filter((t) => t.id !== 'greek') });
    const parsed = parseLayout(stored);
    expect(parsed.toolbars.map((t) => t.id).sort()).toEqual(['custom1', 'functions', 'greek', 'insert', 'operators', 'standard', 'view']);
  });
});
