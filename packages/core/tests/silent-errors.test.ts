import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('leaves a frequency; a value in turns becomes radians, or M·ω would be 2π short', () => {
    expect(shown('f := 1/sqrt(4 mH·2 μF)', 'f')).toBe('Hz');
    expect(shown('ω := 50 Hz', 'ω')).toBe('rad/s');
    expect(si('ω := 50 Hz', 'ω')).toBeCloseTo(100 * Math.PI, 10);
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

/** Found by measuring against the tests of other programs (docs/navrhy/CO-PREVZIT-Z-KONKURENCE.md, chapter 1). */
describe('what the comparison with other programs found', () => {
  const warned = (sheet: string) => evaluateSheet(sheet).diagnostics.filter((d) => d.severity === 'warning').map((d) => d.code);

  it('says when an interval holds more roots, and names them', () => {
    const r = evaluateSheet('a := solve(x^2 == 2, x: -3 .. 3)');
    const note = r.diagnostics.find((d) => d.code === 'W-SOLVE-MORE-ROOTS');
    expect(note).toBeDefined();
    expect(String(note!.params['others'])).toContain('1.41421');
    expect(warned('solve x: x^2 == 2 in -3 .. 3')).toContain('W-SOLVE-MORE-ROOTS');
    const three = evaluateSheet('a := solve((x^2 - x - 6)·(x^2 - 3·x + 2) == 0, x: 0 .. 4)').diagnostics.find((d) => d.code === 'W-SOLVE-MORE-ROOTS');
    expect(String(three!.params['others'])).toMatch(/^[123]; [123]$/);
  });

  it('says nothing where there is one root, a pole beside it, or no interval', () => {
    expect(warned('a := solve(x^3 == 2, x: 0 .. 3)')).toEqual([]);
    expect(warned('a := solve(x^2 == 2, x: 0 .. 3)')).toEqual([]);
    expect(warned('a := solve(tan(x) + tanh(x) == 0, x: 1.6 .. 3)')).toEqual([]);
    expect(warned('a := solve(x^2 == 2, x: 1)')).toEqual([]);
  });

  it('gives the roots in the unit of the interval', () => {
    const note = evaluateSheet('a := solve(x^2 == 4 m^2, x: -3 m .. 3 m)').diagnostics.find((d) => d.code === 'W-SOLVE-MORE-ROOTS');
    expect(String(note!.params['others'])).toContain(' m');
  });

  it('solve in a function of a chart or a table stays quiet and quick when it has one root', () => {
    expect(warned('f(c) := solve(x^3 == c, x: 0 .. 5)\ntable T: {rows=20}\n    | k | y = f(k) |\ny_1 := T.y[8]')).toEqual([]);
  });

  it('gives the same temperature on one line as on two', () => {
    expect(si('T := 300 K | °C', 'T')).toBeCloseTo(300, 10);
    const one = evaluateSheet('T := 300 K | °C');
    expect(one.statements[0]!.display!.value).toBeCloseTo(26.85, 10);
    expect(one.statements[0]!.display!.unit).toBe('°C');
    expect(evaluateSheet('300 K | °C').statements[0]!.display!.value).toBeCloseTo(26.85, 10);
    expect(evaluateSheet('T := 300 K\nU := T | °C').statements[1]!.display!.value).toBeCloseTo(26.85, 10);
  });

  it('keeps a difference a difference', () => {
    expect(evaluateSheet('ΔT := 30 K | °C').statements[0]!.display!.value).toBeCloseTo(30, 10);
    expect(evaluateSheet('a := 20 °C\nb := 5 °C\nd := a - b | Δ°C').statements[2]!.display!.value).toBeCloseTo(15, 10);
    expect(warned('a := 20 °C\nb := 5 °C\nd := a - b | Δ°C')).toEqual([]);
  });

  it('warns of a temperature read as a difference', () => {
    expect(warned('t := 20 °C\nd := t | Δ°C')).toContain('W-TEMP-ABSOLUTE-AS-DIFFERENCE');
    expect(warned('t := 20 °C\nd := t | K')).toEqual([]);
  });

  it('notices a corner, not a smooth curve', () => {
    expect(warned('a := derivative(abs(x), x: 0)')).toContain('W-DERIVATIVE-KINK');
    expect(warned('a := derivative(abs(x - 2 m), x: 2 m)')).toContain('W-DERIVATIVE-KINK');
    for (const smooth of ['derivative(x^2, x: 0)', 'derivative(x^2, x: 1)', 'derivative(sin(x), x: 0)', 'derivative(1e6·x^3, x: 0)', 'derivative(exp(x), x: 20)', 'derivative(abs(x), x: 3)', 'derivative(x^4, x: 0, order: 2)', 'derivative(1 m·x^2, x: 0 s)']) {
      expect(warned(`a := ${smooth}`), smooth).toEqual([]);
    }
  });

  it('rounds a half away from zero on both sides', () => {
    expect(si('a := round(-4.5)', 'a')).toBe(-5);
    expect(si('a := round(-2.5)', 'a')).toBe(-3);
    expect(si('a := round(2.5)', 'a')).toBe(3);
    expect(si('a := round(-0.5)', 'a')).toBe(-1);
    expect(si('a := round(-2.4)', 'a')).toBe(-2);
    expect(si('a := round(-2.567, 2)', 'a')).toBeCloseTo(-2.57, 12);
    expect(si('a := round(-1.005, 2)', 'a')).toBeCloseTo(-1.01, 12);
    expect(si('a := round(-0.2)', 'a')).toBe(0);
    expect(Object.is(si('a := round(-0.2)', 'a'), -0)).toBe(false);
    expect(si('a := round(-7/2)', 'a')).toBe(-4);
  });

  it('warns at a pole of the tangent, not near it', () => {
    expect(warned('a := tan(π/2)')).toContain('W-POLE');
    expect(warned('a := cot(π)')).toContain('W-POLE');
    expect(warned('a := tan(π/4)')).toEqual([]);
    expect(warned('a := tan(1.57)')).toEqual([]);
  });
});

/** docs/navrhy/ZADANI-Z-KONKURENCE.md, 1.18: SI writes Hz and rad/s both as 1/s, so 2π got lost without a word. */
describe('turns and radians', () => {
  const shown = (sheet: string): [number, string] => {
    const d = evaluateSheet(sheet).statements.at(-1)!.display!;
    return [d.value, d.unit ?? ''];
  };
  const close = (sheet: string, value: number, unit: string) => {
    const [v, u] = shown(sheet);
    expect(u, sheet).toBe(unit);
    expect(v / value, sheet).toBeCloseTo(1, 9);
  };
  const warned = (sheet: string) => evaluateSheet(sheet).diagnostics.filter((d) => d.severity === 'warning').map((d) => d.code);
  const TWO_PI = 2 * Math.PI;

  it('convert with 2π', () => {
    close('3000 rpm | rad/s', 100 * Math.PI, 'rad/s');
    close('ω := 314 rad/s\nω | rpm', (314 / TWO_PI) * 60, 'rpm');
    close('1 Hz | rad/s', TWO_PI, 'rad/s');
    close('ω_0 := sqrt(40 N/m / (10 kg))\nω_0 | Hz', 2 / TWO_PI, 'Hz');
    close('n := 1450 min^-1\nn | rad/s', (1450 * TWO_PI) / 60, 'rad/s');
    close('180 °/s | rpm', 30, 'rpm');
  });

  it('give the power of a moment and an angular velocity', () => {
    close('M := 100 N*m\nω := 3000 rpm\nM*ω | kW', 10 * Math.PI, 'kW');
    close('M := 100 N*m\nω := 50 Hz\nM*ω | kW', 10 * Math.PI, 'kW');
    close('ω := 3000 rpm', 100 * Math.PI, 'rad/s');
  });

  it('ω shown in rpm goes on in radians', () => {
    close('ω := 3000 rpm | rpm', 3000, 'rpm');
    close('M := 100 N*m\nω := 3000 rpm | rpm\nM*ω | kW', 10 * Math.PI, 'kW');
    close('ω := 3000 rpm | rpm\nω | rad/s', 100 * Math.PI, 'rad/s');
    close('ω := 3000 rpm | rpm\nω | rpm', 3000, 'rpm');
  });

  it('do not count 2π twice', () => {
    close('n := 3000 rpm\n2*π*n | rad/s', 100 * Math.PI, 'rad/s');
    close('n := 3000 rpm\nn*2*π | rad/s', 100 * Math.PI, 'rad/s');
    close('f := 50 Hz\nω := 2·π·f | rad/s', 100 * Math.PI, 'rad/s');
    close('f := 50 Hz\n2*3.14159*f | rad/s', 2 * 3.14159 * 50, 'rad/s');
    close('ω := 314 rad/s\nf := ω/(2·π) | Hz', 314 / TWO_PI, 'Hz');
    close('ω := 314 rad/s\nn := ω/(2·π) | rpm', (314 / TWO_PI) * 60, 'rpm');
    close('ω := 314 rad/s\nn := ω/2/π | Hz', 314 / TWO_PI, 'Hz');
    close('ω := 314 rad/s\nn := ω | rpm\nm := 2·π·n | rad/s', 314, 'rad/s');
  });

  it('leave what stays in its kind', () => {
    close('3000 rpm | Hz', 50, 'Hz');
    close('50 Hz | rpm', 3000, 'rpm');
    close('ω := 2·π·60 Hz\nv := ω·2 m | m/s', 2 * Math.PI * 120, 'm/s');
    close('f := 50 Hz\nT := 1/f | s', 0.02, 's');
    close('60 rad/s | rad/min', 3600, 'rad/min');
    close('ω := 100 rad/s\nx := ω/2 | rpm', (50 / TWO_PI) * 60, 'rpm');
  });

  it('assume nothing of a plain 1/s', () => {
    close('5 1/s | rad/s', 5, 'rad/s');
    close('5 1/s | Hz', 5, 'Hz');
    close('k := 40 N/m\nm := 10 kg\nw := sqrt(k/m)\nw | rad/s', 2, 'rad/s');
    close('T := 0.02 s\nf := 1/T | Hz', 50, 'Hz');
  });

  it('add and compare in the kind of the left side', () => {
    close('2 Hz + 1 rad/s | Hz', 2 + 1 / TWO_PI, 'Hz');
    close('1 rad/s + 1 Hz | rad/s', 1 + TWO_PI, 'rad/s');
    expect(evaluateSheet('a := 100 rad/s > 20 Hz').values.get('a')).toMatchObject({ value: false });
    expect(evaluateSheet('a := 200 rad/s > 20 Hz').values.get('a')).toMatchObject({ value: true });
  });

  it('take a column of a table, a series and a function to their unit', () => {
    close('table T:\n    | n [rpm] | w [rad/s] = n |\n    | 3000    |               |\nx := T.w[1] | rad/s', 100 * Math.PI, 'rad/s');
    const list = evaluateSheet('v := [1 Hz, 2 Hz] | rad/s').statements[0]!.displayList!;
    expect(list[1]!.value).toBeCloseTo(2 * TWO_PI, 10);
    close('w(f) := f | rad/s\nw(1 Hz)', TWO_PI, 'rad/s');
  });

  it('draw a chart in the unit asked for', () => {
    const plot = (sheet: string) => evaluateSheet(sheet).statements.at(-1)!.plot!;
    const inRpm = plot('w(x) := (100 rad/s)·x\nplot(w(x), x: 0 .. 1) | rpm');
    expect(inRpm.yUnit).toBe('rpm');
    expect(inRpm.series[0]!.ys.at(-1)! / ((100 / TWO_PI) * 60)).toBeCloseTo(1, 9);
    const inRadians = plot('n(x) := (60 rpm)·x\nplot(n(x), x: 0 .. 1) | rad/s');
    expect(inRadians.series[0]!.ys.at(-1)! / TWO_PI).toBeCloseTo(1, 9);
  });

  it('warn of a moment times turns, in no other product', () => {
    const power = 'M := 100 N*m\nn := 3000 rpm\n';
    expect(warned(`${power}P := M*n | kW`)).toContain('W-TURNS-IN-POWER');
    expect(warned(`${power}P := n*M | kW`)).toContain('W-TURNS-IN-POWER');
    expect(warned('M := 100 N*m\nf := 50 Hz\nP := M*f | kW')).toContain('W-TURNS-IN-POWER');
    for (const fine of ['P := 2*π*n*M | kW', 'P := M*2*π*n | kW', 'P := n*M*2*π | kW', 'P := M*n*2*π/60 | kW']) expect(warned(power + fine), fine).toEqual([]);
    expect(warned('W := 100 J\nf := 50 Hz\nP := W*f | kW')).toEqual([]);
    expect(warned('m := 2 kg\nn := 3000 rpm\nx := m*n')).toEqual([]);
    expect(warned('ω := 100 rad/s\nM := 100 N*m\nP := M*ω | kW')).toEqual([]);
  });
});

/** docs/navrhy/ZADANI-Z-KONKURENCE.md, 1.12. */
describe('a name after a unit', () => {
  const warned = (sheet: string) => evaluateSheet(sheet).diagnostics.filter((d) => d.severity === 'warning').map((d) => d.code);

  it('warns where the reading is hardly what is meant', () => {
    expect(warned('A := 0.01 m^2\ns := 100 kN/A')).toEqual(['W-NAME-AS-UNIT']);
    expect(warned('L := 6 m\nq := 60 kN/L')).toEqual(['W-NAME-AS-UNIT']);
    expect(warned('h := 3 m\nq := 60 kN/h')).toEqual(['W-NAME-AS-UNIT']);
    expect(warned('f(A) := 100 kN/A')).toEqual(['W-NAME-AS-UNIT']);
  });

  it('at every place, and it stands beside the error of units', () => {
    expect(warned('A := 0.01 m^2\ns := 100 kN/A\nt_2 := 200 kN/A')).toEqual(['W-NAME-AS-UNIT', 'W-NAME-AS-UNIT']);
    const r = evaluateSheet('d := 450 mm\nk := 1 + sqrt(200 mm/d)');
    expect(r.diagnostics.map((x) => x.code)).toContain('W-NAME-AS-UNIT');
    expect(r.diagnostics.map((x) => x.code)).toContain('E-UNIT-MISMATCH');
  });

  it('keeps quiet where the unit is meant', () => {
    expect(warned('d := 450 mm\nx := (200 mm)/d')).toEqual([]);
    expect(warned('m := 5 kg\na := 10 N/m\nb := 2 m')).toEqual([]);
    expect(warned('b := 2 m\nm := 5 kg\na := 10 N/m')).toEqual([]);
    // The name holds what the unit is: 5 km/d with a day in d.
    expect(warned('d := 2 h\nv := 5 km/d')).toEqual([]);
    expect(warned('A := 0.01 m^2\ns := 100 kN/[A]')).toEqual([]);
    expect(warned('s := 100 kN/m\nx := 5 kN/h')).toEqual([]);
  });

  it('counts as written: the brackets give what was meant', () => {
    expect(si('d := 450 mm\nk := 1 + sqrt((200 mm)/d)', 'k')).toBeCloseTo(1 + Math.sqrt(200 / 450), 12);
  });
});

/** docs/navrhy/ZADANI-Z-KONKURENCE.md, the rest of priorities 1 and 2. */
describe('the rest of the brief', () => {
  const warned = (sheet: string) => evaluateSheet(sheet).diagnostics.filter((d) => d.severity === 'warning').map((d) => d.code);
  const shownOf = (sheet: string) => {
    const d = evaluateSheet(sheet).statements.at(-1)!.display!;
    return [Number(d.value.toPrecision(5)), d.unit];
  };

  it('1.8 says when a curve goes beyond its points', () => {
    const data = 'x := [0, 10, 20]\ny := [0, 100, 400]\n';
    expect(warned(`${data}a := spline(x, y, 25)`)).toEqual(['W-INTERP-BEYOND']);
    expect(warned(`${data}a := pchip(x, y, 25)`)).toEqual(['W-INTERP-BEYOND']);
    expect(warned(`${data}a := pchip(x, y, 15)`)).toEqual([]);
    expect(warned(`${data}a := interp1(x, y, 25, "linear", "extrap")`)).toEqual([]);
  });

  it('1.14 takes a prefix that reads', () => {
    expect(shownOf('F := 100 kN\nA := 300 mm * 500 mm\nF/A')).toEqual([0.66667, 'MPa']);
    // The scale of the calculation stays while the number reads.
    expect(shownOf('F := 800 N\nA := 1000 mm^2\nF/A')).toEqual([0.8, 'MPa']);
    expect(shownOf('F := 500 kN\nA := 100 mm^2\nF/A')).toEqual([5, 'GPa']);
    expect(shownOf('M := 20 kN·m\nW := 100 cm^3\nM/W')).toEqual([200, 'MPa']);
  });

  it('1.13 tells a matrix of different scales from a singular one', () => {
    const r = evaluateSheet('u := lsolve([1e12, 1 | 1, 1e-6], [1e12 | 2])');
    expect(r.diagnostics.map((d) => d.code)).toEqual([]);
    const [a, b] = (r.values.get('u') as unknown as { items: { si: number }[] }).items;
    // By hand: 1e12·x + y = 1e12, x + 1e-6·y = 2.
    expect(a!.si).toBeCloseTo(0.999999, 5);
    expect(b!.si / 1000001).toBeCloseTo(1, 6);
    expect(codes('u := lsolve([1, 2 | 2, 4], [1 | 2])')).toContain('E-MATRIX-SINGULAR');
  });

  const HILBERT = (n: number) => `H := matrix(1/(i + j - 1), i: 1 .. ${n}, j: 1 .. ${n})\n`;

  it('1.9 keeps a very small determinant, and warns of what cannot be told', () => {
    const r = evaluateSheet(`${HILBERT(12)}a := det(H)`);
    expect(r.diagnostics).toEqual([]);
    expect(si(`${HILBERT(12)}a := det(H)`, 'a') / 2.6377e-78).toBeCloseTo(1, 3);
    expect(si('a := det([1, 2, 3 | 4, 5, 6 | 7, 8, 9])', 'a')).toBe(0);
    expect(warned(`${HILBERT(10)}f := vector(1, i: 1 .. 10)\nu := lsolve(H, f)`)).toEqual(['W-ILL-CONDITIONED']);
    expect(warned(`${HILBERT(4)}f := vector(1, i: 1 .. 4)\nu := lsolve(H, f)`)).toEqual([]);
    // Without an exact form: the matrix of 1..9 times a number written by a function.
    expect(warned('c := sqrt(2)\na := det(c·[1, 2, 3 | 4, 5, 6 | 7, 8, 9])')).toEqual(['W-ILL-CONDITIONED']);
  });

  it('1.16 takes a column of a matrix as a series', () => {
    expect(si('a := mean([1 | 2 | 3])', 'a')).toBe(2);
    expect(si('a := sum([1 | 2 | 3])', 'a')).toBe(6);
    expect(si('a := len([1 | 2 | 3])', 'a')).toBe(3);
    expect(codes('a := mean([1, 2 | 3, 4])')).toContain('E-TYPE');
  });

  it('1.15 reports a too long expression on its line', () => {
    const long = (n: number) => `x := ${Array.from({ length: n }, () => '1').join(' + ')}\ny := 2`;
    expect(codes(long(3000))).toContain('E-EXPR-DEPTH');
    expect(si(long(3000), 'y')).toBe(2);
    expect(si(long(800), 'x')).toBe(800);
    expect(codes(`x := ${'('.repeat(20000)}1${')'.repeat(20000)}\ny := 2`)).toContain('E-EXPR-DEPTH');
  });

  it('1.17 has no centitonne', () => {
    expect(codes('a := 1 ct | kg').length).toBeGreaterThan(0);
    expect(si('a := 2 kt', 'a')).toBe(2e6);
    expect(si('a := 2 t', 'a')).toBe(2000);
  });
});

describe('short things from the study of other programs', () => {
  const near = (sheet: string, name: string, value: number) => expect(si(sheet, name) / value).toBeCloseTo(1, 10);

  it('suggests what was probably meant', () => {
    const suggestion = (sheet: string) => evaluateSheet(sheet).diagnostics.find((d) => d.code === 'I-DID-YOU-MEAN')?.params['suggestion'];
    expect(suggestion('F := 12 KN')).toBe('kN');
    expect(suggestion('p := 5 Mpa')).toBe('MPa');
    expect(suggestion('x_net := 5\ny := x_nett + 1')).toBe('x_net');
    expect(suggestion('y := sinn(1)')).toBe('sin');
    expect(suggestion('y := average([1, 2])')).toBe('mean');
    expect(suggestion('y := 5 wizard')).toBeUndefined();
    expect(suggestion('abc := 1\ny := xyz + 1')).toBeUndefined();
  });

  it('names the units as written in an error', () => {
    const d = evaluateSheet('x := 1 kN + 1 m').diagnostics.find((e) => e.code === 'E-UNIT-MISMATCH')!;
    expect([d.params['left'], d.params['right']]).toEqual(['kN', 'm']);
  });

  it('takes numbers in a row', () => {
    expect(si('a := sum(1, 2, 3)', 'a')).toBe(6);
    expect(si('a := sum(2, 3)', 'a')).toBe(5);
    expect(si('a := mean(2, 4, 9)', 'a')).toBe(5);
    expect(si('a := sum(1 kN, [2, 3] kN) | kN', 'a')).toBe(6000);
    expect(codes('a := sum(1 kN, 1 m)')).toContain('E-UNIT-MISMATCH');
    expect(codes('y := sum(F_i·a_i, i)')).toContain('E-NO-BOUNDS');
  });

  it('finds the greatest and the least value with its unit', () => {
    const beam = 'q := 10 kN/m\nl := 6 m\nM(x) := q·x·(l - x)/2\n';
    expect(si(`${beam}a := max_of(M(x), x: 0 m .. l)`, 'a')).toBeCloseTo(45000, 3);
    expect(si(`${beam}a := maximize(M(x), x: 0 m .. l)`, 'a')).toBeCloseTo(3, 4);
    expect(evaluateSheet(`${beam}a := max_of(M(x), x: 0 m .. l)`).statements.at(-1)!.display!.unit).toBe('kN·m');
    expect(si('a := min_of(x^2 - 2·x, x: 0 .. 4)', 'a')).toBeCloseTo(-1, 8);
    // At an end of the interval too.
    expect(si('a := max_of(x, x: 0 .. 4)', 'a')).toBeCloseTo(4, 8);
  });

  it('has the small functions, against their definitions', () => {
    near('a := sec(1)', 'a', 1 / Math.cos(1));
    near('a := csc(1)', 'a', 1 / Math.sin(1));
    near('a := acot(2)', 'a', Math.atan(0.5));
    near('a := asec(2)', 'a', Math.PI / 3);
    near('a := acsc(2)', 'a', Math.PI / 6);
    near('a := coth(1)', 'a', 1 / Math.tanh(1));
    near('a := sech(1)', 'a', 1 / Math.cosh(1));
    near('a := csch(1)', 'a', 1 / Math.sinh(1));
    expect(si('a := gcd(12, 18, 8)', 'a')).toBe(2);
    expect(si('a := lcm(4, 6)', 'a')).toBe(12);
    expect(si('a := lcm([4, 6, 10])', 'a')).toBe(60);
    expect(si('a := trunc(-2.7)', 'a')).toBe(-2);
    expect(si('a := srss(3 kN, 4 kN)', 'a')).toBeCloseTo(5000, 8);
    expect(si('a := sumsq(3, 4)', 'a')).toBe(25);
    expect(si('a := stdevp([2, 4, 6])', 'a')).toBeCloseTo(Math.sqrt(8 / 3), 12);
    expect(si('a := varp([2, 4, 6])', 'a')).toBeCloseTo(8 / 3, 12);
    expect(si('a := last(reverse([1, 2, 3]))', 'a')).toBe(1);
    expect(codes('a := gcd(1.5, 2)')).toContain('E-DOMAIN');
    expect(codes('a := coth(0)')).toContain('E-DOMAIN');
  });

  it('cuts and joins matrices', () => {
    const list = (sheet: string, name: string) => (evaluateSheet(sheet).values.get(name) as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(list('A := submatrix([1, 2, 3 | 4, 5, 6 | 7, 8, 9], 2, 3, 2, 3)', 'A')).toEqual([5, 6, 8, 9]);
    expect(list('A := submatrix([1, 2 | 3, 4], 1, 2, 2, 2)', 'A')).toEqual([2, 4]);
    expect(list('A := augment([1 | 2], [3 | 4])', 'A')).toEqual([1, 3, 2, 4]);
    expect(list('A := stack([1, 2 | 3, 4], [5, 6 | 7, 8])', 'A')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(list('A := hprod([1, 2 | 3, 4], [5, 6 | 7, 8])', 'A')).toEqual([5, 12, 21, 32]);
    expect(list('A := kprod([1, 2], transpose([1, 1]))', 'A')).toEqual([1, 1, 2, 2]);
    expect(codes('A := submatrix([1, 2 | 3, 4], 1, 3, 1, 1)')).toContain('E-INDEX');
    expect(codes('A := augment([1 | 2], [1 | 2 | 3])')).toContain('E-MATRIX-SHAPE');
  });
});

/** Stages 5 and 6 of docs/navrhy/VYBER-VZORU.md; the values against NumPy and SciPy in tests/data. */
describe('complex numbers to the end', () => {
  const pair = (sheet: string, name: string): [number, number] => {
    const q = evaluateSheet(sheet).values.get(name) as unknown as { si: number; im?: number };
    return [q.si, q.im ?? 0];
  };
  const close = (sheet: string, re: number, im: number) => {
    const [a, b] = pair(`z := ${sheet}`, 'z');
    expect(a, sheet).toBeCloseTo(re, 10);
    expect(b, sheet).toBeCloseTo(im, 10);
  };

  it('takes the functions', () => {
    close('exp(1 + 2j)', Math.E * Math.cos(2), Math.E * Math.sin(2));
    close('ln(1 + 1j)', Math.log(Math.SQRT2), Math.PI / 4);
    close('sin(1 + 1j)', Math.sin(1) * Math.cosh(1), Math.cos(1) * Math.sinh(1));
    close('cos(1 + 1j)', Math.cos(1) * Math.cosh(1), -Math.sin(1) * Math.sinh(1));
    close('cosh(1 + 1j)', Math.cosh(1) * Math.cos(1), Math.sinh(1) * Math.sin(1));
    close('tanh(1 + 1j)', 1.0839233273386946, 0.27175258531951174);
    close('tan(1 + 1j)', 0.27175258531951174, 1.0839233273386946);
    close('2^(1 + 1j)', 2 * Math.cos(Math.LN2), 2 * Math.sin(Math.LN2));
    close('(1j)^(1j)', Math.exp(-Math.PI / 2), 0);
    // Euler.
    close('exp(1j·π) + 1', 0, 0);
  });

  it('keeps errors where a real answer is asked for', () => {
    expect(codes('z := ln(-1)')).toContain('E-DOMAIN');
    expect(codes('z := atan(1 + 1j)')).toContain('E-COMPLEX-ARG');
    expect(codes('z := (2 m)^(1j)')).toContain('E-COMPLEX-ARG');
    expect(codes('z := stdev([1 + 1j, 2, 3])')).toContain('E-COMPLEX-ARG');
    expect(codes('z := max([1 + 1j, 2])')).toContain('E-COMPLEX-ARG');
  });

  it('adds complex terms, integrates a complex integrand', () => {
    expect(pair('z := sum([1 + 1j, 2 + 3j])', 'z')).toEqual([3, 4]);
    expect(pair('z := mean([1 + 1j, 3 + 3j])', 'z')).toEqual([2, 2]);
    const [a, b] = pair('z := sum(exp(1j·2·π·k/8), k: 0 .. 7)', 'z');
    expect(Math.hypot(a, b)).toBeLessThan(1e-12);
    // ∫₀^π e^(jx) dx = 2j.
    const [re, im] = pair('z := integral(exp(1j·x), x: 0 .. π)', 'z');
    expect(re).toBeCloseTo(0, 9);
    expect(im).toBeCloseTo(2, 9);
    // Of a rectangular pulse: sin(w)/w·2 at w = 1.
    const [fr, fi] = pair('z := integral(exp(-1j·x), x: -1 .. 1)', 'z');
    expect(fr).toBeCloseTo(2 * Math.sin(1), 9);
    expect(fi).toBeCloseTo(0, 9);
  });

  it('solves complex matrices, with units', () => {
    // Coupled coils: (1 + 2j)·I1 + 1j·I2 = 10, 1j·I1 + (1 + 2j)·I2 = 0. By hand I1 = 10·(1 + 2j)/((1 + 2j)² + 1) = 10·(1 + 2j)/(−2 + 4j).
    const sheet = 'Z := [(1 + 2j) Ω, 1j Ω | 1j Ω, (1 + 2j) Ω]\nI := lsolve(Z, [10 V | 0 V])\ni := I[1]\nd := det(Z)\nJ := inverse(Z)\nj_1 := J[1, 1]';
    const [re, im] = pair(sheet, 'i');
    expect(re).toBeCloseTo(3, 10);
    expect(im).toBeCloseTo(-4, 10);
    expect(pair(sheet, 'd')).toEqual([-2, 4]);
    expect(pair(sheet, 'j_1')[0]).toBeCloseTo(0.3, 10);
    expect(evaluateSheet(sheet).diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('gives the eigenvalues of any square matrix', () => {
    const list = (sheet: string) => (evaluateSheet(sheet).values.get('v') as unknown as { items: { si: number; im?: number }[] }).items;
    const a = list('v := eigenvals([1, 2 | 3, 4])');
    expect(a[0]!.si).toBeCloseTo((5 - Math.sqrt(33)) / 2, 10);
    expect(a[1]!.si).toBeCloseTo((5 + Math.sqrt(33)) / 2, 10);
    // A rotation: ±j, exact pair.
    const b = list('v := eigenvals([0, -1 | 1, 0])');
    expect(b[0]!.si).toBeCloseTo(0, 12);
    expect(b[0]!.im).toBeCloseTo(1, 12);
    expect(b[1]!.im).toBe(-b[0]!.im!);
    // State matrix of a damped oscillator ω₀ = 2, ζ = 0.25: −0.5 ± j·√3.75.
    const c = list('v := eigenvals([0, 1 | -4, -1])');
    expect(c[0]!.si).toBeCloseTo(-0.5, 10);
    expect(c[0]!.im).toBeCloseTo(Math.sqrt(3.75), 10);
    // A symmetric one goes the old way, real.
    expect(list('v := eigenvals([2, 1 | 1, 2])').map((q) => q.si)).toEqual([1, 3].map((x) => expect.closeTo(x, 10)));
  });

  it('gives eigenvectors that hold', () => {
    const r = evaluateSheet('A := [0, 1 | -4, -1]\nv := eigenvals(A)\nV := eigenvecs(A)\nx := A·[V[1, 1] | V[2, 1]]\ny := v[1]·V[1, 1]');
    const x = (r.values.get('x') as unknown as { items: { si: number; im?: number }[] }).items[0]!;
    const y = r.values.get('y') as unknown as { si: number; im?: number };
    expect(x.si).toBeCloseTo(y.si, 8);
    expect(x.im ?? 0).toBeCloseTo(y.im ?? 0, 8);
  });

  it('unwraps a phase', () => {
    const v = (evaluateSheet('v := unwrap([3, -3, -2.9])').values.get('v') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(v[1]).toBeCloseTo(-3 + 2 * Math.PI, 12);
    expect(v[2]).toBeCloseTo(-2.9 + 2 * Math.PI, 12);
  });
});

describe('linear algebra and whole numbers, stage 6', () => {
  it('rank, cond, singular values, null space', () => {
    expect(si('a := rank([1, 2 | 2, 4])', 'a')).toBe(1);
    expect(si('a := rank([1, 0 | 0, 1])', 'a')).toBe(2);
    expect(si('a := rank([1, 2, 3 | 4, 5, 6 | 7, 8, 9])', 'a')).toBe(2);
    expect(si('a := rank([1, 2, 3 | 4, 5, 6])', 'a')).toBe(2);
    expect(si('a := cond([1, 0 | 0, 1])', 'a')).toBeCloseTo(1, 12);
    const n = (evaluateSheet('v := nullspace([1, 2 | 2, 4])').values.get('v') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(n[0]).toBeCloseTo(1, 10);
    expect(n[1]).toBeCloseTo(-0.5, 10);
    expect(codes('v := nullspace([1, 0 | 0, 1])')).toContain('E-NULLSPACE-NONE');
    const s = (evaluateSheet('v := singvals([3, 0 | 0, 4])').values.get('v') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(s[0]).toBeCloseTo(4, 12);
    expect(s[1]).toBeCloseTo(3, 12);
  });

  it('balances a chemical equation from the null space: C3H8 + 5 O2 = 3 CO2 + 4 H2O', () => {
    const r = evaluateSheet('A := [3, 0, -1, 0 | 8, 0, 0, -2 | 0, 2, -2, -1]\nv := nullspace(A)\nb := rat(v/v[1]·1)\nc := v/v[1]');
    const c = (r.values.get('c') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    [1, 5, 3, 4].forEach((x, i) => expect(c[i]).toBeCloseTo(x, 9));
    expect((r.values.get('b') as unknown as { value: string }).value).toBe('1; 5; 3; 4');
  });

  it('writes a number as a fraction, or says it cannot', () => {
    const text = (sheet: string) => (evaluateSheet(sheet).values.get('a') as unknown as { value: string }).value;
    expect(text('a := rat(0.75)')).toBe('3/4');
    expect(text('a := rat(-1/3)')).toBe('-1/3');
    expect(text('a := rat(2)')).toBe('2');
    expect(codes('a := rat(π)')).toContain('E-DOMAIN');
    expect(codes('a := rat(2 m)')).toContain('E-DOMAIN');
  });

  it('reads a chemical formula', () => {
    const grams = (formula: string) => si(`a := molar_mass("${formula}")`, 'a') * 1000;
    expect(grams('H2O')).toBeCloseTo(18.015, 3);
    expect(grams('CaCO3')).toBeCloseTo(100.086, 3);
    expect(grams('Ca3(PO4)2')).toBeCloseTo(310.174, 2);
    expect(grams('CuSO4·5H2O')).toBeCloseTo(249.68, 1);
    expect(grams('CO')).toBeCloseTo(28.01, 2);
    expect(grams('Co')).toBeCloseTo(58.933, 3);
    expect(evaluateSheet('a := molar_mass("H2O")').statements[0]!.display!.unit).toBe('g/mol');
    expect(codes('a := molar_mass("Xx2")')).toContain('E-FORMULA');
    expect(codes('a := molar_mass("Ca(OH")')).toContain('E-FORMULA');
    expect(si('n := (36 g)/molar_mass("H2O")', 'n')).toBeCloseTo(36 / 18.015, 3);
  });
});

/** Stage 4 of docs/navrhy/VYBER-VZORU.md, against closed forms. */
describe('more differential equations together, and a number sought', () => {
  const at = (sheet: string, name: string) => {
    const r = evaluateSheet(sheet);
    expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code} ${d.span.line}`)).toEqual([]);
    return (r.values.get(name) as { si: number }).si;
  };

  it('A ⇌ B: first order, exchange towards equilibrium', () => {
    const sheet = 'k_1 := 0.1 1/s\nk_2 := 0.05 1/s\nsolve (a(t), b(t)): a′ == -k_1·a + k_2·b, b′ == k_1·a - k_2·b in 0 s .. 30 s\n    a(0 s) == 1 mol/l\n    b(0 s) == 0 mol/l\nx := a(10 s)\ny := b(10 s)\nz := a′(10 s)';
    const eq = 1000 * (0.05 / 0.15);
    const exact = eq + (1000 - eq) * Math.exp(-0.15 * 10);
    expect(at(sheet, 'x') / exact).toBeCloseTo(1, 7);
    expect(at(sheet, 'x') + at(sheet, 'y')).toBeCloseTo(1000, 7);
    // The highest derivative goes in straight lines between the points of the grid.
    expect(at(sheet, 'z') / (-0.1 * exact + 0.05 * (1000 - exact))).toBeCloseTo(1, 3);
  });

  it('an RLC circuit in state equations: the same as its closed form', () => {
    const sheet = 'R := 10 Ω\nL_c := 1 mH\nC_c := 10 μF\nU := 10 V\nsolve (i(t), u(t)): L_c·i′ == U - R·i - u, C_c·u′ == i in 0 s .. 2 ms\n    i(0 s) == 0 A\n    u(0 s) == 0 V\nx := i(0.5 ms)';
    const [r, l, c] = [10, 1e-3, 1e-5];
    const alpha = r / (2 * l);
    const w = Math.sqrt(1 / (l * c) - alpha * alpha);
    expect(at(sheet, 'x') / ((10 / (l * w)) * Math.exp(-alpha * 5e-4) * Math.sin(w * 5e-4))).toBeCloseTo(1, 6);
  });

  it('highest derivatives that mix: coupled coils', () => {
    // L·i₁′ + M·i₂′ = U, M·i₁′ + L·i₂′ = 0 with no resistance: i₁′ = U·L/(L² − M²).
    const sheet = 'L_c := 2 H\nM_c := 1 H\nU := 3 V\nsolve (p(t), q(t)): L_c·p′ + M_c·q′ == U, M_c·p′ + L_c·q′ == 0 V in 0 s .. 1 s\n    p(0 s) == 0 A\n    q(0 s) == 0 A\nx := p(1 s)\ny := q(1 s)';
    expect(at(sheet, 'x')).toBeCloseTo((3 * 2) / 3, 8);
    expect(at(sheet, 'y')).toBeCloseTo((-3 * 1) / 3, 8);
  });

  it('second order with first order, conditions at both ends', () => {
    // u″ = 2 with u(0) = 0, u(1) = 1 gives u = x²; v′ = u, v(0) = 0 gives v = x³/3.
    const sheet = 'solve (u(x), v(x)): u″ == 2, v′ == u in 0 .. 1\n    u(0) == 0\n    u(1) == 1\n    v(0) == 0\na := u(0.5)\nb := v(1)';
    expect(at(sheet, 'a')).toBeCloseTo(0.25, 8);
    expect(at(sheet, 'b')).toBeCloseTo(1 / 3, 8);
  });

  it('the critical force of a strut, and which mode comes from which guess', () => {
    const base = (guess: string) => `E_I := 2000 kN·m^2\nL_p := 4 m\nsolve w(x), P: E_I·w″ + P·w == 0 in 0 m .. L_p\n    w(0 m) == 0 m\n    w(L_p) == 0 m\n    w′(0 m) == 0.01\n    guess P = ${guess}\nF := P | kN`;
    const euler = (Math.PI ** 2 * 2000) / 16;
    expect(at(base('1000 kN'), 'P') / (euler * 1000)).toBeCloseTo(1, 6);
    expect(at(base('4800 kN'), 'P') / (4 * euler * 1000)).toBeCloseTo(1, 6);
    expect(evaluateSheet(base('1000 kN')).statements.at(-1)!.display!.unit).toBe('kN');
  });

  it('a natural frequency written the same way', () => {
    const sheet = 'c := 340 m/s\nl := 1 m\nsolve p(x), ω_n: c^2·p″ + ω_n^2·p == 0 in 0 m .. l\n    p(0 m) == 0 Pa\n    p(l) == 0 Pa\n    p′(0 m) == 1 Pa/m\n    guess ω_n = 1000 1/s\nf := ω_n';
    expect(at(sheet, 'f') / (Math.PI * 340)).toBeCloseTo(1, 6);
  });

  it('says what is missing', () => {
    expect(codes('solve (a(t), b(t)): a′ == b, b′ == a in 0 .. 1\n    a(0) == 1')).toContain('E-ODE-CONDITIONS');
    expect(codes('solve w(x), P: w″ + P·w == 0 in 0 .. 1\n    w(0) == 0\n    w(1) == 0\n    w′(0) == 1')).toContain('E-ODE-GUESS');
    expect(codes('solve (a(t), b(s)): a′ == b, b′ == a in 0 .. 1\n    a(0) == 1\n    b(0) == 0').length).toBeGreaterThan(0);
  });

  it('one equation goes on as before', () => {
    expect(at('solve y(x): y′ == y in 0 .. 1\n    y(0) == 1\na := y(1)', 'a')).toBeCloseTo(Math.E, 8);
  });
});

/** Point 10 of the order after the study: every value below against a closed form of a textbook. */
describe('beams and frames', () => {
  const EI = 20e6;
  const q = 10e3;
  const of = (sheet: string, name: string) => {
    const r = evaluateSheet(sheet);
    expect(r.diagnostics.filter((d) => d.severity !== 'info').map((d) => `${d.code} ${d.span.line}`)).toEqual([]);
    return r.values.get(name) as unknown as { si: number; items: { si: number }[] };
  };
  const close = (got: number, want: number) => {
    if (want === 0) expect(Math.abs(got)).toBeLessThan(1e-6);
    else expect(got / want).toBeCloseTo(1, 7);
  };
  const beam = 'N := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m, 6 m], q: 10 kN/m)\n';

  it('a simple beam under a uniform load', () => {
    close(of(`${beam}a := N.M_max`, 'a').si, (q * 36) / 8);
    close(of(`${beam}a := N.w_max`, 'a').si, (5 * q * 6 ** 4) / (384 * EI));
    close(of(`${beam}a := N.R[1]`, 'a').si, 3 * q);
    close(of(`${beam}a := beam_M(N, 2 m)`, 'a').si, (q * 2 * 4) / 2);
    close(of(`${beam}a := beam_V(N, 2 m)`, 'a').si, q);
    close(of(`${beam}a := beam_w(N, 3 m)`, 'a').si, (5 * q * 6 ** 4) / (384 * EI));
    close(of(`${beam}a := beam_slope(N, 0 m)`, 'a').si, (q * 216) / (24 * EI));
    expect(evaluateSheet(`${beam}a := N.M_max`).statements.at(-1)!.display!.unit).toBe('kN·m');
  });

  it('a cantilever with a force at its end', () => {
    const c = 'N := beam(L: 3 m, EI: 20 MN·m^2, fixed: [0 m], at: [3 m], F: [5 kN])\n';
    close(of(`${c}a := beam_w(N, 3 m)`, 'a').si, (5e3 * 27) / (3 * EI));
    close(of(`${c}a := N.R[1]`, 'a').si, 5e3);
    close(of(`${c}a := N.M_min`, 'a').si, -15e3);
    close(Math.abs(of(`${c}a := N.R_M[1]`, 'a').si), 15e3);
  });

  it('a force off the middle', () => {
    const c = 'N := beam(L: 10 m, EI: 20 MN·m^2, pins: [0 m, 10 m], at: [3 m], F: [10 kN])\n';
    close(of(`${c}a := beam_w(N, 3 m)`, 'a').si, (10e3 * 9 * 49) / (3 * EI * 10));
    close(of(`${c}a := N.M_max`, 'a').si, (10e3 * 3 * 7) / 10);
    close(of(`${c}a := N.R[2]`, 'a').si, 3e3);
  });

  it('two equal spans: 3/8, 10/8, 3/8 of qL', () => {
    const c = 'N := beam(L: 8 m, EI: 20 MN·m^2, pins: [0 m, 4 m, 8 m], q: 10 kN/m)\n';
    close(of(`${c}a := N.R[1]`, 'a').si, (3 / 8) * q * 4);
    close(of(`${c}a := N.R[2]`, 'a').si, (10 / 8) * q * 4);
    close(of(`${c}a := N.M_min`, 'a').si, (-q * 16) / 8);
    close(of(`${c}a := beam_w(N, 4 m)`, 'a').si, 0);
  });

  it('fixed and propped ends', () => {
    const both = 'N := beam(L: 6 m, EI: 20 MN·m^2, fixed: [0 m, 6 m], q: 10 kN/m)\n';
    close(of(`${both}a := N.M_min`, 'a').si, (-q * 36) / 12);
    close(of(`${both}a := N.M_max`, 'a').si, (q * 36) / 24);
    close(of(`${both}a := N.w_max`, 'a').si, (q * 6 ** 4) / (384 * EI));
    const propped = 'N := beam(L: 6 m, EI: 20 MN·m^2, fixed: [0 m], pins: [6 m], q: 10 kN/m)\n';
    close(of(`${propped}a := N.R_at[2]`, 'a').si, 6);
    close(of(`${propped}a := N.R[2]`, 'a').si, (3 / 8) * q * 6);
    close(of(`${propped}a := N.M_min`, 'a').si, (-q * 36) / 8);
  });

  it('a hinge: fixed, hinge at 2 m, pin at 6 m, by hand', () => {
    const c = 'N := beam(L: 6 m, EI: 20 MN·m^2, fixed: [0 m], pins: [6 m], hinges: [2 m], q: 10 kN/m)\n';
    // The part right of the hinge hangs on it: 20 kN there.
    close(of(`${c}a := N.R[2]`, 'a').si, 20e3);
    close(of(`${c}a := N.R[1]`, 'a').si, 40e3);
    close(of(`${c}a := beam_M(N, 2 m)`, 'a').si, 0);
    close(of(`${c}a := N.M_min`, 'a').si, -(20e3 * 2 + (q * 4) / 2));
    // Deflection at the hinge from the cantilever: P·a³/3EI + q·a⁴/8EI.
    close(of(`${c}a := beam_w(N, 2 m)`, 'a').si, (20e3 * 8) / (3 * EI) + (q * 16) / (8 * EI));
  });

  it('an overhang, a moment at a point, a load as a function', () => {
    const over = 'N := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m, 4 m], at: [6 m], F: [10 kN])\n';
    close(of(`${over}a := N.R[2]`, 'a').si, (10e3 * 6) / 4);
    close(of(`${over}a := N.R[1]`, 'a').si, -(10e3 * 2) / 4);
    close(of(`${over}a := N.M_min`, 'a').si, -20e3);
    const moment = 'N := beam(L: 4 m, EI: 20 MN·m^2, pins: [0 m, 4 m], moments_at: [0 m], M: [8 kN·m])\n';
    close(of(`${moment}a := abs(N.R[1])`, 'a').si, 2e3);
    const load = 'p(x) := 12 kN/m·x/(6 m)\nN := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m, 6 m], q: p)\n';
    close(of(`${load}a := N.R[1]`, 'a').si, (12e3 * 6) / 6);
    close(of(`${load}a := N.R[2]`, 'a').si, (12e3 * 6) / 3);
  });

  it('says what cannot be', () => {
    expect(codes('N := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m], q: 10 kN/m)')).toContain('E-BEAM-UNSTABLE');
    expect(codes('N := beam(L: 6 m, EI: 20 MN·m^2, pins: [7 m, 0 m], q: 10 kN/m)')).toContain('E-BEAM-OUTSIDE');
    expect(codes('N := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m, 6 m], q: 10 kN)')).toContain('E-UNIT-MISMATCH');
    expect(codes('N := beam(L: 6 m, EI: 20 MN·m^2, pins: [0 m, 6 m], at: [1 m], F: [1 kN, 2 kN])')).toContain('E-VECTOR-LENGTH');
    expect(codes('N := beam(L: 6 m, EI: 20 MN·m^2, supports: [0 m])')).toContain('E-NAMED-ARG');
    expect(codes('a := beam_M(5, 1 m)')).toContain('E-TYPE');
  });

  it('draws its curves', () => {
    const r = evaluateSheet(`${beam}plot(beam_M(N, x), x: 0 m .. 6 m)`);
    expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(r.statements.at(-1)!.plot!.yUnit).toBe('kN·m');
  });

  const table = (head: string, rows: string[]) => [`    | ${head} |`, ...rows.map((row) => `    | ${row} |`)].join('\n');

  it('a cantilever column as a frame: F·H³/3EI, and the base moment', () => {
    const sheet = `table U:\n${table('x [m] | y [m] | fix_x | fix_y | fix_r | F_x [kN]', ['0 | 0 | 1 | 1 | 1 | 0', '0 | 3 | 0 | 0 | 0 | 5'])}\ntable P:\n${table('i | j | EA [MN] | EI [MN·m^2]', ['1 | 2 | 500 | 20'])}\nR := frame(nodes: U, members: P)\na := R.ux[2]\nb := R.R_x[1]\nc := abs(R.R_M[1])`;
    close(of(sheet, 'a').si, (5e3 * 27) / (3 * EI));
    close(of(sheet, 'b').si, -5e3);
    close(of(sheet, 'c').si, 15e3);
  });

  it('a beam as a frame under q, the reactions and the end moments', () => {
    const sheet = `table U:\n${table('x [m] | y [m] | fix_x | fix_y | fix_r', ['0 | 0 | 1 | 1 | 1', '6 | 0 | 0 | 1 | 1'])}\ntable P:\n${table('i | j | EA [MN] | EI [MN·m^2] | q [kN/m]', ['1 | 2 | 500 | 20 | 10'])}\nR := frame(nodes: U, members: P)\na := R.R_y[1]\nb := R.M_i[1]\nc := R.M_j[1]`;
    close(of(sheet, 'a').si, 3 * q);
    close(Math.abs(of(sheet, 'b').si), (q * 36) / 12);
    close(Math.abs(of(sheet, 'c').si), (q * 36) / 12);
  });

  it('a two-bar truss: N = F/(2·sin α), and the sag from the work of the bars', () => {
    const sheet = `table U:\n${table('x [m] | y [m] | fix_x | fix_y | F_y [kN]', ['0 | 0 | 1 | 1 | 0', '4 | 0 | 1 | 1 | 0', '2 | -1.5 | 0 | 0 | -10'])}\ntable P:\n${table('i | j | EA [MN]', ['1 | 3 | 100', '2 | 3 | 100'])}\nR := frame(nodes: U, members: P)\na := R.N[1]\nb := R.uy[3]`;
    const sin = 1.5 / 2.5;
    const n = 10e3 / (2 * sin);
    close(of(sheet, 'a').si, n);
    close(of(sheet, 'b').si, -((n * n * 2.5 * 2) / 100e6) / 10e3);
  });

  it('a rolled section against the catalogue: IPE 300', () => {
    const sheet = 'S := i_section(300 mm, 150 mm, 7.1 mm, 10.7 mm, 15 mm)\nA := S.A\nJ := S.I_y\nW := S.W_y\nP := S.W_pl\nZ := S.I_z';
    expect(of(sheet, 'A').si / 53.81e-4).toBeCloseTo(1, 2);
    expect(of(sheet, 'J').si / 8356e-8).toBeCloseTo(1, 2);
    expect(of(sheet, 'W').si / 557.1e-6).toBeCloseTo(1, 2);
    expect(of(sheet, 'P').si / 628.4e-6).toBeCloseTo(1, 2);
    expect(of(sheet, 'Z').si / 603.8e-8).toBeCloseTo(1, 2);
  });
});

/** Stage 7 of docs/navrhy/VYBER-VZORU.md. */
describe('special functions, random numbers, statistics charts', () => {
  it('integrals to infinity, with their closed forms', () => {
    const near = (sheet: string, value: number) => expect(si(`a := ${sheet}`, 'a') / value, sheet).toBeCloseTo(1, 7);
    near('integral(exp(-x), x: 0 .. ∞)', 1);
    near('integral(exp(-x^2), x: -∞ .. ∞)', Math.sqrt(Math.PI));
    near('integral(1/x^2, x: 1 .. inf)', 1);
    near('integral(exp(x), x: -inf .. 0)', 1);
    // Planck: ∫x³/(eˣ − 1) = π⁴/15.
    near('integral(x^3/(exp(x) - 1), x: 0 .. ∞)', Math.PI ** 4 / 15);
    // Maxwell: normalized to 1.
    near('integral(4/sqrt(π)·x^2·exp(-x^2), x: 0 .. ∞)', 1);
    expect(evaluateSheet('a := integral(exp(-x/(1 m)), x: 0 m .. ∞)').statements[0]!.display!.value).toBeCloseTo(1, 7);
    expect(codes('a := integral(1, x: 0 .. ∞)')).toContain('E-INTEGRAL-DIVERGES');
    expect(codes('a := integral(sin(x), x: 0 .. ∞)')).toContain('E-INTEGRAL-DIVERGES');
  });

  it('the values of SciPy', () => {
    const data = JSON.parse(readFileSync(join(import.meta.dirname, 'data', 'special.json'), 'utf8')) as { cases: [string, number][] };
    for (const [sheet, value] of data.cases) {
      const got = si(`a := ${sheet}`, 'a');
      if (value === 0) expect(Math.abs(got), sheet).toBeLessThan(1e-13);
      else if (sheet.startsWith('erfc')) expect(got / value, sheet).toBeCloseTo(1, 9);
      else expect(got / value, sheet).toBeCloseTo(1, 8);
    }
  });

  it('distributions with units', () => {
    expect(si('a := normcdf(12 mm, 10 mm, 2 mm)', 'a')).toBeCloseTo(0.841344746, 8);
    expect(si('a := norminv(0.975, 10 mm, 1 mm)', 'a')).toBeCloseTo(0.01195996, 7);
    expect(si('a := wblcdf(2 h, 2 h, 1.5)', 'a')).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(codes('a := normcdf(1 m, 1 s, 1 s)')).toContain('E-UNIT-MISMATCH');
    expect(si('a := normcdf(1.96)', 'a')).toBeCloseTo(0.975, 3);
  });

  it('Misra1a of NIST, from its harder start: the certified values', () => {
    const sheet = `y := [10.07, 14.73, 17.94, 23.93, 29.61, 35.18, 40.02, 44.82, 50.76, 55.05, 61.01, 66.40, 75.47, 81.78]
x := [77.6, 114.9, 141.1, 190.8, 239.9, 289.0, 332.8, 378.4, 434.8, 477.3, 536.8, 593.1, 689.1, 760.0]
s(p, q) := sum((y - p·(1 - exp(-q·x)))^2)
m := minimize(s(b_1, b_2), b_1: 500, b_2: 0.0001)
b := m[1]
c := m[2]`;
    expect(si(sheet, 'b') / 238.94212918).toBeCloseTo(1, 6);
    expect(si(sheet, 'c') / 5.5015643181e-4).toBeCloseTo(1, 6);
  }, 30000);

  it('more variables, a maximum, one variable from a guess, units', () => {
    const list = (sheet: string) => (evaluateSheet(sheet).values.get('m') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    const [a, b] = list('m := minimize((a - 3)^2 + (b + 1)^2, a: 0, b: 0)');
    expect(a).toBeCloseTo(3, 5);
    expect(b).toBeCloseTo(-1, 5);
    expect(si('a := maximize(-(x - 2)^2, x: 5)', 'a')).toBeCloseTo(2, 5);
    expect(si('a := minimize((x - 2 m)^2, x: 5 m)', 'a')).toBeCloseTo(2, 5);
    expect(si('a := maximize(x·(4 - x), x: 0 .. 4)', 'a')).toBeCloseTo(2, 5);
  });

  it('random numbers repeat by a seed, and are what they should be', () => {
    const list = (sheet: string) => (evaluateSheet(sheet).values.get('v') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(list('v := rnd(5, 7)')).toEqual(list('v := rnd(5, 7)'));
    expect(list('v := rnd(5, 7)')).not.toEqual(list('v := rnd(5, 8)'));
    const uniform = list('v := rnd(100000, 1)');
    expect(uniform.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(uniform.reduce((s, x) => s + x, 0) / uniform.length).toBeCloseTo(0.5, 2);
    expect(si('n := 100000\nu := rnd(n, 2)\nw := rnd(n, 3)\na := 4·sum(if(u^2 + w^2 < 1, 1, 0))/n'.replace('sum(if(u^2 + w^2 < 1, 1, 0))', 'sum((1 + sign(1 - u^2 - w^2))/2)'), 'a')).toBeCloseTo(Math.PI, 1);
    const normal = list('v := rndn(100000, 5, 10 mm, 2 mm)');
    const mean = normal.reduce((s, x) => s + x, 0) / normal.length;
    expect(mean).toBeCloseTo(0.01, 4);
    expect(Math.sqrt(normal.reduce((s, x) => s + (x - mean) ** 2, 0) / normal.length)).toBeCloseTo(0.002, 4);
    expect(evaluateSheet('v := rndn(2, 5, 10 mm, 2 mm)').statements[0]!.displayList![0]!.unit).toBe('mm');
    expect(codes('v := rnd(1.5, 1)')).toContain('E-DOMAIN');
    expect(codes('v := rnd(0, 1)')).toContain('E-DOMAIN');
  });

  it('a histogram, a box plot, error bars', () => {
    const plot = (sheet: string) => {
      const r = evaluateSheet(sheet);
      expect(r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([]);
      return r.statements.at(-1)!.plot!;
    };
    const list = (sheet: string) => (evaluateSheet(`v := ${sheet}`).values.get('v') as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(list('hist_counts([1, 2, 2, 3, 4], 3)')).toEqual([1, 2, 2]);
    expect(list('hist_centers([0, 3], 3)')).toEqual([0.5, 1.5, 2.5]);
    expect(list('box_values([1, 2, 3, 4, 5])')).toEqual([1, 2, 3, 4, 5]);
    const hist = plot('v := [1, 2, 2, 3, 4, 4, 4]\nplot(v, kind: "hist", bins: 3)');
    expect(hist.kind).toBe('bar');
    expect(hist.series[0]!.ys.reduce((s, y) => s + y, 0)).toBe(7);
    const box = plot('a := [1, 2, 3, 4, 5]\nb := [2, 4, 6, 8, 10]\nplot(a, b, kind: "box")');
    expect(box.series.map((s) => s.box)).toEqual([true, true]);
    expect(box.series[1]!.ys).toEqual([2, 4, 6, 8, 10]);
    expect(box.xRange).toEqual([0.5, 2.5]);
    const bars = plot('x := [1, 2]\ny := [3 m, 4 m]\ne := [100 mm, 200 mm]\nplot(y, x: x, kind: "points", errors: e)');
    expect(bars.series[0]!.errors).toEqual([0.1, 0.2]);
    expect(codes('x := [1, 2]\ny := [3, 4]\nplot(y, x: x, errors: [1])')).toContain('E-VECTOR-LENGTH');
  });
});

/** docs/navrhy/ZADANI-Z-KONKURENCE.md, second round, A: π in a formula made radians of a frequency. */
describe('π alone makes no radians', () => {
  const shown = (sheet: string): [number, string] => {
    const d = evaluateSheet(sheet).statements.at(-1)!.display!;
    return [d.value, d.unit ?? ''];
  };
  const close = (sheet: string, value: number, unit: string) => {
    const [v, u] = shown(sheet);
    expect(u, sheet).toBe(unit);
    expect(v / value, sheet).toBeCloseTo(1, 6);
  };
  const strut = 'L := 6 m\nE := 210 GPa\nI := 8356 cm^4\nm := 30 kg/m\n';
  const first = (Math.PI / (2 * 36)) * Math.sqrt((210e9 * 8356e-8) / 30);

  it('a natural frequency of a beam is in Hz, with or without asking', () => {
    close(`${strut}f := π/(2*L^2)*sqrt(E*I/m) | Hz`, first, 'Hz');
    close(`${strut}f := π/(2*L^2)*sqrt(E*I/m)`, first, 'Hz');
    close(`${strut}n_1 := π/(2*L^2)*sqrt(E*I/m) | Hz`, first, 'Hz');
    close(`${strut}x := π/(2*L^2)*sqrt(E*I/m)`, first, 'Hz');
  });

  it('ω holds radians whatever gave it', () => {
    close('v := 10 m/s\nr := 2 m\nω := v/r\nf := ω | Hz', 5 / (2 * Math.PI), 'Hz');
    close('v := 10 m/s\nr := 2 m\nω := v/r', 5, 'rad/s');
    close('ω := 5 1/s\nf := ω | Hz', 5 / (2 * Math.PI), 'Hz');
  });

  it('a name f is in cycles, though π stands in its formula', () => {
    close('k := 40 N/m\nm := 10 kg\nf := π*sqrt(k/m)', 2 * Math.PI, 'Hz');
    close('k := 40 N/m\nm := 10 kg\nf_1 := π*sqrt(k/m) | Hz', 2 * Math.PI, 'Hz');
    close('g := 5 Hz\nw := 2*π*g', 10 * Math.PI, 'rad/s');
  });

  it('breaks nothing of what held', () => {
    close('k := 40 N/m\nm := 10 kg\n1/(2*π)*sqrt(k/m) | Hz', 1 / Math.PI, 'Hz');
    close('L_c := 1 mH\nC_c := 1 μF\n1/(2*π*sqrt(L_c*C_c)) | Hz', 1 / (2 * Math.PI * Math.sqrt(1e-9)), 'Hz');
    close('k := 40 N/m\nm := 10 kg\nω := sqrt(k/m)\nω/(2*π) | Hz', 1 / Math.PI, 'Hz');
    close('f_0 := 50 Hz\nw_1 := 2*π*f_0\nw_1/(2*π) | Hz', 50, 'Hz');
    close('n := 3000 rpm\n2*π*n | rad/s', 100 * Math.PI, 'rad/s');
    close('n := 1450 1/min\nd := 0.3 m\nπ*d*n | m/s', (Math.PI * 0.3 * 1450) / 60, 'm/s');
    close('M := 100 N*m\nn := 3000 rpm\n2*π*M*n | kW', 10 * Math.PI, 'kW');
    close('T := 0.2 s\nω_T := 2*π/T', 10 * Math.PI, 'rad/s');
    close('T := 0.2 s\n2*π/T', 10 * Math.PI, 'rad/s');
    expect(si('n := 3000\nx := π*n/30', 'x')).toBeCloseTo(100 * Math.PI, 9);
  });
});

/** docs/navrhy/ZADANI-Z-KONKURENCE.md, second round, B, D, E. */
const COND_BY_NUMPY = 29.421080507201488;
describe('the second round', () => {
  it('B: cond is the ratio of the singular values, against NumPy', () => {
    expect(si('a := cond([2, 1, 3 | 4, 7, 6 | 8, 5, 9])', 'a')).toBeCloseTo(COND_BY_NUMPY, 8);
    expect(si('a := cond([1, 0 | 0, 1000])', 'a')).toBeCloseTo(1000, 8);
  });

  it('D: a name of the sheet in brackets is a series where it stands alone', () => {
    const items = (sheet: string, name: string) => (evaluateSheet(sheet).values.get(name) as unknown as { items: { si: number }[] }).items.map((q) => q.si);
    expect(items('A := 3 m\nv := [A]', 'v')).toEqual([3]);
    expect(items('A := 3 m\nv := [A] * 2', 'v')).toEqual([6]);
    expect(si('L := 6 m\nN := beam(L: L, EI: 20 MN·m^2, fixed: [0 m], pins: [L], q: 1 kN/m)\na := N.R_at[2]', 'a')).toBe(6);
    // A unit where it marks one, and where no such name is.
    expect(si('L := 5 m\nV := 2 [L] | m^3', 'V')).toBeCloseTo(0.002, 12);
    expect(si('A := 0.01 m^2\ns := 100 kN/[A]\nb := s | kN/A', 'b')).toBeCloseTo(100000, 6);
    expect(si('a := [m]·3', 'a')).toBe(3);
  });

  it('E: says that a guess with a unit helps', () => {
    const sheet = 'R_v := 2 Ω\nR_2 := 5 Ω\nsolve R_1: R_v == R_1*R_2/(R_1 + R_2)';
    expect(codes(sheet)).toEqual(['E-SOLVE-GUESS-UNIT']);
    expect(evaluateSheet(`${sheet}\n    guess R_1 = 1 Ω`).statements.at(-1)!.solutions![0]!.display.value).toBeCloseTo(10 / 3, 8);
    // An error of units with a guess given stays what it is.
    expect(codes('solve x: x == 2 m\n    guess x = 1 s')).toContain('E-UNIT-MISMATCH');
  });
});
