import { describe, expect, it } from 'vitest';
import { record } from '../src/logic/history.js';
import { closeTab, cycleTab, fileNameOf, isDirty, isPristine, newTab, openTab, type DocTab, type Tabs } from '../src/logic/documents.js';

type Tab = DocTab<string, string>;
const file = (path: string) => newTab<string, string>(`doc ${path}`, 'main', { ref: path, path });
const edited = (tab: Tab): Tab => ({ ...tab, history: record(tab.history, `${tab.history.present}!`) });

describe('open documents', () => {
  it('know when they are unsaved or untouched', () => {
    const example = newTab<string, string>('example', 'main');
    expect(isPristine(example)).toBe(true);
    expect(isDirty(edited(example))).toBe(true);
    expect(isPristine(edited(example))).toBe(false);
    expect(isPristine(file('a.calc'))).toBe(false);
  });

  it('replace an untouched new document when a file is opened', () => {
    const example = newTab<string, string>('example', 'main');
    const a = file('a.calc');
    const state = openTab({ tabs: [example], active: example.id }, a);
    expect(state.tabs.map((t) => t.id)).toEqual([a.id]);
    expect(state.active).toBe(a.id);
  });

  it('add a tab after the active one otherwise', () => {
    const a = file('a.calc');
    const b = file('b.calc');
    const c = file('c.calc');
    let state: Tabs<string, string> = { tabs: [a, b], active: a.id };
    state = openTab(state, c);
    expect(state.tabs.map((t) => t.id)).toEqual([a.id, c.id, b.id]);
    expect(state.active).toBe(c.id);
  });

  it('switch to a file that is already open instead of opening it twice', () => {
    const a = edited(file('a.calc'));
    const b = file('b.calc');
    const state = openTab({ tabs: [a, b], active: b.id }, file('a.calc'));
    expect(state.tabs).toEqual([a, b]);
    expect(state.active).toBe(a.id);
  });

  it('close to the right neighbour, and never leave the window empty', () => {
    const [a, b, c] = [file('a'), file('b'), file('c')];
    const state = { tabs: [a, b, c], active: b.id };
    const empty = () => newTab<string, string>('new', 'main');
    expect(closeTab(state, b.id, empty)).toMatchObject({ active: c.id });
    expect(closeTab({ tabs: [a, b], active: b.id }, b.id, empty)).toMatchObject({ active: a.id });
    expect(closeTab(state, a.id, empty)).toMatchObject({ active: b.id });
    const last = closeTab({ tabs: [a], active: a.id }, a.id, empty);
    expect(last.tabs).toHaveLength(1);
    expect(last.tabs[0]!.history.present).toBe('new');
  });

  it('cycle with wrap-around', () => {
    const [a, b, c] = [file('a'), file('b'), file('c')];
    const state = { tabs: [a, b, c], active: c.id };
    expect(cycleTab(state, 1)).toBe(a.id);
    expect(cycleTab(state, -1)).toBe(b.id);
  });
});

describe('file names', () => {
  it('are the last part of Windows and POSIX paths', () => {
    expect(fileNameOf('C:\\Výpočty\\Nosník N1.calc')).toBe('Nosník N1.calc');
    expect(fileNameOf('/home/jan/Nosnik.calc')).toBe('Nosnik.calc');
    expect(fileNameOf('Nosnik.calc')).toBe('Nosnik.calc');
  });
});
