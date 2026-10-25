import { describe, expect, it } from 'vitest';
import { evaluateSheet, type Exact } from '../src/index.js';

const shown = (e: Exact | undefined) => (e ? `${e.num}/${e.den}${e.root === 1n ? '' : `√${e.root}`}` : 'none');
const last = (source: string) => {
  const r = evaluateSheet(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.statements.at(-1)!;
};

describe('exact results of a sheet', () => {
  it('keeps fractions and roots through the calculation, in the unit shown', () => {
    expect(shown(last('x := 1/3').display?.exact)).toBe('1/3');
    expect(shown(last('a := 2 m\nb := 6 m\nc := sqrt(a·b)').display?.exact)).toBe('2/1√3');
    expect(shown(last('V := 100 m^3/h\nt := 20 min\nW := V·t/3 | m^3').display?.exact)).toBe('100/9');
    expect(shown(last('d := (0.5 m)^0.5').display?.exact)).toBe('1/2√2');
  });

  it('shows nothing where the decimals end or the value is no fraction', () => {
    expect(last('x := 75/2').display?.exact).toBeUndefined();
    expect(last('x := π/3').display?.exact).toBeUndefined();
    expect(last('x := sin(0.5)').display?.exact).toBeUndefined();
    expect(last('t := 20 °C\nt').display?.exact).toBeUndefined();
  });

  it('gives the roots of a quadratic exactly: Ω = 49/9 s⁻² and 4 s⁻² (sample R22)', () => {
    const solve = last(
      ['m_1 := 9 kg', 'm_2 := 1 kg', 'k_1 := 38 N/m', 'k_2 := 2 N/m', 'k_3 := 3 N/m', 'solve Ω ∈ ℝ, Ω > 0 s^-2: (k_1 + k_2 - m_1·Ω)·(k_2 + k_3 - m_2·Ω) - k_2^2 == 0'].join('\n'),
    );
    expect(solve.roots!.roots.map((r) => shown(r.value.exact))).toEqual(['49/9', '4/1']);
  });
});
