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

describe('what real worksheets hold', () => {
  it('a calculation inside a collapsed area, in place', () => {
    const area = `<region id="5" left="9" top="20"><area collapsed="true" />${region(900, math(let_('b', n('a'), n('1'), op('+'))))}${region(800, math(let_('a', n('1'))))}</region>`;
    const { source } = importSmath(sheet(region(10, math(let_('z', n('5')))), area, region(30, math(n('b'), n('2')))));
    expect(source.trim().split('\n')).toEqual(['z := 5', 'a := 1', 'b := a + 1', 'b']);
  });

  it('text in the language asked for', () => {
    const texts = '<text lang="rus"><p>Балка</p></text><text lang="eng"><p>Beam</p></text><text lang="ces"><p>Nosník</p></text>';
    const one = sheet(region(10, texts));
    expect(importSmath(one).source.trim()).toBe('"Beam"');
    expect(importSmath(one, undefined, 'cs').source.trim()).toBe('"Nosník"');
    expect(importSmath(sheet(region(10, '<text lang="rus"><p>Балка</p></text>'))).source.trim()).toBe('"Балка"');
  });

  it('a derivative of a function being defined, eval', () => {
    const { source } = importSmath(sheet(region(10, math(`${n('x')}${fn('f', 1)}${n('x')}${n('2')}${op('^')}${op(':')}`)), region(20, math(`${n('x')}${fn('g', 1)}${n('x')}${fn('f', 1)}${n('x')}${fn('diff', 2)}${op(':')}`)), region(30, math(let_('c', n('3'), fn('g', 1), fn('eval', 1))))));
    const r = evaluateSheet(source);
    expect((r.values.get('c') as { si: number }).si).toBeCloseTo(6, 6);
  });
});

describe('data of SMath as a matrix with names in it', () => {
  const s = (text: string) => `<e type="operand" style="string">${text}</e>`;
  const planets = region(
    30,
    math(let_('data', s('Sun'), `${n('1.9891')}${n('10')}${n('30')}${op('^')}${op('*')}${u('kg')}${op('*')}`, `${n('6.955')}${n('10')}${n('5')}${op('^')}${op('*')}${u('km')}${op('*')}`, s('Earth'), `${n('5.9736')}${n('10')}${n('24')}${op('^')}${op('*')}${u('kg')}${op('*')}`, `${n('6.3781')}${n('10')}${n('3')}${op('^')}${op('*')}${u('km')}${op('*')}`, n('2'), n('3'), fn('mat', 8))),
  );
  const gravity = region(10, math(`${n('M')}${n('R')}${fn('g', 2)}${n('G')}${n('M')}${op('*')}${n('R')}${n('2')}${op('^')}${op('/')}${op(':')}`));
  const constant = region(20, math(let_('G', n('6.6728e-11'), u('m'), n('3'), op('^'), op('*'), u('kg'), u('s'), n('2'), op('^'), op('*'), op('/')).replace(`${n('6.6728e-11')}`, n('6.6728e-11'))));

  it('becomes a table, a function goes under what it reads, an assignment over a range a series', () => {
    const { source, report } = importSmath(
      sheet(
        gravity,
        constant,
        planets,
        region(40, math(let_('k', n('1'), n('data'), fn('rows', 1), fn('range', 2)))),
        region(50, math(`${n('r')}${n('k')}${n('2')}${fn('el', 3)}${n('data')}${n('k')}${n('2')}${fn('el', 3)}${n('data')}${n('k')}${n('3')}${fn('el', 3)}${fn('g', 2)}${op(':')}`)),
        region(60, math(n('r'))),
      ),
    );
    expect(source).toContain('table data:\n    | c1 | c2 [kg] | c3 [km] |\n    | Sun |');
    expect(source).toContain('r_c2 := vector(g(data.c2[k], data.c3[k]), k: 1 .. 2)');
    expect(source.indexOf('g(M, R) :=')).toBeGreaterThan(source.indexOf('G :='));
    expect(report.left).toEqual([]);
    const r = evaluateSheet(source);
    const items = (r.values.get('r_c2') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(items[1]).toBeCloseTo(9.7985, 3);
    expect(items[0]).toBeCloseTo(274.39, 1);
  });

  it('a matrix of numbers stays a matrix', () => {
    const { source } = importSmath(sheet(region(10, math(let_('A', n('1'), n('2'), n('2'), n('1'), fn('mat', 4))))));
    expect(source.trim()).toBe('A := [1 | 2]');
  });

  it('a column of mixed units stays as written, with the reason', () => {
    const { report } = importSmath(sheet(region(10, math(let_('D', s('a'), `${n('1')}${u('m')}${op('*')}`, s('b'), `${n('1')}${u('s')}${op('*')}`, n('2'), n('2'), fn('mat', 6))))));
    expect(report.left.map((l) => l.why.kind)).toEqual(['form']);
  });
});

describe('pictures and charts of a worksheet', () => {
  it('a picture comes out of the file and stands in the sheet', () => {
    const png = 'iVBORw0KGgo=';
    const { source, images, report } = importSmath(sheet(region(10, `<picture><raw format="png" encoding="base64">${png}</raw></picture>`)));
    expect(source.trim()).toBe('![](images/smath/picture-1.png)');
    expect([...images[0]!.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(report.left).toEqual([]);
    expect(evaluateSheet(source).diagnostics).toEqual([]);
  });

  const plot = (body: string, attrs = 'scale_x="1" scale_y="1" transpose_x="0" transpose_y="0"') => `<region id="9" left="9" top="50" width="300" height="240"><plot type="2d" ${attrs}><input>${body}</input></plot></region>`;
  const fx = region(10, math(`${n('x')}${fn('f', 1)}${n('x')}${n('2')}${op('^')}${op(':')}`));

  it('a curve of x is a chart, in the view it has there', () => {
    const { source, report } = importSmath(sheet(fx, plot(`${n('x')}${fn('f', 1)}`)));
    // Without a version of the plot in the file: 6.15·300/240 pixels a unit.
    expect(source).toContain('plot(f(x), x: -19.51 .. 19.51, ylim: -15.61 .. 15.61)');
    expect(report.left).toEqual([]);
    const r = evaluateSheet(source);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.statements.at(-1)!.plot).toBeDefined();
  });

  it('more curves together; a moved view', () => {
    const { source } = importSmath(sheet(fx, plot(`${n('x')}${fn('f', 1)}${n('x')}${n('1')}${op('+')}${n('2')}${n('1')}${fn('sys', 4)}`, 'scale_x="2" scale_y="1" transpose_x="-30" transpose_y="12"')));
    expect(source).toContain('plot(f(x), x + 1, x: -15.61 .. 23.41, ylim: -8.585 .. 7.024)');
  });

  it('what draws otherwise stays a mark, with the reason', () => {
    const { report } = importSmath(sheet(plot(n('plotter'))));
    expect(report.left).toEqual([{ written: 'plot', why: { kind: 'region', name: 'plot' } }]);
    const unknown = importSmath(sheet(plot(`${n('x')}${fn('nobody', 1)}`)));
    expect(unknown.report.left.map((l) => l.why.kind)).toEqual(['region']);
  });
});

describe('what a loop left as text assigns', () => {
  const loop = `${n('next')}${n('steps')}${n('steps')}${n('1')}${op('+')}${op(':')}${fn('while', 2)}`;
  const shown = (name: string, value: string) => `<math><input>${n(name)}</input><result action="numeric">${n(value)}</result></math>`;

  it('is not read at its value from before the loop: what SMath had becomes a marked input', () => {
    const { source, report } = importSmath(
      sheet(region(10, math(let_('next', n('1')))), region(20, math(let_('steps', n('0')))), region(30, math(loop)), region(40, shown('steps', '5'))),
    );
    expect(source).toContain("steps := 5 ' result of a loop from SMath, not recalculated");
    // Its start value goes with the loop.
    expect(source).toContain('"steps : 0"');
    expect(source).not.toContain('steps := 0');
    expect(report.differ).toEqual([]);
    expect(report.frozen).toEqual(['steps']);
    expect(report.left.map((l) => l.why)).toEqual([{ kind: 'function', name: 'while' }]);
    expect(evaluateSheet(source).statements.filter((s) => s.status === 'error')).toEqual([]);
  });

  it('a name defined again after the loop is good again', () => {
    const { source } = importSmath(sheet(region(10, math(loop)), region(20, math(let_('steps', n('3')))), region(30, shown('steps', '3'))));
    expect(source).toContain('steps := 3');
    expect(source.trim().endsWith('steps')).toBe(true);
  });

  it('what a function assigns inside stays in it', () => {
    const body = `${n('x')}${fn('h', 1)}${n('x')}${n('t')}${n('1')}${op(':')}${fn('nobody', 2)}${op(':')}`;
    const { source } = importSmath(sheet(region(10, math(let_('t', n('2')))), region(20, math(body)), region(30, shown('t', '2'))));
    expect(source.trim().endsWith('t')).toBe(true);
  });
});

describe('a family of curves with a derivative of its own order, as Hermite polynomials in SMath', () => {
  const he = region(10, math(`${n('z')}${n('n')}${fn('H', 2)}${n('1')}${op('-', 1)}<e type="bracket">(</e>${n('n')}${op('^')}${n('e')}${n('z')}${n('2')}${op('^')}${n('2')}${op('/')}${op('^')}${op('*')}${n('e')}${n('z')}${n('2')}${op('^')}${n('2')}${op('/')}${op('-', 1)}${op('^')}${n('z')}${n('n')}${fn('diff', 3)}${op('*')}${op(':')}`));
  const chart = `<region id="9" left="9" top="50" width="350" height="351"><plot type="2d" scale_x="2.78092082758705" scale_y="11.7378793127595" transpose_x="0" transpose_y="0"><input>${n('x')}${n('0')}${fn('H', 2)}${n('x')}${n('5')}${fn('H', 2)}${n('2')}${n('1')}${fn('sys', 4)}</input></plot></region>`;

  it('is drawn in the view the screen of SMath shows: x about ±2.4, y about ±10.3', () => {
    const { source, report } = importSmath(sheet(he, chart));
    expect(report.left).toEqual([]);
    expect(source).toContain('plot(H(x, 0), H(x, 5), x: -2.431 .. 2.431, ylim: -10.29 .. 10.29)');
    const r = evaluateSheet(`${source}H(2, 5)\nH(1, 3)\n`);
    expect(r.statements.filter((s) => s.status === 'error')).toEqual([]);
    expect(r.statements.at(-2)!.display!.value).toBeCloseTo(-18, 8);
    expect(r.statements.at(-1)!.display!.value).toBeCloseTo(-2, 8);
  });
});

describe('a loop that only fills a vector by its index', () => {
  const fx = region(10, math(`${n('x')}${fn('f', 1)}${n('x')}${fn('sin', 1)}${op(':')}`));
  const N = region(20, math(let_('N', n('9'))));

  it('with x still free it is written out where it is read: a Maclaurin series as in SMath', () => {
    const fill = `${n('i')}${n('1')}${n('N')}${fn('range', 2)}${n('f')}${n('i')}${fn('el', 2)}${n('x')}${fn('f', 1)}${n('x')}${n('i')}${fn('diff', 3)}${op(':')}${fn('for', 3)}`;
    const g = `${n('x')}${fn('g', 1)}${n('f')}${op(':')}`;
    const series = `${n('x')}${fn('fmc', 1)}${n('0')}${fn('f', 1)}${n('0')}${fn('g', 1)}${n('n')}${fn('el', 2)}${n('x')}${n('n')}${op('^')}${op('*')}${n('n')}${op('!', 1)}${op('/')}<e type="bracket">(</e>${n('n')}${n('1')}${n('N')}${fn('sum', 4)}${op('+')}${op(':')}`;
    const { source, report } = importSmath(sheet(fx, N, region(30, math(fill)), region(40, math(g)), region(50, math(series))));
    expect(report.left).toEqual([]);
    expect(source).toContain('g(x) := vector(derivative(f(x), x: x, order: i), i: 1 .. N)');
    const r = evaluateSheet(`${source}fmc(1)\nfmc(3)\n`);
    expect(r.statements.filter((s) => s.status === 'error')).toEqual([]);
    expect(r.statements.at(-2)!.display!.value).toBeCloseTo(Math.sin(1), 5);
    // Nine terms of the series at 3: 3 − 4.5 + 2.025 − 0.43393 + 0.05424.
    expect(r.statements.at(-1)!.display!.value).toBeCloseTo(0.14531, 4);
  });

  it('with numbers it is a vector here; the form with a counter as well', () => {
    const fill = `${n('k')}${n('1')}${op(':')}${n('k')}${n('3')}${op('≤')}${n('k')}${n('k')}${n('1')}${op('+')}${op(':')}${n('v')}${n('k')}${fn('el', 2)}${n('k')}${n('2')}${op('^')}${op(':')}${fn('for', 4)}`;
    const { source, report } = importSmath(sheet(region(10, math(fill))));
    expect(source.trim()).toBe('v := vector(k^2, k: 1 .. 3)');
    expect(report.left).toEqual([]);
    expect((evaluateSheet(source).values.get('v') as unknown as { items: { si: number }[] }).items.map((q) => q.si)).toEqual([1, 4, 9]);
  });

  it('a loop that reads what it fills stays a program', () => {
    const fill = `${n('k')}${n('1')}${n('3')}${fn('range', 2)}${n('v')}${n('k')}${fn('el', 2)}${n('v')}${n('k')}${n('1')}${op('-')}${fn('el', 2)}${n('1')}${op('+')}${op(':')}${fn('for', 3)}`;
    const { report } = importSmath(sheet(region(10, math(fill))));
    expect(report.left.map((l) => l.why)).toEqual([{ kind: 'function', name: 'for' }]);
  });
});

describe('the result of a loop taken over from SMath', () => {
  const loop = `${n('go')}${n('s')}${n('s')}${n('1')}${op('+')}${op(':')}${fn('while', 2)}`;
  const shown = (name: string, value: string) => `<math><input>${n(name)}</input><result action="numeric">${value}</result></math>`;

  it('the rest of the sheet goes on calculating from it, and is compared', () => {
    const control = `<math><input>${n('a')}${n('s')}${op('/')}</input><result action="numeric">${n('371')}</result></math>`;
    const { source, report } = importSmath(sheet(region(5, math(let_('a', n('20405')))), region(10, math(loop)), region(20, shown('s', n('55'))), region(30, control)));
    expect(source).toContain('a/s');
    expect(report.agree).toBe(1);
    expect(report.left.map((l) => l.why.kind)).toEqual(['function']);
  });

  it('a matrix too; in the language of the document', () => {
    const value = `${n('2')}${n('1')}${op('-', 1)}${n('2')}${n('1')}${fn('mat', 4)}`;
    const { source } = importSmath(sheet(region(10, math(loop)), region(20, shown('s', value))), undefined, 'cs');
    expect(source).toContain("s := [2 | -1] ' výsledek smyčky ze SMathu, nepřepočítává se");
    expect(evaluateSheet(source).statements.filter((s) => s.status === 'error')).toEqual([]);
  });

  it('a start value something else reads keeps its line, the result gets a name of its own', () => {
    const { source, report } = importSmath(sheet(region(5, math(let_('s', n('1')))), region(6, math(let_('t', n('s'), n('2'), op('+')))), region(10, math(loop)), region(20, shown('s', n('9')))));
    expect(source).toContain('s := 1');
    expect(source).toContain("s_2 := 9 '");
    expect(report.renamed).toEqual([{ from: 's', to: 's_2' }]);
    expect(report.frozen).toEqual(['s_2']);
  });

  it('what is more than numbers stays text with what SMath had', () => {
    const { source, report } = importSmath(sheet(region(10, math(loop)), region(20, shown('s', `${n('q')}${n('2')}${op('*')}`))));
    expect(source).toContain('(SMath)');
    expect(report.frozen).toEqual([]);
  });
});
