import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, parse, type Expr, type Table } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { loadTable } from '@kalketa/sheet';
import { buildPrintDocument, formulaNode, nameNode, printHtml, toMathML, toText, type EquationLine, type FormulaOptions, type PrintBlock } from '../src/index.js';

const cs = catalogFor('cs');
const en = catalogFor('en');

const options: FormulaOptions = { literal: String, argumentSeparator: ',', booleans: { true: 'true', false: 'false' } };

function expr(source: string, prelude = ''): Expr {
  const all = parse(`${prelude}\nx := ${source}`, { isUnit: (n) => defaultRegistry.isUnit(n) }).sheet.statements;
  const last = all[all.length - 1]!;
  if (last.kind !== 'definition') throw new Error(last.kind);
  return last.expr;
}

const formula = (source: string, prelude = '') => toText(formulaNode(expr(source, prelude), options));

function lines(block: PrintBlock | undefined): string[] {
  if (!block || (block.kind !== 'equation' && block.kind !== 'check')) throw new Error(`not an equation: ${block?.kind}`);
  return block.lines.map((l: EquationLine) => (l.lhs ? `${toText(l.lhs)} = ` : '= ') + toText(l.rhs));
}

describe('names', () => {
  it('turn the first underscore into a subscript', () => {
    expect(toText(nameNode('M_Ed'))).toBe('M_Ed');
    expect(nameNode('M_Ed')).toEqual({ k: 'sub', b: { k: 'i', t: 'M' }, s: { k: 'i', t: 'Ed', normal: true } });
    expect(nameNode('T_1')).toEqual({ k: 'sub', b: { k: 'i', t: 'T' }, s: { k: 'n', t: '1' } });
    expect(nameNode('profil')).toEqual({ k: 'i', t: 'profil', normal: true });
  });
});

describe('formulas', () => {
  it('set division as a fraction and restore needed parentheses', () => {
    expect(formula('q·L²/8', 'q:=1\nL:=1')).toBe('(q·L^2)/8');
    expect(formula('(a + b)·c', 'a:=1\nb:=1\nc:=1')).toBe('(a+b)·c');
    expect(formula('a - (b - c)', 'a:=1\nb:=1\nc:=1')).toBe('a−(b−c)');
    expect(formula('a - b - c', 'a:=1\nb:=1\nc:=1')).toBe('a−b−c');
    expect(formula('(a·b)^2', 'a:=1\nb:=1')).toBe('(a·b)^2');
    expect(formula('-(a + b)', 'a:=1\nb:=1')).toBe('−(a+b)');
  });

  it('print units, comparisons, logic and functions', () => {
    expect(formula('12 kN/m')).toBe('12 kN/m');
    expect(formula('a ≤ b and not c', 'a:=1\nb:=1\nc:=true')).toBe('a≤b∧¬c');
    expect(formula('sqrt(a) + abs(b) + max(a, b)', 'a:=1\nb:=1')).toBe('√(a)+|b|+max(a,b)');
    expect(formula('profil.W_y', 'profil:=1')).toBe('W_y');
  });

  it('produce MathML', () => {
    expect(toMathML(formulaNode(expr('a/2', 'a:=1'), options))).toBe('<math display="inline"><mfrac><mi>a</mi><mn>2</mn></mfrac></math>');
    expect(toMathML(nameNode('x<y'))).toContain('x&lt;y');
  });
});

describe('print model', () => {
  const settings = { catalog: cs, registry: defaultRegistry, digits: 4, title: 'Test' };
  const doc = (source: string, tables: Table[] = []) => buildPrintDocument(evaluateSheet(source, { tables }), settings);

  it('prints given values on one line', () => {
    expect(lines(doc('L := 5 m').blocks[0])).toEqual(['L = 5 m']);
  });

  it('prints formula, substitution and result', () => {
    const blocks = doc('q := 12 kN/m\nL := 5 m\nM_Ed := q·L²/8 | kN·m').blocks;
    expect(lines(blocks[2])).toEqual(['M_Ed = (q·L^2)/8', '= (12 kN/m·(5 m)^2)/8', '= 37,5 kN·m']);
  });

  it('parenthesizes negative values in products', () => {
    const blocks = doc('a := -2 m\nb := 3·a').blocks;
    expect(lines(blocks[1])).toEqual(['b = 3·a', '= 3·(−2 m)', '= −6 m']);
  });

  it('skips the substitution when it would repeat the result', () => {
    expect(lines(doc('a := 2 m\nb := a').blocks[1])).toEqual(['b = a', '= 2 m']);
    expect(lines(doc('b := 2 m · 3').blocks[0])).toEqual(['b = 2 m·3', '= 6 m']);
  });

  it('honours @nosub, @result, @hide, @show, @digits and @page', () => {
    const source = 'a := 2 m\n@nosub\nb := a·3\n@result\nc := a·4\n@sub\n@hide\nd := a·5\n@show\n@digits 2\ne := a·1.2345\n@page';
    const blocks = doc(source).blocks;
    expect(blocks.map((b) => b.kind)).toEqual(['equation', 'equation', 'equation', 'equation', 'page-break']);
    expect(lines(blocks[1])).toEqual(['b = a·3', '= 6 m']);
    expect(lines(blocks[2])).toEqual(['c = 8 m']);
    expect(lines(blocks[3])).toEqual(['e = a·1,2345', '= 2 m·1,2345', '= 2,5 m']);
  });

  it('never shows an error as a valid result', () => {
    const blocks = doc('a := 1 m + 2 s\nb := a · 2\n1 m + 1 s =').blocks;
    expect(blocks[0]).toMatchObject({ kind: 'equation', messages: [{ severity: 'error' }] });
    expect(lines(blocks[0])).toEqual(['a = 1 m+2 s']);
    expect(blocks[1]).toMatchObject({ messages: [{ severity: 'info' }] });
    expect(lines(blocks[1])).toEqual(['b = a·2']);
    expect(blocks[2]).toMatchObject({ kind: 'error', source: '1 m + 1 s =' });
  });

  it('prints checks with both sides, utilization and verdict', () => {
    const d = doc('σ := 150 MPa\ncheck "Ohyb": σ ≤ 200 MPa source "EN 1993-1-1"');
    const check = d.blocks[1]!;
    expect(lines(check)).toEqual(['= σ≤200 MPa', '= 150 MPa≤200 MPa']);
    expect(check).toMatchObject({ kind: 'check', label: 'Ohyb', passed: true, evaluated: true, utilization: '75 %', source: 'EN 1993-1-1' });
    expect(d.summary).toMatchObject({ position: 'top', allPassed: true, rows: [{ label: 'Ohyb', utilization: '75 %' }] });
  });

  it('does not repeat the title heading', () => {
    const d = buildPrintDocument(evaluateSheet('# Test\n## Given\na := 1'), settings);
    expect(d.blocks[0]).toEqual({ kind: 'heading', line: 2, level: 2, text: 'Given' });
  });
});

describe('reference R1 printout', () => {
  const dir = join(import.meta.dirname, '../../../reference/R1-nosnik');
  const tables = readdirSync(join(dir, 'tables')).map(
    (name) => loadTable(readFileSync(join(dir, 'tables', name, 'schema.json'), 'utf8'), readFileSync(join(dir, 'tables', name, 'data.csv'), 'utf8'), defaultRegistry).table,
  );
  const result = evaluateSheet(readFileSync(join(dir, 'nosnik.cc'), 'utf8'), { tables });
  const html = (catalog = cs) => printHtml(result, { catalog, registry: defaultRegistry, title: 'Posouzení nosníku N1' });

  it('is deterministic', () => {
    expect(html()).toBe(html());
  });

  it('contains the classical calculation and the summary', () => {
    const page = html();
    expect(page).toContain('<html lang="cs">');
    expect(page).toContain('<mfrac>');
    expect(page).toContain('37,5');
    expect(page).toContain('IPE 220');
    expect(page).toContain('✗ NEVYHOVUJE');
    expect(page).toContain('Nevyhovuje nebo nebylo vyhodnoceno: 1 z 4 podmínek.');
    expect(page).toContain('counter(pages)');
  });

  it('follows the language of the printout', () => {
    const page = html(en);
    expect(page).toContain('37.5');
    expect(page).toContain('✗ FAILS');
    expect(page).toContain('"Page "');
  });

  it('escapes user text', () => {
    const r = evaluateSheet('"<script>alert(1)</script>"');
    expect(printHtml(r, { catalog: cs, registry: defaultRegistry, title: '<b>' })).not.toMatch(/<script>|<title><b>/);
  });
});
