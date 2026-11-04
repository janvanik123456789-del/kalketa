import { describe, expect, it } from 'vitest';
import { noteValue, partKind, partMoves, withNewNote, withoutPart, withPartChanges } from '../src/logic/chartParts.js';

describe('parts of a chart', () => {
  it('knows what each part is and which the mouse moves', () => {
    expect(['xTitle', 'yTicks', 'legend', 'axis', 'grid', 's0', 's12'].map(partKind)).toEqual(['text', 'text', 'text', 'lines', 'lines', 'curve', 'curve']);
    expect(['xTitle', 'yTitle', 'legend', 'xTicks', 'axis', 's0'].map(partMoves)).toEqual([true, true, true, false, false, false]);
  });

  it('adds notes under each other, with the next free number, their words made safe', () => {
    expect(partMoves('n0')).toBe(true);
    expect(partKind('n12')).toBe('text');
    expect(noteValue('  Peak "here" <now> ')).toBe('Peak~here~now');
    const one = withNewNote({ line: 3 }, 'First');
    expect(one.parts).toEqual({ 'n0.text': 'First', 'n0.at': '0,0' });
    const two = withNewNote(one, 'Second one');
    expect(two.parts).toMatchObject({ 'n1.text': 'Second~one', 'n1.at': '0,18' });
    expect(withoutPart(two, 'n0').parts).toEqual({ 'n1.text': 'Second~one', 'n1.at': '0,18' });
  });

  it('sets and takes away properties of a part, the rest of the look untouched', () => {
    const look = withPartChanges({ line: 3 }, 'yTitle', { size: '14', bold: 'on' });
    expect(look).toEqual({ line: 3, parts: { 'yTitle.size': '14', 'yTitle.bold': 'on' } });
    expect(withPartChanges(look, 'yTitle', { bold: undefined })).toEqual({ line: 3, parts: { 'yTitle.size': '14' } });
    expect(withPartChanges(withPartChanges(look, 'yTitle', { bold: undefined }), 'yTitle', { size: undefined })).toEqual({ line: 3 });
  });

  it('takes a part back to its default look, and only that part', () => {
    const look = { line: 3, grid: 'y' as const, frame: true, parts: { 'yTitle.size': '14', 'xTitle.size': '9', 'grid.color': '#112233', 'plot.fill': '#eeeeee' } };
    expect(withoutPart(look, 'yTitle').parts).toEqual({ 'xTitle.size': '9', 'grid.color': '#112233', 'plot.fill': '#eeeeee' });
    expect(withoutPart(look, 'grid')).toEqual({ line: 3, parts: { 'yTitle.size': '14', 'xTitle.size': '9' } });
  });
});
