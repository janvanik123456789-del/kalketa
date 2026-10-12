import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, formatExpr, parse, type Quantity } from '../src/index.js';
import { differentiate } from '../src/eval/differentiate.js';

const d = (source: string, x = 'x') => {
  const s = parse(`f := ${source}`, { isUnit: (name: string) => defaultRegistry.isUnit(name) }).sheet.statements[0]!;
  const expr = s.kind === 'definition' ? s.expr : undefined;
  const out = expr && differentiate(expr, x);
  return out && formatExpr(out);
};

describe('a derivative written out by hand', () => {
  it('of a polynomial, a quotient, roots and functions', () => {
    expect(d('a·x^2 + b·x + c')).toBe('2·a·x + b');
    expect(d('x^3')).toBe('3·x^2');
    expect(d('sin(2·x)')).toBe('2·cos(2·x)');
    expect(d('q·z^2/8', 'z')).toBe('2·q·z/8');
    expect(d('abs(x)')).toBeUndefined();
  });

  it('finds the vertex of a parabola where its first derivative is zero', () => {
    const r = evaluateSheet('a := 5\nb := 4\nc := -10\ny(x) := a·x^2 + b·x + c\nsolve x_v: y′(x_v) == 0\ny_v := y(x_v)');
    expect(r.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
    expect((r.values.get('x_v') as Quantity).si).toBeCloseTo(-0.4, 12);
    expect((r.values.get('y_v') as Quantity).si).toBeCloseTo(-10.8, 12);
  });

  it('marks the vertex in a chart', () => {
    const r = evaluateSheet('y(x) := 5·x^2 + 4·x - 10\nplot(y(x), x: -3 .. 2, extremes: true)');
    const e = r.statements.at(-1)!.plot!.series[0]!.extremes!;
    expect(e.map((v) => [Number(v.x.toFixed(6)), Number(v.y.toFixed(6)), v.peak])).toEqual([[-0.4, -10.8, false]]);
  });
});
