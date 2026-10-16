import { describe, expect, it } from 'vitest';
import { parse, defaultRegistry, quantity, type Expr } from '../src/index.js';
import { symbolDimensions } from '../src/eval/symbolDims.js';

const expr = (text: string): Expr => {
  const s = parse(text, { isUnit: (n) => defaultRegistry.isUnit(n) }).sheet.statements[0]!;
  if (s.kind !== 'display') throw new Error(s.kind);
  return s.expr;
};
const values: Record<string, ReturnType<typeof quantity>> = { ρ: quantity(1000, { M: 1, L: -3 }), g_z: quantity(9.81, { L: 1, T: -2 }), len: quantity(100, { L: 1 }) };

describe('dimensions of symbols from the equations they stand in', () => {
  it('spread along equations and sums: a length, an area, a pressure, a force', () => {
    const symbols = ['dy', 'S_d', 'p_h', 'y', 'F_d'];
    const equations = [
      [expr('S_d'), expr('len·dy')],
      [expr('p_h'), expr('ρ·g_z·y')],
      [expr('F_d'), expr('p_h·S_d')],
      [expr('y + dy'), expr('len')],
    ] as const;
    const dims = symbolDimensions(symbols, equations, (n) => values[n], () => undefined)!;
    expect(dims).toEqual([{ L: 1 }, { L: 2 }, { M: 1, L: -1, T: -2 }, { L: 1 }, { M: 1, L: 1, T: -2 }]);
  });

  it('leave a symbol no equation decides a pure number, and refuse equations that contradict', () => {
    expect(symbolDimensions(['k'], [[expr('len'), expr('len')]], (n) => values[n], () => undefined)).toEqual([{}]);
    expect(symbolDimensions(['k'], [[expr('len'), expr('ρ')]], (n) => values[n], () => undefined)).toBeUndefined();
  });
});
