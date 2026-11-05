import { evaluateSheet } from '@kalketa/core';
import { describe, expect, it } from 'vitest';
import { importSmath, XmlError } from '../src/index.js';

/**
 * Small worksheets written by these tests in the format of SMath: no real file is in the repository (their licences,
 * docs/navrhy/IMPORT-CIZICH-VYPOCTU.md). Tokens: operand, operator, function in postfix.
 */
const n = (text: string) => `<e type="operand">${text}</e>`;
const u = (text: string) => `<e type="operand" style="unit">${text}</e>`;
const op = (text: string, args = 2) => `<e type="operator" args="${args}">${text}</e>`;
const fn = (text: string, args: number) => `<e type="function" args="${args}">${text}</e>`;
const let_ = (name: string, ...tokens: string[]) => `${n(name)}${tokens.join('')}${op(':')}`;
const region = (top: number, body: string, left = 9) => `<region id="${top}" left="${left}" top="${top}" width="100" height="20">${body}</region>`;
const math = (input: string, result?: string, contract?: string) =>
  `<math><input>${input}</input>${contract ? `<contract>${contract}</contract>` : ''}${result ? `<result action="numeric">${result}</result>` : ''}</math>`;
const sheet = (...regions: string[]) => `<?xml version="1.0" encoding="utf-8"?><?application progid="SMath Studio"?>
<regions xmlns="http://smath.info/schemas/worksheet/1.0">${regions.join('')}</regions>`;

describe('a worksheet of SMath', () => {
  it('becomes lines of a sheet, in the order of the page', () => {
    const { source, report } = importSmath(
      sheet(
        region(40, math(let_('M', n('L'), n('2'), op('^'), n('q'), op('*'), n('8'), op('/')))),
        region(20, math(let_('q', n('10'), u('kN'), op('*'), u('m'), op('/')))),
        region(10, math(let_('L', n('6'), u('m'), op('*')))),
        region(60, math(`${n('M')}`, n('45'), `${u('kN')}${u('m')}${op('*')}`)),
      ),
    );
    expect(source.trim().split('\n')).toEqual(['L := 6 [m]', 'q := (10 [kN])/[m]', 'M := L^2·q/8', 'M | kN·m']);
    expect(report.formulas).toBe(4);
    expect(report.converted).toBe(4);
    expect(report.left).toEqual([]);
    expect(report.agree).toBe(1);
    expect(report.differ).toEqual([]);
  });

  it('reads a name after a unit as a name, where the sheet would read a unit', () => {
    const { source } = importSmath(sheet(region(10, math(let_('d', n('450'), u('mm'), op('*')))), region(20, math(let_('k', n('200'), u('mm'), op('*'), n('d'), op('/'))))));
    expect(source).toContain('k := (200 [mm])/d');
    const r = evaluateSheet(source);
    expect((r.values.get('k') as { si: number }).si).toBeCloseTo(200 / 450, 12);
    expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('compares what SMath stored, within its digits', () => {
    const { report } = importSmath(
      sheet(
        region(10, math(let_('a', n('66500')))),
        region(20, math(n('a'), `${n('6.6')}${n('10')}${n('4')}${op('^')}${op('*')}`)),
        region(30, math(n('a'), n('70000'))),
        region(40, math(n('a'), n('66500.0'))),
      ),
    );
    // 6.6·10⁴ has two digits; 7·10⁴ written whole has five and does not agree.
    expect(report.agree).toBe(2);
    expect(report.differ.map((d) => d.stored)).toEqual([70000]);
  });

  it('a result in SI when no unit is asked for', () => {
    const { report } = importSmath(sheet(region(10, math(let_('F', n('5'), u('kN'), op('*')))), region(20, math(n('F'), n('5000')))));
    expect(report.agree).toBe(1);
  });

  it('renames what is defined again, and what follows reads the new one', () => {
    const { source, report } = importSmath(
      sheet(
        region(10, math(let_('a', n('1')))),
        region(20, math(let_('b', n('a'), n('1'), op('+')))),
        region(30, math(let_('a', n('a'), n('2'), op('*')))),
        region(40, math(let_('c', n('a'), n('1'), op('+')))),
      ),
    );
    expect(source.trim().split('\n')).toEqual(['a := 1', 'b := a + 1', 'a_2 := a·2', 'c := a_2 + 1']);
    expect(report.renamed).toEqual([{ from: 'a', to: 'a_2' }]);
    expect((evaluateSheet(source).values.get('c') as { si: number }).si).toBe(3);
  });

  it('writes names, matrices, indices, functions and their own variables', () => {
    const { source, report } = importSmath(
      sheet(
        region(10, math(let_('F.y', n('2')))),
        region(20, math(let_('A', n('1'), n('2'), n('3'), n('4'), n('2'), n('2'), fn('mat', 6)))),
        region(30, math(let_('x', n('A'), n('1'), n('2'), fn('el', 3)))),
        region(40, math(let_('y', n('100'), fn('log', 1)))),
        region(50, math(let_('z', n('8'), n('3'), fn('nthroot', 2)))),
        region(60, math(let_('s', `${n('k')}${n('k')}${n('1')}${n('3')}${fn('sum', 4)}`))),
        region(70, math(`${n('f')}${n('t')}${fn('f', 1).replace('>f<', '>f<')}`.replace(`${n('f')}`, '') + `${n('t')}${n('2')}${op('*')}${op(':')}`)),
        region(80, math(let_('w', n('3'), fn('f', 1)))),
        region(90, math(let_('v', n('e')))),
      ),
    );
    const lines = source.trim().split('\n');
    expect(lines).toContain('F_y := 2');
    expect(lines).toContain('A := [1, 2 | 3, 4]');
    expect(lines).toContain('x := A[1, 2]');
    expect(lines).toContain('y := log10(100)');
    expect(lines).toContain('z := root(8, 3)');
    expect(lines).toContain('s := sum(k, k: 1 .. 3)');
    expect(lines).toContain('f(t) := t·2');
    expect(lines).toContain('w := f(3)');
    expect(lines).toContain('v := exp(1)');
    expect(report.left).toEqual([]);
    const r = evaluateSheet(source);
    expect((r.values.get('x') as { si: number }).si).toBe(2);
    expect((r.values.get('s') as { si: number }).si).toBe(6);
    expect((r.values.get('w') as { si: number }).si).toBe(6);
  });

  it('loses nothing: what it cannot convert stays as text, with the reason', () => {
    const { source, report } = importSmath(
      sheet(
        region(10, math(let_('a', n('1'), fn('MaximaIntegrate', 1)))),
        region(20, math(let_('b', n('1'), u('h'), op('*')))),
        region(30, '<plot type="2d"/>'),
        region(40, math(let_('c', n('nobody'), n('1'), op('+')))),
        region(50, math(let_('d', n('2')))),
      ),
    );
    expect(report.left.map((l) => l.why)).toEqual([{ kind: 'function', name: 'MaximaIntegrate' }, { kind: 'unit', name: 'h' }, { kind: 'region', name: 'plot' }, { kind: 'error', code: 'E-UNDEFINED' }]);
    expect(source).toContain('"a : MaximaIntegrate(1)"'.replace(' : ', ' : '));
    expect(source).toContain('d := 2');
    expect(evaluateSheet(source).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(report.converted).toBe(1);
  });

  it('calories of SMath are international ones, not the thermochemical ones here', () => {
    const { source } = importSmath(sheet(region(10, math(let_('q', n('1'), u('cal'), op('*'))))));
    expect((evaluateSheet(source).values.get('q') as { si: number }).si).toBeCloseTo(4.1868, 10);
  });

  it('keeps its text and takes a file apart safely', () => {
    const { source, report } = importSmath(sheet(region(10, '<text lang="eng"><p>Beam &amp; "load"</p></text>')));
    expect(source.trim()).toBe(`"Beam & 'load'"`);
    expect(report.texts).toBe(1);
    expect(() => importSmath('<regions><region>')).toThrow(XmlError);
    expect(() => importSmath('<!DOCTYPE x [<!ENTITY a "b">]><regions/>')).toThrow(XmlError);
    expect(() => importSmath('<other/>')).toThrow(XmlError);
    expect(() => importSmath(`${'<a>'.repeat(1000)}`)).toThrow(XmlError);
    // A broken formula is one line, not the whole file.
    const broken = importSmath(sheet(region(10, math(op('+'))), region(20, math(let_('a', n('1'))))));
    expect(broken.report.left.map((l) => l.why.kind)).toEqual(['form']);
    expect(broken.source).toContain('a := 1');
  });
});

describe('files as newer versions of SMath write them', () => {
  const worksheet = (...regions: string[]) => `<?xml version="1.0" encoding="utf-8"?><worksheet xmlns="http://smath.info/schemas/worksheet/1.0"><settings ppi="96"><identity><id>x</id></identity><calculation><precision>4</precision></calculation></settings><regions type="content">${regions.join('')}</regions></worksheet>`;

  it('have the regions under a worksheet with its settings', () => {
    const { source, report } = importSmath(worksheet(region(10, math(let_('a', n('2'))))));
    expect(source.trim()).toBe('a := 2');
    expect(report.converted).toBe(1);
  });

  it('store a result with its own unit, which is compared', () => {
    const { report } = importSmath(
      worksheet(
        region(10, math(let_('i', n('250'), u('mA'), op('*')))),
        region(20, math(n('i'), `${n('0.25')}${u('A')}${op('*')}`)),
        region(30, math(n('i'), `${n('0.5')}${u('A')}${op('*')}`)),
        region(40, math(n('i'), `${n('250')}${u('mA')}${op('*')}`)),
      ),
    );
    expect(report.agree).toBe(2);
    expect(report.differ.map((d) => d.stored)).toEqual([0.5]);
    expect(report.notCompared).toBe(0);
  });

  it('name functions of their own way', () => {
    const { source, report } = importSmath(
      worksheet(
        region(10, math(let_('a', n('1'), n('2'), fn('Max', 2)))),
        region(20, math(let_('b', n('1'), n('2'), fn('Min', 2)))),
        region(30, math(let_('c', `${n('1')}${n('2')}${n('2')}${n('1')}${fn('mat', 4)}`, `${n('3')}${n('4')}${n('2')}${n('1')}${fn('mat', 4)}`, fn('augment', 2)))),
        region(40, math(let_('d', `${n('2')}${fn('vectorize', 1)}`))),
      ),
    );
    expect(report.left).toEqual([]);
    expect(source).toContain('a := max(1, 2)');
    expect(source).toContain('b := min(1, 2)');
    expect(source).toContain('c := augment([1 | 2], [3 | 4])');
    expect(source).toContain('d := 2');
  });

  it('a unit alone with the name of a variable stays the unit', () => {
    const { source } = importSmath(sheet(region(10, math(let_('m', n('5'), u('kg'), op('*')))), region(20, math(let_('x', u('m'), n('3'), op('*'))))));
    expect(source).toContain('x := (1 [m])·3');
    expect((evaluateSheet(source).values.get('x') as { si: number; dim: Record<string, number> }).dim['L']).toBe(1);
  });
});
