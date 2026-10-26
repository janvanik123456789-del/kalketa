/**
 * Shortcuts with the names of MATLAB and NumPy: polyfit, polyval, interp1, spline, pchip.
 * Expected values from NumPy 2 and SciPy (CubicSpline, PchipInterpolator, np.interp, np.polyfit).
 */
import { describe, expect, it } from 'vitest';
import { evaluateSheet, type Value } from '../src/index.js';

const POINTS = 'x := [0, 1, 2.5, 3, 4.5, 6]\ny := [1, 2.5, 2.2, 3.8, 3.1, 5]\n';
const XI = '[0.5, 1.7, 2.8, 4, 5.9]';

function numbers(value: Value | undefined): number[] {
  if (value?.type === 'vector') return value.items.map((q) => q.si);
  return value?.type === 'quantity' ? [value.si] : [];
}
function last(sheet: string): { value: number[]; codes: string[] } {
  const result = evaluateSheet(sheet);
  return { value: numbers(result.statements.at(-1)?.value), codes: result.diagnostics.map((d) => d.code) };
}
function close(got: number[], want: number[]): void {
  expect(got).toHaveLength(want.length);
  got.forEach((g, i) => expect(g).toBeCloseTo(want[i]!, 10));
}

describe('interpolation through every point', () => {
  it('draws straight lines between the points (interp1, np.interp)', () => {
    close(last(`${POINTS}r := interp1(x, y, ${XI})`).value, [1.75, 2.36, 3.16, 3.3333333333333335, 4.873333333333334]);
  });

  it('a cubic spline not-a-knot at the ends, as MATLAB spline and SciPy CubicSpline', () => {
    const want = [2.4326944444444445, 1.7646297777777782, 3.172815999999999, 3.927141975308641, 4.434069246913582];
    close(last(`${POINTS}r := spline(x, y, ${XI})`).value, want);
    close(last(`${POINTS}r := interp1(x, y, ${XI}, "spline")`).value, want);
    // Beyond the points the end cubics go on.
    close(last(`${POINTS}r := spline(x, y, [-0.5, 6.5])`).value, [-2.5671250000000008, 9.300552469135804]);
    // Three points: the parabola through them; four points of a cubic: the cubic itself.
    close(last('r := spline([1, 2, 4], [1, 4, 2], [1.5, 3])').value, [2.8333333333333335, 4.333333333333333]);
    close(last('r := spline([0, 1, 2, 3], [0, 1, 8, 27], 1.5)').value, [3.375]);
  });

  it('pchip keeps the shape, as SciPy PchipInterpolator', () => {
    close(last(`${POINTS}r := pchip(x, y, [${XI.slice(1, -1)}, -0.5, 6.5])`).value, [2.0225, 2.364977777777778, 3.2367999999999997, 3.281481481481481, 4.789955555555556, 0.04749999999999982, 6.122222222222223]);
  });

  it('keeps the units, sorts x, and stops beyond the points unless asked to go on', () => {
    const units = evaluateSheet('t := [0 s, 10 s, 20 s]\nT := [20 °C, 30 °C, 35 °C]\nT_5 := interp1(t, T, 5 s)');
    expect(units.diagnostics).toEqual([]);
    expect(units.statements.at(-1)!.display).toMatchObject({ value: 25, unit: '°C' });
    close(last('r := interp1([2, 0, 1], [4, 0, 1], 1.5)').value, [2.5]);
    expect(last(`${POINTS}r := interp1(x, y, 7)`).codes).toEqual(['E-INTERP-RANGE']);
    close(last(`${POINTS}r := interp1(x, y, 7, "linear", "extrap")`).value, [5 + (1.9 / 1.5) * 1]);
    expect(last(`${POINTS}r := interp1(x, y, 1, "cubic")`).codes).toEqual(['E-INTERP-METHOD']);
    expect(last('r := interp1([1, 1, 2], [1, 2, 3], 1.5)').codes).toEqual(['E-INTERP-X']);
    expect(last('r := interp1([1 m, 2 m], [1, 2], 1.5 s)').codes).toEqual(['E-UNIT-MISMATCH']);
  });
});

describe('polyfit and polyval', () => {
  const MEASURED = 'X := [1, 2, 3, 4, 5]\nY := [2.1, 3.9, 4.2, 6.2, 9.1]\n';

  it('fit a polynomial of any degree, as np.polyfit, and give a function of the sheet', () => {
    // Degree 3, read back at the points of np.polyfit's coefficients (highest first).
    const p3 = [0.19999999999999896, -1.5214285714285611, 4.678571428571395, -1.1999999999999595];
    const at = (c: number[], x: number) => c.reduce((s, ck) => s * x + ck, 0);
    close(last(`${MEASURED}P := polyfit(X, Y, 3)\nr := P(2.5)`).value, [at(p3, 2.5)]);
    // Five points, degree 4: the polynomial through them all (np.polyval at 2.5).
    close(last(`${MEASURED}P := polyfit(X, Y, 4)\nr := polyval(P, 2.5)`).value, [3.943750000000035]);
    close(last(`${MEASURED}P := polyfit(X, Y, 4)\nr := P(X)`).value, [2.1, 3.9, 4.2, 6.2, 9.1]);
    expect(last(`${MEASURED}P := polyfit(X, Y, 5)`).codes).toEqual(['E-FIT-POINTS']);
    expect(last(`${MEASURED}P := polyfit(X, Y, 1.5)`).codes).toEqual(['E-POLYFIT-DEGREE']);
    // fit itself takes the higher degrees by name too.
    const higher = last(`table B:
    | x | y |
    | 1 | 2.1 |
    | 2 | 3.9 |
    | 3 | 4.2 |
    | 4 | 6.2 |
    | 5 | 9.1 |
    | 6 | 14 |
P := fit(B.y, x: B.x, kind: "poly4")
r := P(2.5)`);
    expect(higher.codes).toEqual([]);
    expect(higher.value).toHaveLength(1);
  });

  it('give the coefficients by index from the highest power, as MATLAB', () => {
    const p3 = [0.19999999999999896, -1.5214285714285611, 4.678571428571395, -1.1999999999999595];
    close(last(`${MEASURED}P := polyfit(X, Y, 3)\nr := [P[1], P[2], P[3], P[4]]`).value, p3);
    expect(last(`${MEASURED}P := polyfit(X, Y, 1)\nr := P[3]`).codes).toEqual(['E-INDEX']);
    // A slope of kelvin per kelvin is a plain number.
    const slope = evaluateSheet('x := [1, 2, 3] K\ny := [2, 4, 6.1] K\nP := polyfit(x, y, 1)\nk := P[1]').statements.at(-1)!;
    expect(slope.display?.unit).toBe('');
  });

  it('polyval takes coefficients from the highest power, as MATLAB', () => {
    close(last('r := polyval([1, 0, -2], 3)').value, [7]);
    close(last('r := polyval([2, 1], [0, 1, 2])').value, [1, 3, 5]);
  });
});

const NTC = `table NTC:
    | T [°C] | R [kΩ] |
    | 0 | 33.62 |
    | 10 | 20.17 |
    | 20 | 12.54 |
    | 30 | 8.037 |
    | 40 | 5.301 |
`;

describe('a fit over an absolute temperature', () => {
  it('is fitted on the reading in °C: the coefficients as np.polyfit gives them over 0 … 40, no warning', () => {
    const result = evaluateSheet(`${NTC}P := polyfit(NTC.T, NTC.R, 2)
R_37 := P(37 °C)`);
    expect(result.diagnostics.map((d) => d.code)).toEqual([]);
    const fitted = result.statements.at(-2)!.value;
    const c = fitted?.type === 'function' ? (fitted.fit?.coefficients ?? []).map((k) => k.value) : [];
    // np.polyfit([0, 10, 20, 30, 40], R, 2) = [0.0175392857, -1.38928143, 33.1956571] (kΩ per °C^k)
    close(c.map((q) => q.si / 1000), [33.19565714285714, -1.3892814285714285, 0.017539285714285707]);
    expect(c.map((q) => q.hint?.symbol)).toEqual(['kΩ', 'kΩ/°C', 'kΩ/°C²']);
    close(numbers(result.statements.at(-1)!.value), [5803.5264285714305]);
  });

  it('takes the same temperature in kelvin, and a series of them', () => {
    close(last(`${NTC}P := polyfit(NTC.T, NTC.R, 2)
R_K := P(310.15 K)`).value, [5803.5264285714305]);
    const series = last(`${NTC}P := polyfit(NTC.T, NTC.R, 1)
r := P(NTC.T)`);
    expect(series.codes).toEqual([]);
    expect(series.value).toHaveLength(5);
  });

  it('fits an exponential on the reading too; a logarithm of °C asks for kelvin', () => {
    // np.polyfit(T, ln R, 1): b = -0.0461459, a = e^3.48296 = 32.5558 kΩ
    const e = last(`${NTC}E := fit(NTC.R, x: NTC.T, kind: "exp")
R_e := E(37 °C)`);
    expect(e.codes).toEqual([]);
    close(e.value, [5903.5736756439565]);
    expect(last(`${NTC}L := fit(NTC.R, x: NTC.T, kind: "log")`).codes).toEqual(['E-FIT-ABS-X']);
    expect(last(`${NTC}L := fit(NTC.R, x: NTC.T, kind: "power")`).codes).toEqual(['E-FIT-ABS-X']);
    // In kelvin the logarithm is that of the thermodynamic temperature.
    expect(last(`${NTC}T_K := NTC.T | K
L := fit(NTC.R, x: T_K, kind: "log")`).codes).toEqual([]);
  });
});

describe('an absolute temperature put into kelvin', () => {
  it('is the thermodynamic temperature: 1/T_K gives no warning, unlike 1/T in °C', () => {
    expect(last('T := 37 °C\nx := 1/T').codes).toEqual(['W-ABS-TEMP-MUL']);
    const kelvin = last('T := 37 °C\nT_K := T | K\nx := 1/T_K');
    expect(kelvin.codes).toEqual([]);
    close(kelvin.value, [1 / 310.15]);
  });
});
