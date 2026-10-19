import { describe, expect, it } from 'vitest';
import { loneNumbers, numbersIn, proseOf, pythonLines, sheetNeedsAnswer, sheetReport, type SheetCheck } from '../src/index.js';

// The values of the tank sample (R15) in SI: S_1, S_2, v_A, v_x, t_v, v_hlad.
const VALUES = [2.5446900494, 0.00063, 13.28834, 7.672027, 3158.8969, 0.0018994];
const ASSIGNMENT = 'r := 0.9 m\nh_1 := 3 m\nh_2 := 6 m\nS_2 := 6.3 cm^2\ng := 9.81 m/s^2';

describe('the check of the sheet an answer proposes', () => {
  it('reads the numbers of a text, not the digits of names', () => {
    expect(numbersIn('h_1 = 3 m, T8, ~200× a 3 159,5 s nebo 52,7 min; 0.01·v_A').map((n) => n.value)).toEqual([3, 200, 3159.5, 52.7, 0.01]);
    expect(proseOf('check "Hladina stojí": v ≤ 0.01·v_A')).toEqual(['Hladina stojí']);
    expect(proseOf('"Text řádku." [T3]')).toEqual(['Text řádku.']);
  });

  it('finds a number in text that the sheet does not compute', () => {
    const prose = ['Rychlost hladiny je zanedbatelná (nádrž je ~200× širší než otvor).', 'Nádrž se vyprázdní asi za 52,7 min, proud dopadá rychlostí 13,3 m/s.', 'Otvor má 6,3 cm², nádrž poloměr 0,9 m; μ je 0,6 až 0,62.'];
    const lone = loneNumbers(prose, VALUES, [ASSIGNMENT, 'Pro ostrou hranu je μ přibližně 0,6 až 0,62.']);
    expect(lone.map((n) => n.number)).toEqual(['200']);
    // A value shown in another unit is the value: 3 159 s is 52,6 min, 0,0019 m/s is 1,9 mm/s.
    expect(loneNumbers(['za 3 159 s, hladina klesá 1,9 mm/s'], VALUES, [])).toEqual([]);
  });

  it('goes back to the model as a report it answers', () => {
    const check: SheetCheck = { problems: [{ line: 't_v := S_1/S_2·sqrt(2·h_1/g) | min', message: '„t_v“ už je definováno výše.' }], numbers: [{ number: '200', line: '"nádrž je ~200× širší"' }] };
    expect(sheetNeedsAnswer(check)).toBe(true);
    expect(sheetNeedsAnswer({ problems: [], numbers: [] })).toBe(false);
    expect(sheetNeedsAnswer(undefined)).toBe(false);
    const text = sheetReport(check, { title: 'Kontrola listu', problems: 'List hlásí:', numbers: 'Čísla bez výpočtu:', ask: 'Oprav to.', python: 'Python patří do bloku python:', failed: 'Nevyhovuje:', hints: { 'E-DERIVE-STEP': 'Výchozí rovnice je relation.' } });
    expect(text).toContain('- `t_v := S_1/S_2·sqrt(2·h_1/g) | min` – „t\\_v“ už je definováno výše.');
    expect(text).toContain('- 200: „"nádrž je ~200× širší"“');
    expect(text.endsWith('Oprav to.')).toBe(true);
  });

  it('finds Python written into the sheet, and advises by the kind of a problem', () => {
    const lines = ['## Ověření', '# free fall from H', 'g_fall := 9.81', 'while y_fall < H_fall:', '    v_fall := v_fall + g_fall * dt', 'v += g*dt', 'S := 3.14 * r**2', 'g_val, H_val = 9.81, 9.0', 'result("v_A_sim", v, "m/s", rel=1e-3)', 'import math', 'y := if(a > b, 1, 2)', 'h(t) := (sqrt(h_1) - k·t)^2'];
    expect(pythonLines(lines)).toEqual(['while y_fall < H_fall:', 'v += g*dt', 'S := 3.14 * r**2', 'g_val, H_val = 9.81, 9.0', 'result("v_A_sim", v, "m/s", rel=1e-3)', 'import math']);
    const check: SheetCheck = { problems: [{ line: 'derive p_a + ρ·g·H == p_a + ρ·v_A^2/2', message: 'krok 1 neplatí', code: 'E-DERIVE-STEP' }], numbers: [], python: ['while y < H:'] };
    expect(sheetNeedsAnswer({ problems: [], numbers: [], python: ['import math'] })).toBe(true);
    const text = sheetReport(check, { title: 'Kontrola', problems: 'List hlásí:', numbers: 'Čísla:', ask: 'Oprav.', python: 'Python patří do bloku python:', failed: 'Nevyhovuje:', hints: { 'E-DERIVE-STEP': 'Výchozí rovnice je relation.' } });
    expect(text.indexOf('Python patří')).toBeLessThan(text.indexOf('List hlásí'));
    expect(text).toContain('- `while y < H:`');
    expect(text).toContain('Výchozí rovnice je relation.');
  });

  it('names the checks that pass no more', () => {
    const check: SheetCheck = { problems: [], numbers: [], failed: [{ label: 'Počátek grafu', line: 'check "Počátek grafu": abs(vA_t(0 s) − v_A) ≤ 1e-9 m/s' }] };
    expect(sheetNeedsAnswer(check)).toBe(true);
    const text = sheetReport(check, { title: 'Kontrola', problems: 'List hlásí:', numbers: 'Čísla:', ask: 'Oprav.', python: 'Python:', failed: 'Nevyhovuje:', hints: {} });
    expect(text).toContain('Nevyhovuje:\n\n- Počátek grafu: `check "Počátek grafu": abs(vA_t(0 s) − v_A) ≤ 1e-9 m/s`');
  });
});
