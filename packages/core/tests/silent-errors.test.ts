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
