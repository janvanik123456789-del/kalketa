import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

const codes = (source: string) => evaluateSheet(source).diagnostics.map((d) => d.code);
const result = (source: string, line: number) => evaluateSheet(source).statements.find((r) => r.statement.span.line === line)!;

describe('derivations', () => {
  it('check every step of a derivation of theory, with symbols that are no units there (F, l)', () => {
    const r = result('derive (l^3·F/3)/(E·I) == F·l^3/(3·E·I) == F/(3·E·I)·l^3', 1);
    expect(r.diagnostics).toEqual([]);
    expect(r.derivation).toEqual([{ ok: true }, { ok: true }]);
  });

  it('find the step that does not hold, in general and not just for one number', () => {
    const r = result('derive F·l^3/(3·E·I) == F·l^3/(2·E·I)', 1);
    expect(r.derivation).toEqual([{ ok: false, problem: 'differs' }]);
    expect(r.diagnostics.map((d) => [d.code, d.params['step']])).toEqual([['E-DERIVE-STEP', 1]]);
    // x² = 2·x holds for x = 2 only: not a step.
    expect(codes('derive x^2 == 2·x')).toEqual(['E-DERIVE-STEP']);
  });

  it('write out functions of the sheet into their formulas, so the names they read vary too (cube under water)', () => {
    const sheet = 'a := 0.1 m\nh := 0.3 m\nE := 210 GPa\nρ := 1000 kg/m³\ng := 9.81 m/s²\np_v(z) := ρ·g·(h - z)\nε_xx(z) := -p_v(z)/E\n';
    const cube = result(`${sheet}ΔV := integral(integral(integral(2·ε_xx(z) - ρ·g·(h - a)/E, x: 0 m .. a), y: 0 m .. a), z: 0 m .. a) == -ρ·g·a³/E·(3·h - 2·a)`, 8);
    expect(cube.derivation).toEqual([{ ok: true }]);
    expect(cube.display!.value).toBeCloseTo(-0.0327, 6);
    // Still a wrong step when the formula of the function makes it one.
    expect(result(`${sheet}w := ε_xx(a) == -ρ·g·h/E`, 8).derivation).toEqual([{ ok: false, problem: 'differs' }]);
  });

  it('derive a function: its parameter varies in the dimension the members need, the function calculates', () => {
    const sheet = 'a := 0.1 m\nh := 0.3 m\nE := 210 GPa\nρ := 1000 kg/m³\ng := 9.81 m/s²\nε_xx(z) := -ρ·g·(h - z)/E\nε_zz := -ρ·g·(h - a)/E\n';
    const derived = result(`${sheet}dV(z) := 2·ε_xx(z) + ε_zz == -ρ·g/E·(2·(h - z) + (h - a)) == -ρ·g/E·(3·h - 2·z - a)\nq := dV(0.05 m)`, 8);
    expect(derived.derivation).toEqual([{ ok: true }, { ok: true }]);
    expect(derived.diagnostics).toEqual([]);
    expect(result(`${sheet}dV(z) := 2·ε_xx(z) + ε_zz == -ρ·g/E·(2·(h - z) + (h - a))\nq := dV(0.05 m)`, 9).display!.value).toBeCloseTo(-3.27e-8, 10);
    // z in a wrong place: the step does not hold.
    expect(result(`${sheet}w(z) := 2·ε_xx(z) + ε_zz == -ρ·g/E·(3·h - z - a)`, 8).derivation).toEqual([{ ok: false, problem: 'differs' }]);
  });

  it('end in a definition: the value from the last member, the steps checked with the values of the sheet', () => {
    const source = 'q := 12 kN/m\nL := 5 m\nM := q·L²/8\ny := M/(2 m) == q·L²/(8·2 m) == q·L^2/(16 m) | kN';
    const sheet = evaluateSheet(source);
    expect(sheet.diagnostics).toEqual([]);
    const y = sheet.statements.at(-1)!;
    expect(y.derivation).toEqual([{ ok: true }, { ok: true }]);
    expect(y.display?.value).toBeCloseTo(18.75);
    expect(y.display?.unit).toBe('kN');
  });

  it('report different units as their own error', () => {
    const r = result('L := 5 m\nt := 2 s\ny := L/t == L·t == L·t', 3);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E-DERIVE-UNITS']);
    expect(r.derivation?.[0]?.problem).toBe('units');
  });

  it('keep the value of a definition with a wrong step, so the rest of the sheet goes on', () => {
    const sheet = evaluateSheet('a := 2\nb := 3\nc := a + b == a·b == 6\nd := c + 1');
    expect(sheet.diagnostics.map((d) => d.code)).toEqual(['E-DERIVE-STEP']);
    expect(sheet.values.get('d')).toMatchObject({ si: 7 });
  });

  it('read y := a == b of values as a derivation, of texts and flags as a comparison', () => {
    const sheet = evaluateSheet('x := 2\ny := x + x == 2·x\nt := "S235"\nok := t == "S235"\nu := "S355"\nsame := t == u\nboth := x == 2 and t == "S235"');
    expect(sheet.diagnostics).toEqual([]);
    expect(sheet.values.get('y')).toMatchObject({ si: 4 });
    expect(sheet.statements[1]!.derivation).toEqual([{ ok: true }]);
    expect(sheet.values.get('ok')).toEqual({ type: 'boolean', value: true });
    expect(sheet.values.get('same')).toEqual({ type: 'boolean', value: false });
    expect(sheet.values.get('both')).toEqual({ type: 'boolean', value: true });
  });

  it('introduce a symbol of theory with derive name := formula, used by the derivations below it', () => {
    const sheet = evaluateSheet('derive M_mp := l^3·F/3\nderive w := M_mp/(E·I) == F·l^3/(3·E·I)\nderive M_mp/(E·I) == F·l^3/(2·E·I)');
    expect(sheet.statements.map((r) => r.status)).toEqual(['none', 'none', 'ok']);
    expect(sheet.statements[1]!.derivation).toEqual([{ ok: true }]);
    expect(sheet.diagnostics.map((d) => d.code)).toEqual(['E-DERIVE-STEP']);
  });

  it('check numbers put in with the values of the sheet', () => {
    expect(evaluateSheet('q := 12 kN/m\nL := 5 m\nM := q·L²/8 == 12 kN/m·(5 m)²/8 == 37.5 kN·m').diagnostics).toEqual([]);
    expect(evaluateSheet('q := 12 kN/m\nL := 5 m\nM := q·L²/8 == 40 kN·m').diagnostics.map((d) => d.code)).toEqual(['E-DERIVE-STEP']);
    // A name derived down to numbers stands for its formula in the derivations below it.
    expect(evaluateSheet('q := 12 kN/m\nL := 5 m\nM := q·L²/8 == 37.5 kN·m\nW := 194.3 cm^3\nσ := M/W == q·L²/(8·W) | MPa').diagnostics).toEqual([]);
  });

  it('take Σ and ∫ without bounds as notations: equal in a derivation, no value in a calculation', () => {
    expect(result('derive E·integral(y^2, dS) == integral(y^2, dS)·E', 1).derivation).toEqual([{ ok: true }]);
    expect(result('derive sum(F_i·a_i, i) + 0 == sum(F_i·a_i, i)', 1).derivation).toEqual([{ ok: true }]);
    // Linear, as in theory: the order inside, a factor outside, but not a product of two integrals.
    expect(result('derive sum(F_i·a_i, i) == sum(a_i·F_i, i)', 1).derivation).toEqual([{ ok: true }]);
    expect(result('derive integral(E·y^2, dS) == E·integral(y^2, dS)', 1).derivation).toEqual([{ ok: true }]);
    expect(result('derive sum(ΔS·y^2)·E == E·sum(y^2·ΔS)', 1).derivation).toEqual([{ ok: true }]);
    expect(result('derive integral(f·g, dS) == integral(f, dS)·integral(g, dS)', 1).derivation).toEqual([{ ok: false, problem: 'differs' }]);
    expect(codes('I := integral(y^2, dS)')).toEqual(['E-NO-BOUNDS']);
    // With bounds, as before.
    expect(evaluateSheet('h := 2 m\nI := integral(y^2, y: 0 m .. h)').values.get('I')).toMatchObject({ si: expect.closeTo(8 / 3, 9) });
  });
});

describe('a step equal when rounded (≐)', () => {
  it('holds as far as a rounded result is from the exact one, and no further', () => {
    const r = (source: string) => evaluateSheet(source).statements.at(-1)!;
    const sheet = 'S := 23.53 mm²\n';
    const d = r(`${sheet}d := sqrt(4·S/π) ≐ 5.5 mm`);
    expect(d.derivation).toEqual([{ ok: true }]);
    expect(d.display).toMatchObject({ value: 5.5, unit: 'mm' });
    // Two digits off is no rounding.
    expect(r(`${sheet}d := sqrt(4·S/π) ≐ 5.8 mm`).derivation).toEqual([{ ok: false, problem: 'differs' }]);
    // An equal sign is still exact; ≈ is the same as ≐.
    expect(r(`${sheet}d := sqrt(4·S/π) == 5.5 mm`).derivation).toEqual([{ ok: false, problem: 'differs' }]);
    expect(r(`${sheet}d := sqrt(4·S/π) ≈ 5.5 mm`).derivation).toEqual([{ ok: true }]);
    expect(r('derive a := b·(c + d) == b·c + b·d ≐ b·c + b·d').derivation).toEqual([{ ok: true }, { ok: true }]);
  });

  it('holds for small values of the symbols of theory, as a small angle (γ ≐ tg γ)', () => {
    const r = (source: string) => evaluateSheet(source).statements.at(-1)!;
    expect(r('derive γ ≐ tan(γ) == tan(γ)').derivation).toEqual([{ ok: true }, { ok: true }]);
    expect(r('derive sin(γ) ≐ γ').derivation).toEqual([{ ok: true }]);
    expect(r('derive γ ≐ 2·γ').derivation).toEqual([{ ok: false, problem: 'differs' }]);
    // A small angle from geometry: Δl small against l.
    expect(r('derive γ := atan(Δl/l)\nderive γ ≐ tg(γ) == Δl/l').derivation).toEqual([{ ok: true }, { ok: true }]);
    // Exact steps are not taken small.
    expect(r('derive γ == tan(γ)').derivation).toEqual([{ ok: false, problem: 'differs' }]);
  });
});

describe('the source of a definition', () => {
  it('is read after its unit and kept with it', () => {
    const r = evaluateSheet('G_k := 10 kN·m\nQ_k := 5 kN·m\nM_Ed := 1.35·G_k + 1.5·Q_k | kN·m  source "EN 1990, 6.10"');
    expect(r.diagnostics).toEqual([]);
    expect(r.statements.at(-1)!.statement).toMatchObject({ kind: 'definition', source: 'EN 1990, 6.10' });
    expect(r.statements.at(-1)!.display).toMatchObject({ value: 21, unit: 'kN·m' });
  });

  it('give a parameter the dimension of a number written with a unit beside it (the bound 0 s makes t a time)', () => {
    const sheet = 'q := 4 m/s^2\nk := 3.6 m/s^3\na(t) := q - k·t\nv(t) := integral(a(τ), τ: 0 s .. t) == q·t - k/2·t^2';
    expect(result(sheet, 4).derivation).toEqual([{ ok: true }]);
    expect(codes(sheet)).toEqual([]);
  });
});
