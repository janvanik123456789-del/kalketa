import { builtinFunctions, evaluateSheet } from '@kalketa/core';
import { CATALOGS } from '@kalketa/i18n';
import { describe, expect, it } from 'vitest';
import { FUNCTION_EXAMPLES, functionAtCursor, functionsOfLine, helpNamesOfLine, helpOf, howToWrite, STATEMENT_EXAMPLES, STATEMENTS } from '../src/logic/functionHelp.js';

/** The value the last line of a sheet shows, as text. */
function lastShown(source: string): string {
  const r = evaluateSheet(source);
  const last = r.statements.at(-1)!;
  if (last.display) return `${Number(last.display.value.toPrecision(6))}${last.display.im ? ` ${Number(last.display.im.toPrecision(6))}j` : ''} ${last.display.unit}`.trim();
  if (last.displayList) return `[${last.displayList.map((d) => Number(d.value.toPrecision(6))).join(', ')}] ${last.displayList[0]?.unit ?? ''}`.trim();
  return last.value?.type === 'text' ? last.value.value : (last.value?.type ?? '');
}

describe('the help of the functions', () => {
  it('has an example for every function, which uses it and computes without an error', () => {
    for (const def of builtinFunctions.all()) {
      const example = FUNCTION_EXAMPLES[def.name];
      expect(example, def.name).toBeTruthy();
      expect(example!.replace(/^table[\s\S]*\|\n/m, ''), def.name).toContain(`${def.name}(`);
      const r = evaluateSheet(example!);
      expect(r.diagnostics.filter((d) => d.severity !== 'info').map((d) => `${def.name}: ${d.code}`), def.name).toEqual([]);
    }
    expect(Object.keys(FUNCTION_EXAMPLES).filter((name) => !builtinFunctions.has(name))).toEqual([]);
  });

  it('gives the values the help says', () => {
    expect(lastShown(FUNCTION_EXAMPLES['mod']!)).toBe('10 °');
    expect(lastShown('mod(-7, 3)')).toBe('2');
    expect(lastShown('ceil(-2.3)')).toBe('-2');
    expect(lastShown(FUNCTION_EXAMPLES['floor']!)).toBe('-3');
    expect(lastShown(FUNCTION_EXAMPLES['cbrt']!)).toBe('-3');
    expect(lastShown('root(-27, 3)')).toBe('-3');
    expect(lastShown(FUNCTION_EXAMPLES['hypot']!)).toBe('5 m');
    expect(lastShown(FUNCTION_EXAMPLES['ceil']!)).toBe('3');
    expect(lastShown(FUNCTION_EXAMPLES['range']!)).toBe('[0, 0.5, 1, 1.5, 2] m');
    expect(lastShown(FUNCTION_EXAMPLES['cumsum']!)).toBe('[1, 3, 6, 10] kN');
    expect(lastShown(FUNCTION_EXAMPLES['atan2']!)).toBe('126.87 °');
    expect(lastShown(FUNCTION_EXAMPLES['pick']!)).toBe('194 cm³');
    expect(lastShown(FUNCTION_EXAMPLES['find_min']!)).toBe('IPE 200');
    expect(lastShown(FUNCTION_EXAMPLES['find_max']!)).toBe('IPE 200');
    expect(lastShown(FUNCTION_EXAMPLES['filter']!)).toBe('194 cm³');
    expect(lastShown(FUNCTION_EXAMPLES['polyval']!)).toBe('7');
    expect(lastShown(FUNCTION_EXAMPLES['irr']!)).toMatch(/%$/);
    expect(lastShown(FUNCTION_EXAMPLES['median']!)).toBe('14 MPa');
    expect(lastShown(FUNCTION_EXAMPLES['col']!)).toBe('[2, 4]');
    expect(lastShown(FUNCTION_EXAMPLES['row']!)).toBe('[1, 2]');
    expect(lastShown(FUNCTION_EXAMPLES['integral']!)).toBe('36 kN');
    // An interpolation past its points without "extrap" is an error, a payback that never comes too.
    expect(evaluateSheet('interp1([0, 10], [1, 2], 15)').diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(evaluateSheet('payback([-1000, 100, 100])').diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(evaluateSheet('F := 12 kN\nx := if(F > 10 kN and F < 20 kN, 1, 0)').diagnostics).toEqual([]);
  });

  it('describes the lines solve, derive and relation, with examples that compute', () => {
    for (const keyword of STATEMENTS) {
      const r = evaluateSheet(STATEMENT_EXAMPLES[keyword]);
      expect(r.diagnostics.filter((d) => d.severity !== 'info').map((d) => `${keyword}: ${d.code}`)).toEqual([]);
      expect(STATEMENT_EXAMPLES[keyword]).toContain(`${keyword} `);
      for (const catalog of Object.values(CATALOGS)) {
        const help = helpOf(keyword, catalog, false)!;
        expect(help.summary, `${catalog.locale} ${keyword}`).toBeTruthy();
        expect(help.details, `${catalog.locale} ${keyword}`).toBeTruthy();
      }
    }
    const solved = evaluateSheet(STATEMENT_EXAMPLES.solve).statements.at(-1)!.solutions![0]!;
    expect(`${solved.name} = ${solved.display.value} ${solved.display.unit}`).toBe('x = 4 cm');
    const circle = evaluateSheet(STATEMENT_EXAMPLES.relation).statements.at(-1)!.solutions![0]!;
    expect(`${circle.name} = ${circle.display.value} ${circle.display.unit}`).toBe('y = 4 m');
    expect(helpNamesOfLine('solve x ∈ ℝ, x > 0: sqrt(x) == 2')).toEqual(['solve', 'sqrt']);
    expect(helpNamesOfLine('solve x: sqrt(x) == 2', 'solve x: sqrt('.length)).toEqual(['sqrt', 'solve']);
    expect(helpNamesOfLine('  derive a == b')).toEqual(['derive']);
    // The other lines: a check with its source, a table, units; source counts outside texts only.
    expect(helpNamesOfLine('check "Ohyb": σ ≤ f_y source "EN 1993-1-1"')).toEqual(['check', 'source']);
    expect(helpNamesOfLine('M := max(a, b) source "EN 1990"')).toEqual(['max', 'source']);
    expect(helpNamesOfLine('"Viz source \\"x\\" v textu"')).toEqual([]);
    expect(helpNamesOfLine('table Mereni:')).toEqual(['table']);
    expect(helpNamesOfLine('unit EUR := 25 CZK')).toEqual(['unit']);
    expect(helpNamesOfLine('sourceX := 2')).toEqual([]);
    const shown = (keyword: (typeof STATEMENTS)[number]) => {
      const last = evaluateSheet(STATEMENT_EXAMPLES[keyword]).statements.at(-1)!;
      return last.display ? `${Number(last.display.value.toFixed(4))} ${last.display.unit}` : last.check ? `${last.check.passed} ${Math.round(last.check.utilization! * 100)}` : '';
    };
    expect(shown('check')).toBe('true 82');
    expect(shown('source')).toBe('27 kN·m');
    expect(shown('table')).toBe('25.3 °C');
    expect(shown('unit')).toBe('12000 CZK');
    expect(shown('dimension')).toBe('3.5 bod');
    expect(shown('input')).toBe('37.5 kN·m');
    expect(helpOf('solved', CATALOGS['cs']!, true)).toBeUndefined();
    // What the help of solve says: a system, a first guess.
    expect(evaluateSheet('solve (x, y): x + y == 1, x - y == 0').values.get('x')).toMatchObject({ si: 0.5 });
    expect(evaluateSheet('solve x: x^2 == 2 m^2 guess x = 1 m').diagnostics).toEqual([]);
  });

  it('writes a function in the notation of the user', () => {
    const def = builtinFunctions.get('round')!;
    const cs = howToWrite(def, CATALOGS['cs']!, true);
    expect(cs.signature).toBe('round(x; n)');
    expect(cs.example).toBe('round(3,14159; 2)');
    expect(cs.summary).toContain('Zaokrouhlení');
    expect(cs.details).toContain('desetinných');
    expect(howToWrite(def, CATALOGS['en']!, false).example).toBe('round(3.14159, 2)');
    // The Details pane shows the example without the tables it reads.
    expect(howToWrite(builtinFunctions.get('find_min')!, CATALOGS['cs']!, true).shortExample).toBe('W_pot := 150 cm³\nfind_min(Profily; by: A; where: r.W_y >= W_pot).profil');
  });

  it('finds the functions of a line and the one the cursor is in', () => {
    expect(functionsOfLine('M := max(sqrt(a), "sin(x)", b) + abs(c)').map((d) => d.name)).toEqual(['max', 'sqrt', 'abs']);
    const line = 'y := round(sqrt(2) + (1 + 2), 3)';
    expect(functionAtCursor(line, line.indexOf('2)'))?.name).toBe('sqrt');
    expect(functionAtCursor(line, line.indexOf('+ 2'))?.name).toBe('round');
    expect(functionAtCursor('y := hypo', 9)).toBeUndefined();
    expect(functionAtCursor('y := hypot', 10)?.name).toBe('hypot');
    expect(functionAtCursor('y := a + b', 10)).toBeUndefined();
  });
});
