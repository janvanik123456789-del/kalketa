import { describe, expect, it } from 'vitest';
import { defaultRegistry, parse, type Expr, type Statement } from '../src/index.js';

const isUnit = (name: string) => defaultRegistry.isUnit(name);

function statements(source: string): readonly Statement[] {
  return parse(source, { isUnit }).sheet.statements;
}

function parseCodes(source: string): string[] {
  return parse(source, { isUnit }).diagnostics.map((d) => d.code);
}

/** Compact S-expression form of an expression for readable assertions. */
function show(expr: Expr): string {
  switch (expr.kind) {
    case 'number':
      return expr.unit ? `${expr.value}[${unitText(expr.unit)}]` : String(expr.value);
    case 'variable':
      return expr.name;
    case 'unit':
      return `[${unitText(expr.unit)}]`;
    case 'string':
      return JSON.stringify(expr.value);
    case 'date':
      return `date(${expr.days})`;
    case 'boolean':
      return String(expr.value);
    case 'unary':
      return `(${expr.operator} ${show(expr.operand)})`;
    case 'binary':
      return `(${expr.operator} ${show(expr.left)} ${show(expr.right)})`;
    case 'call':
      return `${expr.name}(${expr.args.map(show).join(', ')})`;
    case 'member':
      return `${show(expr.object)}.${expr.name}`;
    case 'prime':
      return `${expr.name}${"'".repeat(expr.order)}${expr.arg ? `(${show(expr.arg)})` : ''}`;
    case 'vector':
      return `[${expr.items.map(show).join(', ')}]`;
    case 'index':
      return `${show(expr.object)}[${show(expr.index)}]`;
    case 'range':
      return `${show(expr.low)}..${show(expr.high)}`;
    case 'matrix':
      return `[${expr.rows.map((r) => r.map(show).join(', ')).join(' | ')}]`;
  }
}

function unitText(unit: import('../src/index.js').UnitExpr): string {
  switch (unit.kind) {
    case 'unit-name':
      return unit.name;
    case 'unit-one':
      return '1';
    case 'unit-mul':
      return `${unitText(unit.left)}*${unitText(unit.right)}`;
    case 'unit-div':
      return `${unitText(unit.left)}/${unitText(unit.right)}`;
    case 'unit-pow':
      return `${unitText(unit.base)}^${unit.exponent}`;
  }
}

function expr(source: string, prelude = ''): string {
  const all = statements(prelude ? `${prelude}\n${source}` : source);
  const s = all[all.length - 1]!;
  if (s.kind !== 'definition' && s.kind !== 'display') throw new Error(`not an expression: ${s.kind}`);
  return show(s.expr);
}

describe('parser: precedence', () => {
  it('follows school precedence', () => {
    expect(expr('a + b * c', 'a:=1\nb:=1\nc:=1')).toBe('(+ a (* b c))');
    expect(expr('(a + b) * c', 'a:=1\nb:=1\nc:=1')).toBe('(* (+ a b) c)');
    expect(expr('a - b - c', 'a:=1\nb:=1\nc:=1')).toBe('(- (- a b) c)');
  });

  it('makes ^ right-associative and tighter than unary minus', () => {
    expect(expr('2^3^2')).toBe('(^ 2 (^ 3 2))');
    expect(expr('-2^2')).toBe('(- (^ 2 2))');
    expect(expr('2^-1')).toBe('(^ 2 (- 1))');
  });

  it('treats superscripts as powers', () => {
    expect(expr('q·L²/8', 'q:=1\nL:=1')).toBe('(/ (* q (^ L 2)) 8)');
  });

  it('parses comparisons and logic', () => {
    expect(expr('a < b and not c', 'a:=1\nb:=1\nc:=true')).toBe('(and (< a b) (not c))');
    expect(parseCodes('1 < 2 < 3')).toEqual(['E-SYNTAX']);
  });

  it('parses calls, √ and members', () => {
    expect(expr('max(1, 2, 3)')).toBe('max(1, 2, 3)');
    expect(expr('√(a+1)', 'a:=1')).toBe('sqrt((+ a 1))');
    expect(expr('profil.Wy', 'profil:=1')).toBe('profil.Wy');
  });
});

describe('parser: numbers with units', () => {
  it('reads compound units after a number', () => {
    expect(expr('12 kN/m')).toBe('12[kN/m]');
    expect(expr('4180 J/(kg·K)')).toBe('4180[J/kg*K]');
    expect(expr('9.81 m/s^2')).toBe('9.81[m/s^2]');
    expect(expr('1000 kg/m³')).toBe('1000[kg/m^3]');
  });

  it('stops the unit chain at a non-unit', () => {
    expect(expr('5 m / 2 s')).toBe('(/ 5[m] 2[s])');
    expect(expr('5 m/(2 s)')).toBe('(/ 5[m] 2[s])');
    expect(expr('10 kN · n', 'n:=2')).toBe('(* 10[kN] n)');
  });

  it('reads brackets as units', () => {
    expect(expr('5 [m]')).toBe('5[m]');
    expect(expr('2 [1/s]')).toBe('2[1/s]');
  });

  it('allows number·(...) but not a·b without an operator', () => {
    expect(expr('2(a + 1)', 'a:=1')).toBe('(* 2 (+ a 1))');
    expect(parseCodes('a := 1\nb := 2\nc := a b')).toEqual(['E-MISSING-OPERATOR']);
    expect(parseCodes('x := 1\ny := 2 x')).toEqual(['E-MISSING-OPERATOR']);
    expect(parseCodes('y := 2 xyz')).toEqual(['E-UNKNOWN-UNIT']);
  });

  it('prefers a defined variable over a unit for a standalone name', () => {
    expect(expr('m · 2', 'm := 10 kg')).toBe('(* m 2)');
    expect(expr('m · 2')).toBe('(* [m] 2)');
  });

  it('warns when a unit after a number is also a defined variable', () => {
    expect(parseCodes('L := 5 m\nV := 2 L')).toEqual(['W-AMBIGUOUS-UNIT']);
    expect(parseCodes('L := 5 m\nV := 2 [L]')).toEqual([]);
  });

  it('warns when a one-letter unit stands alone among names: t meant as time would be tonnes', () => {
    expect(parseCodes('t_v := 60 s\ntau := t/t_v')).toEqual(['W-BARE-UNIT']);
    expect(parseCodes('k := 2 m/s\nh := 3 m - k·t')).toEqual(['W-BARE-UNIT']);
    // After a number, a unit as meant; a parameter of a function or a variable of a chart is a name.
    expect(parseCodes('f := 5/s\nv := 3 m/s')).toEqual([]);
    expect(parseCodes('k := 2 m/s\nh(t) := 3 m - k·t')).toEqual([]);
    expect(parseCodes('k := 2 m/s\nplot(3 m - k·t, t: 0 s .. 1 s)')).toEqual([]);
  });
});

describe('parser: statements', () => {
  it('recognizes all line kinds', () => {
    const kinds = statements('# Title\n"Some text"\n\' only a comment\n@hide\na := 1 \' span\na =\n').map((s) => s.kind);
    expect(kinds).toEqual(['heading', 'text', 'comment', 'directive', 'definition', 'display']);
  });

  it('takes the sources after a text line, and nothing else there', () => {
    expect(statements('"Mez kluzu je polovina meze pevnosti." [ST:T1][T2]')[0]).toMatchObject({ kind: 'text', cites: ['ST:T1', 'T2'] });
    expect(parseCodes('"Text" [T1')).toEqual(['E-SYNTAX']);
    expect(parseCodes('"Text" [ST:]')).toEqual(['E-SYNTAX']);
    expect(parseCodes('"Text" 5')).toEqual(['E-MISSING-OPERATOR']);
  });

  it('keeps trailing comments and target units', () => {
    const s = statements('M := 37.5 kN·m | kN·m \' moment')[0]!;
    expect(s).toMatchObject({ kind: 'definition', name: 'M', comment: 'moment' });
    expect(s.kind === 'definition' && s.target && unitText(s.target)).toBe('kN*m');
  });

  it('continues a line while brackets are open', () => {
    const all = statements('a := (1 +\n  2)\nb := 3');
    expect(all.map((s) => s.kind)).toEqual(['definition', 'definition']);
  });

  it('suggests := when = is used as assignment', () => {
    expect(parseCodes('a = 5')).toEqual(['E-ASSIGN-WITH-EQUALS']);
  });

  it("parses a sheet's own dimensions and units; a new unit is known from its line on", () => {
    const result = parse('dimension Mena\nunit CZK: Mena\nunit EUR := 25 CZK\nx := 5 EUR', { isUnit });
    expect(result.diagnostics).toEqual([]);
    expect(result.sheet.statements.map((s) => s.kind)).toEqual(['dimension', 'unit', 'unit', 'definition']);
    expect(result.sheet.statements[1]).toMatchObject({ name: 'CZK', dimension: { name: 'Mena' } });
    expect(parseCodes('x := 5 Tolar\nunit Tolar: 1')).toEqual(['E-UNKNOWN-UNIT']);
  });

  it('parses function definitions; parameters are names even where they spell units', () => {
    const result = parse('f(m, t) := m/t + 2 s', { isUnit });
    expect(result.diagnostics).toEqual([]);
    const s = result.sheet.statements[0]!;
    expect(s).toMatchObject({ kind: 'definition', name: 'f', params: [{ name: 'm' }, { name: 't' }] });
    expect(s.kind === 'definition' && s.expr).toMatchObject({
      left: { kind: 'binary', left: { kind: 'variable', name: 'm' }, right: { kind: 'variable', name: 't' } },
      right: { kind: 'number', unit: { name: 's' } },
    });
    // Outside the function m is the metre again.
    expect(parse('f(m) := m\nx := m', { isUnit }).sheet.statements[1]).toMatchObject({ expr: { kind: 'unit' } });
    expect(parseCodes('f(x, and) := x')).toEqual(['E-RESERVED']);
    expect(parseCodes('f(x := x')).toEqual(['E-SYNTAX']);
  });

  it('recovers after a syntax error and keeps parsing', () => {
    const result = parse('a := 1 +\nb := 2\nc := b', { isUnit });
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E-SYNTAX']);
    expect(result.sheet.statements.map((s) => s.kind)).toEqual(['invalid', 'definition', 'definition']);
  });

  it('spans a group with its brackets, so the source quoted for a check ends with ")"', () => {
    const source = 'check y == c - b^2/(4*a)';
    const check = statements(source)[0]!;
    if (check.kind !== 'check') throw new Error(check.kind);
    expect(source.slice(check.expr.span.offset, check.expr.span.offset + check.expr.span.length)).toBe('y == c - b^2/(4*a)');
  });

  it('rejects keywords as names', () => {
    expect(parseCodes('and := 1')).toEqual(['E-RESERVED']);
  });
});
