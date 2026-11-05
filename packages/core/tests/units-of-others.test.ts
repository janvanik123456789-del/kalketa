import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '../src/index.js';

/**
 * Unit values from the tests of other programs (data/units-of-others.json, its notice says whose). A unit only they know
 * is no failure here; a unit both know has to agree, unless it is listed below with the reason.
 */
const data = JSON.parse(readFileSync(join(import.meta.dirname, 'data', 'units-of-others.json'), 'utf8')) as {
  conversions: { from: string; to: string; value: number }[];
  smathUnits: { smath: string; name: string; factor: number; offset: number; dim: number[]; tolerance: number }[];
};

/** Conscious differences, as in the list of deviations of CivilKit: each with its reason. */
const DIFFERENT: Readonly<Record<string, string>> = {
  '°C|Δ°C': 'a temperature in Δ°C is its distance from absolute zero, with the warning W-TEMP-ABSOLUTE-AS-DIFFERENCE',
  '°F|Δ°F': 'the same',
  'cal|J': 'the thermochemical calorie, 4.184 J; theirs is the international one, 4.1868 J',
  'kcal|J': 'the same',
  'inHg|Pa': 'more digits: 3386.388666 against their 3386.389',
  'eV|J': 'CODATA 2018, exact since 2019; theirs is older',
  'keV|J': 'the same',
  'MeV|J': 'the same',
  'GeV|J': 'the same',
  'TeV|J': 'the same',
  'PeV|J': 'the same',
  'EeV|J': 'the same',
};

const NAMES = ['L', 'M', 'T', 'I', 'Θ', 'N', 'J'];

describe('conversions in the tests of other programs', () => {
  const known = data.conversions.filter((c) => !evaluateSheet(`x := 1 ${c.from} | ${c.to}`).diagnostics.some((d) => d.severity === 'error'));

  it('cover most of them', () => {
    expect(known.length).toBeGreaterThan(data.conversions.length * 0.75);
  });

  it.each(known.filter((c) => DIFFERENT[`${c.from}|${c.to}`] === undefined).map((c) => [`${c.from} | ${c.to}`, c] as const))('%s', (_name, c) => {
    const shown = evaluateSheet(`x := 1 ${c.from} | ${c.to}`).statements[0]!.display!.value;
    expect(Math.abs(shown - c.value)).toBeLessThanOrEqual(1e-9 * Math.abs(c.value));
  });
});

describe('the units of SMath', () => {
  // month: a twelfth of our Julian year, 30.4375 d; theirs is of the tropical year.
  const both = data.smathUnits.filter((u) => defaultRegistry.resolve(u.name) && u.name !== 'month');

  it('are mostly known', () => {
    expect(both.length).toBeGreaterThan(190);
  });

  it.each(both.map((u) => [u.name, u] as const))('%s agrees', (_name, u) => {
    const own = defaultRegistry.resolve(u.name)!;
    expect(Math.abs(own.factor - u.factor)).toBeLessThanOrEqual(Math.max(u.tolerance, 1e-5) * Math.abs(u.factor));
    u.dim.forEach((e, i) => expect(own.dim[NAMES[i]!] ?? 0).toBe(e));
  });
});

describe('old units with a value of their definition', () => {
  it.each([
    ['1 kgf | N', 9.80665],
    ['1 at | Pa', 98066.5],
    ['1 slug | lb', 32.17404855643],
    ['1 mph | m/s', 0.44704],
    ['1 knot | km/h', 1.852],
    ['1 psf | Pa', 47.88025898],
    ['1 erg | J', 1e-7],
    ['1 hp_M | W', 735.49875],
    ['100 poise | Pa·s', 10],
    ['1 St | mm^2/s', 100],
    ['1 gal_UK | L', 4.54609],
    ['3000 rev/min | rad/s', 100 * Math.PI],
    ['3000 rev/min | rpm', 3000],
  ])('%s', (written, value) => {
    expect(evaluateSheet(written).statements[0]!.display!.value / value).toBeCloseTo(1, 8);
  });
});
