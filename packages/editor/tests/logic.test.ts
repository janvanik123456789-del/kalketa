import { describe, expect, it } from 'vitest';
import { defaultRegistry, parse } from '@calccanvas/core';
import { deleteLines, insertLineAfter, moveLines, replaceLines, segments } from '../src/logic/segments.js';
import { pageGeometry, paginate } from '../src/logic/pages.js';
import { createHistory, MERGE_WINDOW_MS, record, redo, undo } from '../src/logic/history.js';
import { defineShortcut, definedName } from '../src/logic/shortcuts.js';
import { pickOf, replacePickKey } from '../src/logic/pick.js';
import { addColumn, addRow, deleteColumn, deleteRow, fromEditable, setCell, toEditable } from '../src/logic/tableEdit.js';

const statementsOf = (source: string) => parse(source, { isUnit: (n) => defaultRegistry.isUnit(n), predefined: ['T'] }).sheet.statements;

describe('segments', () => {
  it('covers every line exactly once, multi-line statements as one segment', () => {
    const source = '# Title\n\na := (1 +\n  2)   \' note\nb := a\n';
    const segs = segments(source, statementsOf(source));
    expect(segs.map((s) => [s.start, s.end, s.statement !== undefined])).toEqual([
      [1, 1, true],
      [2, 2, false],
      [3, 4, true],
      [5, 5, true],
      [6, 6, false],
    ]);
    expect(segs[2]!.text).toBe("a := (1 +\n  2)   ' note");
  });

  it('keeps comment-only lines and directives as statements', () => {
    const source = "' just a comment\n@nosub";
    expect(segments(source, statementsOf(source)).map((s) => s.statement)).toEqual([0, 1]);
  });

  it('keeps the edited line on its own while it is unfinished', () => {
    const source = 'a := 1\nb := (2 +\nc := 3\nd := 4';
    const plain = segments(source, statementsOf(source));
    expect(plain.map((s) => [s.start, s.end])).toEqual([[1, 1], [2, 4]]);
    const fixed = segments(source, statementsOf(source), { start: 2, end: 2 });
    expect(fixed.map((s) => [s.start, s.end, s.statement])).toEqual([[1, 1, 0], [2, 2, 1], [3, 3, undefined], [4, 4, undefined]]);
  });

  it('keeps an edited blank line as one segment', () => {
    const source = 'a := 1\n\nb := 2';
    expect(segments(source, statementsOf(source), { start: 2, end: 2 }).map((s) => [s.start, s.end, s.statement])).toEqual([
      [1, 1, 0],
      [2, 2, undefined],
      [3, 3, 1],
    ]);
  });

  it('edits lines', () => {
    expect(replaceLines('a\nb\nc', 2, 2, 'x\ny')).toBe('a\nx\ny\nc');
    expect(insertLineAfter('a\nb', 1, 'n')).toBe('a\nn\nb');
    expect(insertLineAfter('a', 0)).toBe('\na');
    expect(deleteLines('a\nb\nc', 1, 2)).toBe('c');
    expect(moveLines('a\nP\nb\nc', 2, 2, 3)).toBe('a\nb\nP\nc');
    expect(moveLines('a\nb\nc\nP', 4, 4, 0)).toBe('P\na\nb\nc');
    expect(moveLines('a\nP\nQ\nb', 2, 3, 4)).toBe('a\nb\nP\nQ');
    expect(moveLines('a\nP\nb', 2, 2, 1)).toBe('a\nP\nb');
  });
});

describe('undo history', () => {
  it('undoes and redoes whole states', () => {
    let h = createHistory('a');
    h = record(h, 'b');
    h = record(h, 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toBe('c');
    expect(redo(h)).toBe(h);
  });

  it('merges quick changes of the same group into one step', () => {
    let h = createHistory('');
    h = record(h, 'x', 'line 3', 1000);
    h = record(h, 'x=', 'line 3', 1500);
    h = record(h, 'x=1', 'line 3', 2000);
    expect(h.past).toEqual(['']);
    h = record(h, 'x=1 m', 'line 3', 2000 + MERGE_WINDOW_MS + 1);
    expect(h.past).toEqual(['', 'x=1']);
    h = record(h, 'y', 'line 4', 5000);
    expect(h.past).toEqual(['', 'x=1', 'x=1 m']);
  });

  it('drops the redo branch after a new change', () => {
    let h = record(record(createHistory('a'), 'b'), 'c');
    h = record(undo(h), 'd');
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(['a', 'b']);
  });
});

describe('pages', () => {
  it('fills pages and moves an item that does not fit to the next page', () => {
    expect(paginate([40, 40, 40, 40], 100)).toEqual([0, 2]);
    expect(paginate([100, 1], 100)).toEqual([0, 1]);
  });

  it('keeps an item taller than a page on its own page', () => {
    expect(paginate([10, 250, 10], 100)).toEqual([0, 1, 2]);
  });

  it('breaks after forced page breaks, but not after the last item', () => {
    expect(paginate([10, 10, 10], 100, [false, true, false])).toEqual([0, 2]);
    expect(paginate([10, 10], 100, [false, true])).toEqual([0]);
  });

  it('knows the paper sizes', () => {
    expect(pageGeometry('A4', 'portrait')).toMatchObject({ width: 210, height: 297 });
    expect(pageGeometry('A4', 'landscape')).toMatchObject({ width: 297, height: 210 });
  });
});

describe('":=" shortcut', () => {
  const none = () => false;

  it('turns "=" after a new name into ":="', () => {
    expect(defineShortcut('L', 1, none)).toEqual({ text: 'L := ', cursor: 5 });
    expect(defineShortcut('  M_Ed ', 7, none)).toEqual({ text: '  M_Ed := ', cursor: 10 });
    // The head of a new function, with "," or ";" between parameters.
    expect(defineShortcut('A_kruh(d)', 9, none)).toEqual({ text: 'A_kruh(d) := ', cursor: 13 });
    expect(defineShortcut('σ(M; W) ', 8, none)).toEqual({ text: 'σ(M; W) := ', cursor: 11 });
    // A call with values asks for the result.
    expect(defineShortcut('A_kruh(20 mm)', 13, none)).toBeUndefined();
    expect(definedName('σ(M, W) := M/W')).toBe('σ');
    // Calls ask for the result: built-in functions, and arguments defined elsewhere.
    expect(defineShortcut('payback(CF) ', 12, none)).toBeUndefined();
    expect(defineShortcut('f(CF) ', 6, (n) => n === 'CF')).toBeUndefined();
    expect(defineShortcut('q12 kN/m', 1, none)).toEqual({ text: 'q := 12 kN/m', cursor: 5 });
  });

  it('keeps "=" for existing names, expressions and "=="', () => {
    expect(defineShortcut('L', 1, (n) => n === 'L')).toBeUndefined();
    expect(defineShortcut('a + b', 5, none)).toBeUndefined();
    expect(defineShortcut('a', 1, none) && defineShortcut('a=', 1, none)).toBeUndefined();
    expect(defineShortcut('check', 5, none)).toEqual({ text: 'check := ', cursor: 9 });
  });

  it('finds the defined name of a line', () => {
    expect(definedName('  σ := M / W')).toBe('σ');
    expect(definedName('σ = 5')).toBeUndefined();
  });
});

describe('pick drop-down', () => {
  it('recognizes pick(T, "key") and rewrites the key', () => {
    const source = 'p := pick(T, "IPE 200")   \' profile';
    const pick = pickOf(statementsOf(source)[0])!;
    expect(pick).toMatchObject({ table: 'T', key: 'IPE 200' });
    expect(replacePickKey(source, pick, 'IPE 220')).toBe('p := pick(T, "IPE 220")   \' profile');
    expect(replacePickKey(source, pick, 'a"b')).toBeUndefined();
  });

  it('ignores other calls', () => {
    expect(pickOf(statementsOf('p := pick(T, x: 1)')[0])).toBeUndefined();
    expect(pickOf(statementsOf('p := find_min(T, by: G)')[0])).toBeUndefined();
  });
});

describe('table editing', () => {
  const stored = {
    schemaJson: JSON.stringify({ name: 'T', key: 'k', columns: [{ name: 'k', type: 'text' }, { name: 'v', type: 'quantity', unit: 'mm' }] }),
    dataCsv: 'k,v\nA,1.5\nB,2\n',
  };

  it('round-trips schema and data', () => {
    const t = toEditable(stored);
    expect(t.rows).toEqual([['A', '1.5'], ['B', '2']]);
    expect(toEditable(fromEditable(t))).toEqual(t);
  });

  it('stores decimal commas as dots in numeric columns only', () => {
    const t = setCell(setCell(toEditable(stored), 0, 1, ' 2,75 '), 0, 0, 'A, B');
    expect(t.rows[0]).toEqual(['A, B', '2.75']);
    expect(fromEditable(t).dataCsv).toBe('k,v\n"A, B",2.75\nB,2\n');
  });

  it('adds and deletes rows and columns, but keeps the key column', () => {
    let t = addRow(toEditable(stored), 0);
    expect(t.rows).toEqual([['A', '1.5'], ['', ''], ['B', '2']]);
    t = deleteRow(t, 1);
    t = addColumn(t, { name: 'w', type: 'text' })!;
    expect(t.rows[0]).toEqual(['A', '1.5', '']);
    expect(addColumn(t, { name: 'w', type: 'text' })).toBeUndefined();
    expect(deleteColumn(t, 0)).toBe(t);
    expect(deleteColumn(t, 2).schema.columns.map((c) => c.name)).toEqual(['k', 'v']);
  });
});
