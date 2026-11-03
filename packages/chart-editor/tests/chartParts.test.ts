import { describe, expect, it } from 'vitest';
import { partKind, partMoves, withoutPart, withPartChanges } from '../src/logic/chartParts.js';

describe('parts of a chart', () => {
  it('knows what each part is and which the mouse moves', () => {
    expect(['xTitle', 'yTicks', 'legend', 'axis', 'grid', 's0', 's12'].map(partKind)).toEqual(['text', 'text', 'text', 'lines', 'lines', 'curve', 'curve']);
    expect(['xTitle', 'yTitle', 'legend', 'xTicks', 'axis', 's0'].map(partMoves)).toEqual([true, true, true, false, false, false]);
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
