import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

/**
 * Results that came out wrong or misleading without a word, found by calculating real worked examples
 * (docs/navrhy/VYBER-VZORU.md, stage 0). Each expected number comes from the closed form or from the book.
 */
const run = (source: string) => evaluateSheet(source);
const si = (source: string, name: string): number => {
  const v = run(source).values.get(name) as { si?: number } | undefined;
  if (typeof v?.si !== 'number') throw new Error(`${name}: ${JSON.stringify(run(source).diagnostics.map((d) => d.code))}`);
  return v.si;
};
const codes = (source: string) => run(source).diagnostics.map((d) => d.code);
const shown = (source: string, name: string) => {
  const r = run(source).statements.find((s) => s.statement.kind === 'definition' && s.statement.name === name);
  return r?.display?.unit;
};

describe('a fraction before a unit', () => {
  it('warns: 3/8 in is 3/(8 in), the rule stays', () => {
    expect(si('d := 3/8 in', 'd')).toBeCloseTo(3 / (8 * 0.0254), 6);
    expect(codes('d := 3/8 in')).toContain('W-FRACTION-BEFORE-UNIT');
  });

  it('is silent where a fraction is written out, or a unit is on both sides', () => {
    expect(codes('d := (3/8) in')).toEqual([]);
    expect(codes('a := 6 m/2 s')).not.toContain('W-FRACTION-BEFORE-UNIT');
    expect(codes('n := 3/8')).toEqual([]);
  });

  it('says it once for a formula calculated many times', () => {
    const found = codes('s := sum(k/8 in, k: 1 .. 3)\nz := 2/8 in + 2/8 in');
    expect(found.filter((c) => c === 'W-FRACTION-BEFORE-UNIT')).toHaveLength(2);
  });
});

describe('a result too small for a number', () => {
  it('warns instead of a silent zero', () => {
    expect(codes('p := 44^(-1e5)')).toContain('W-UNDERFLOW');
    expect(codes('p := 1e-200·1e-200')).toContain('W-UNDERFLOW');
    expect(codes('p := 1e-200/1e200')).toContain('W-UNDERFLOW');
    expect(codes('p := exp(-1e5)')).toContain('W-UNDERFLOW');
  });

  it('does not warn about a true zero, nor about the tail of an integral', () => {
    expect(codes('p := 0^2\nq := 0·1e-300\nr := exp(0)')).toEqual([]);
    expect(codes('I := integral(exp(-x^2), x: 0 .. 1000)')).not.toContain('W-UNDERFLOW');
    expect(codes('plot(exp(-x^2), x: 0 .. 1000)')).not.toContain('W-UNDERFLOW');
  });
});

describe('solve for a temperature in kelvins', () => {
  const sheet = 'solve T: T^2 == 4e4 K^2 in 100 K .. 450 K\na := T | °C\nT_0 := 373.15 K\nc := T - T_0';

  it('gives a temperature, as T := 200 K does', () => {
    expect(codes(sheet)).toEqual([]);
    expect(si(sheet, 'c')).toBeCloseTo(-173.15, 9);
    const a = run(sheet).statements.find((s) => s.statement.kind === 'definition' && s.statement.name === 'a')!;
    expect(a.display?.unit).toBe('°C');
    expect(a.display?.value).toBeCloseTo(-73.15, 9);
  });

  it('keeps a difference by its name', () => {
    const d = run('solve ΔT: 2·ΔT == 40 K in 0 K .. 100 K').values.get('ΔT') as { absolute?: boolean };
    expect(d.absolute).toBeFalsy();
  });
});

describe('a formula in a table', () => {
  it('reads a name defined above as that name, not as a unit', () => {
    const sheet = 'g := 9.81 m/s^2\ntable A:\n    | y [m] | a [m²/s²] = 2·g·y |\n    | 0.5 | |\nb := A.a[1]';
    expect(codes(sheet).filter((c) => c.startsWith('E'))).toEqual([]);
    expect(si(sheet, 'b')).toBeCloseTo(9.81, 9);
  });

  it('keeps a unit where no name stands above', () => {
    const sheet = 'table A:\n    | y [m] | t [s] = 2 s·y/(1 m) |\n    | 3 | |\nb := A.t[1]';
    expect(si(sheet, 'b')).toBeCloseTo(6, 9);
  });
});

describe('solve within an interval', () => {
  it('does not take a pole for a root: tan x + tanh x', () => {
    expect(si('solve x: tan(x) + tanh(x) == 0 in 0.1 .. 3', 'x')).toBeCloseTo(2.36502, 4);
  });

  it('goes past the pole between ends of opposite signs', () => {
    expect(si('solve x: tan(x) == 0 in 1 .. 4', 'x')).toBeCloseTo(Math.PI, 8);
  });

  it('says there is no root where only a pole changes the sign', () => {
    expect(codes('solve x: 1/x == 0 in -1 .. 2')).toContain('E-SOLVE-NO-ROOT');
    expect(codes('solve x: tan(x) == 0 in 1 .. 2')).toContain('E-SOLVE-NO-ROOT');
  });
});

describe('solve against a zero on one side', () => {
  it('solves a system through a function as well as written out', () => {
    const sheet = 'f(x, p, q) := p·x^3 - x^4 + q·x\nsolve (a, b):\n    f(2, a, b) == 0\n    f(3, a, b) == 0\n    guess a = 1, b = 1';
    expect(si(sheet, 'a')).toBeCloseTo(3.8, 9);
    expect(si(sheet, 'b')).toBeCloseTo(-7.2, 9);
  });

  it('solves the rate of return from a guess', () => {
    const cf = 'CF := [-100000 USD, 30000 USD, 30000 USD, 30000 USD, 30000 USD, 30000 USD]\n';
    expect(si(`${cf}solve m: npv(m, CF) == 0 USD guess m = 0.1`, 'm')).toBeCloseTo(0.15238, 4);
  });

  it('solves through an integral from a guess', () => {
    const sheet = 'u(R) := integral(R + 10 N/m·x, x: 0 m .. 2 m)\nsolve R_a: u(R_a) == 0 N·m guess R_a = -30 N';
    expect(si(sheet, 'R_a')).toBeCloseTo(-10, 8);
  });

  it('still refuses what has no root', () => {
    expect(codes('solve x: x^2 + 1 == 0 guess x = 1')).toContain('E-SOLVE-NO-CONVERGENCE');
  });
});

describe('a differential equation', () => {
  it('goes from a condition at the end backwards, not across a point without a value', () => {
    // (y − 1)³/3 = x² + 3·x + 5
    const sheet = 'solve y(x): (y - 1)^2·y′ == 2·x + 3 in 0 .. 1\n    y(1) == 4\na := y(0)';
    expect(si(sheet, 'a')).toBeCloseTo(1 + 15 ** (1 / 3), 5);
  });

  it('goes from a condition in the middle both ways', () => {
    const sheet = 'solve y(x): y′ == y in 0 .. 2\n    y(1) == 1\na := y(0)\nb := y(2)';
    expect(si(sheet, 'a')).toBeCloseTo(Math.exp(-1), 7);
    expect(si(sheet, 'b')).toBeCloseTo(Math.exp(1), 6);
  });

  it('does not begin where the equation has no value', () => {
    const sheet = 'solve u(x): u′ == 1/u in 0 .. 2\n    u(0) == 1\nw := u(1)';
    expect(si(sheet, 'w')).toBeCloseTo(Math.sqrt(3), 7);
  });

  it('refines the grid until a fast oscillation is right', () => {
    const sheet = 'solve y(t): y″ + 1000 1/s·y′ + 1e8 1/s^2·y == 0 in 0 s .. 10 ms\n    y(0 s) == 0 A\n    y′(0 s) == 1000 A/s\na := y(5 ms)';
    const w = Math.sqrt(1e8 - 250000);
    expect(si(sheet, 'a') / ((Math.exp(-2.5) * Math.sin(w * 5e-3) * 1000) / w)).toBeCloseTo(1, 5);
    expect(codes(sheet)).toEqual([]);
  }, 30000);

  it('notices a narrow load', () => {
    // 1 per unit length over 0.4 % of the interval: the integral of the load is 0.004. (A load narrower than
    // the steps can still fall between them: point loads have their own way, stage 4 of the selection.)
    const sheet = 'p(x) := if(x > 0.5001 and x < 0.5041, 1, 0)\nsolve y(x): y′ == p(x) in 0 .. 1\n    y(0) == 0\na := y(1)';
    expect(si(sheet, 'a')).toBeCloseTo(0.004, 3);
  });

  it('says where the solution ends', () => {
    const blowUp = codes('solve y(x): y′ == y^2 in 0 .. 2\n    y(0) == 1\na := y(2)');
    expect(blowUp.some((c) => c === 'E-ODE-SINGULAR' || c === 'W-ODE-ACCURACY')).toBe(true);
    expect(codes('solve u(x): u·u′ == -1 in 0 .. 2\n    u(0) == 1\nw := u(1)').some((c) => c === 'E-ODE-SINGULAR' || c === 'W-ODE-ACCURACY')).toBe(true);
  });

  it('solves two points with a nonlinear equation', () => {
    // y = √(1 + 3·x): y·y′ = 3/2, y(0) = 1, y(1) = 2; second order form y″·y + y′² = 0.
    const sheet = 'solve y(x): y·y″ + y′^2 == 0 in 0 .. 1\n    y(0) == 1\n    y(1) == 2\na := y(0.5)';
    expect(si(sheet, 'a')).toBeCloseTo(Math.sqrt(2.5), 5);
  });
});

describe('the unit of a function', () => {
  it('holds for what it returns', () => {
    const sheet = 'f(v) := 2 lbf·v | hp\na := f(10 ft/s)';
    expect(shown(sheet, 'a')).toBe('hp');
    expect(si(sheet, 'a')).toBeCloseTo(2 * 4.4482216152605 * 3.048, 6);
  });

  it('says so when it does not fit', () => {
    expect(codes('f(v) := 2 lbf·v | m\na := f(10 ft/s)')).toContain('E-TARGET-UNIT');
  });
});

describe('an angular velocity by its name', () => {
  it('is shown in rad/s', () => {
    expect(shown('ω := 1/sqrt(4 mH·2 μF)', 'ω')).toBe('rad/s');
    expect(shown('ω_0 := 1/sqrt(4 mH·2 μF)', 'ω_0')).toBe('rad/s');
  });

  it('leaves a frequency and a unit written by hand', () => {
    expect(shown('f := 1/sqrt(4 mH·2 μF)', 'f')).toBe('Hz');
    expect(shown('ω := 50 Hz', 'ω')).toBe('Hz');
  });
});

describe('units of tables and old books', () => {
  it('knows them', () => {
    expect(si('a := 25 dkg', 'a')).toBeCloseTo(0.25, 12);
    expect(si('a := 760 torr', 'a')).toBeCloseTo(101325, 6);
    expect(si('a := 14.7 psia', 'a')).toBeCloseTo(si('b := 14.7 psi', 'b'), 9);
    expect(si('a := 10 psig', 'a')).toBeCloseTo(si('b := 10 psi', 'b'), 9);
    expect(si('a := 2 Å', 'a')).toBeCloseTo(2e-10, 20);
    expect(si('a := 18 Da', 'a')).toBeCloseTo(18 * 1.6605390666e-27, 35);
    expect(si('a := 1 cP', 'a')).toBeCloseTo(1e-3, 12);
    expect(si('a := 1 cSt', 'a')).toBeCloseTo(1e-6, 12);
  });
});

describe('an integral with a singularity at an end', () => {
  it('is calculated, without a warning', () => {
    const sheet = 'I := integral(1/sqrt(x), x: 0 .. 1)';
    expect(si(sheet, 'I')).toBeCloseTo(2, 8);
    expect(codes(sheet)).toEqual([]);
    expect(si('I := integral(ln(x), x: 0 .. 1)', 'I')).toBeCloseTo(-1, 8);
    // At an end away from zero the rounding of x sets the limit: 2·√(1e-16).
    expect(si('I := integral(1/sqrt(1 - x), x: 0 .. 1)', 'I')).toBeCloseTo(2, 6);
  });

  it('still warns of a pole inside', () => {
    expect(codes('I := integral(1/abs(x - 0.3), x: 0 .. 1)')).toContain('W-CALCULUS-ACCURACY');
  });
});
