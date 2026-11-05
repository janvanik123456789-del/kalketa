/**
 * The traps of a foreign calculation: every unit of SMath, temperatures and names that mean something here. Factors from
 * the notice in core/tests/data/units-of-others.json (Quire, its table of SMath units).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { importSmath } from '../src/index.js';

const UNITS = (JSON.parse(readFileSync(join(import.meta.dirname, '../../core/tests/data/units-of-others.json'), 'utf8')) as { smathUnits: { smath: string; name: string; factor: number; offset: number; dim: number[]; tolerance: number }[] }).smathUnits;
const DIMENSIONS = ['L', 'M', 'T', 'I', 'Θ', 'N', 'J'];

const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const n = (text: string) => `<e type="operand">${escaped(text)}</e>`;
const u = (text: string) => `<e type="operand" style="unit">${escaped(text)}</e>`;
const op = (text: string, args = 2) => `<e type="operator" args="${args}">${text}</e>`;
const worksheet = (...regions: string[]) => `<?xml version="1.0"?><regions>${regions.map((body, i) => `<region id="${i}" left="9" top="${10 * (i + 1)}" width="9" height="9">${body}</region>`).join('')}</regions>`;
const math = (input: string, result?: string, contract?: string) =>
  `<math><input>${input}</input>${contract ? `<contract>${contract}</contract>` : ''}${result ? `<result action="numeric">${result}</result>` : ''}</math>`;
const unitValue = (value: string, unit: string) => `${n(value)}${u(unit)}${op('*')}`;
const define = (name: string, value: string) => math(`${n(name)}${value}${op(':')}`);

describe('every unit of SMath', () => {
  it('is in the table', () => {
    expect(UNITS.length).toBeGreaterThan(250);
  });

  it.each(UNITS.map((unit) => [unit.smath, unit] as const))('%s has the value it has there, or stays as text with the reason', (name, unit) => {
    const { source, report } = importSmath(worksheet(define('q', unitValue('1', name))));
    if (report.left.length > 0) {
      expect(report.left[0]!.why).toEqual({ kind: 'unit', name });
      expect(source).not.toContain('q :=');
      return;
    }
    const value = evaluateSheet(source).values.get('q') as { si: number; dim: Record<string, number> };
    const wanted = unit.factor + unit.offset;
    expect(Math.abs(value.si - wanted)).toBeLessThanOrEqual(Math.max(unit.tolerance, 1e-5) * Math.abs(wanted));
    unit.dim.forEach((power, i) => expect(value.dim[DIMENSIONS[i]!] ?? 0).toBe(power));
  });

  it('a unit that differs here is not asked for by its name, the number would change', () => {
    for (const unit of ['cal', 'kcal', 'yr', 'month']) {
      const { report } = importSmath(worksheet(define('q', unitValue('1', 'J')), math(n('q'), n('1'), u(unit))));
      expect(report.left.map((l) => l.why)).toEqual([{ kind: 'unit', name: unit }]);
    }
  });

  it('turns in a minute as there: 2π a turn, also in what follows from them', () => {
    const { report } = importSmath(
      worksheet(
        define('n', unitValue('3000', 'rpm')),
        define('M', `${n('100')}${u('N')}${op('*')}${u('m')}${op('*')}`),
        math(n('n'), n('3000'), u('rpm')),
        math(`${n('M')}${n('n')}${op('*')}`, n('31.416'), u('kW')),
      ),
    );
    expect(report.left).toEqual([]);
    expect(report.differ).toEqual([]);
    expect(report.agree).toBe(2);
  });
});

describe('temperatures', () => {
  const t = define('t', unitValue('20', '°C'));

  it('a temperature and its difference come out as in SMath, in kelvins', () => {
    const { report } = importSmath(
      worksheet(
        t,
        math(n('t'), `${n('293.15')}${u('K')}${op('*')}`),
        math(`${n('t')}${unitValue('10', '°C')}${op('-')}`, `${n('10')}${u('K')}${op('*')}`),
        math(`${n('t')}${unitValue('5', 'K')}${op('+')}`, `${n('298.15')}${u('K')}${op('*')}`),
      ),
    );
    expect(report.left).toEqual([]);
    expect(report.differ).toEqual([]);
    expect(report.agree).toBe(3);
  });

  it('adding two temperatures is refused here: text with the reason, no number', () => {
    const { source, report } = importSmath(worksheet(math(`${unitValue('20', '°C')}${unitValue('10', '°C')}${op('+')}`)));
    expect(report.left.map((l) => l.why)).toEqual([{ kind: 'error', code: 'E-ABS-TEMP' }]);
    expect(source.trim().startsWith('"')).toBe(true);
  });
});

describe('names that mean something here keep the value they have there', () => {
  it.each([
    ['T in kelvins', 'T', unitValue('300', 'K'), '300', 'K'],
    ['T in degrees', 'T', unitValue('20', '°C'), '293.15', 'K'],
    ['ΔT', 'ΔT', unitValue('5', 'K'), '5', 'K'],
    ['L', 'L', unitValue('2', 'm'), '2', 'm'],
    ['f', 'f', unitValue('50', 'Hz'), '50', 'Hz'],
    ['ω', 'ω', `${n('50')}${u('s')}${op('/')}`, '50', 's'],
  ])('%s', (_title, name, value, stored, unit) => {
    const result = unit === 's' ? `${n(stored)}${n('1')}${u(unit)}${op('/')}${op('*')}` : `${n(stored)}${u(unit)}${op('*')}`;
    const { report } = importSmath(worksheet(define(name, value), math(n(name), result)));
    expect(report.left).toEqual([]);
    expect(report.differ).toEqual([]);
    expect(report.agree + report.notCompared).toBe(1);
    expect(report.agree).toBe(1);
  });

  it('a difference in degrees is a temperature there: taken over with the note, the number stays', () => {
    const { source, report } = importSmath(worksheet(define('ΔT', unitValue('5', '°C')), math(n('ΔT'), `${n('278.15')}${u('K')}${op('*')}`)));
    expect(report.left.map((l) => l.why)).toEqual([{ kind: 'difference', name: 'ΔT' }]);
    expect(report.differ).toEqual([]);
    expect(report.frozen).toEqual(['ΔT']);
    expect(source).toContain('ΔT := 278.15');
    expect((evaluateSheet(source).values.get('ΔT') as { si: number }).si).toBeCloseTo(278.15, 8);
  });

  it('a difference of a temperature read by its name keeps the value it has there', () => {
    const { report } = importSmath(worksheet(define('T', unitValue('20', '°C')), define('ΔT', n('T')), math(n('ΔT'), `${n('293.15')}${u('K')}${op('*')}`)));
    expect(report.differ).toEqual([]);
    expect(report.agree).toBe(1);
  });

  it('ω in what follows from it has no 2π of its own', () => {
    const { report } = importSmath(
      worksheet(
        define('ω', `${n('50')}${u('s')}${op('/')}`),
        define('M', `${n('100')}${u('N')}${op('*')}${u('m')}${op('*')}`),
        math(`${n('M')}${n('ω')}${op('*')}`, n('5'), u('kW')),
      ),
    );
    expect(report.differ).toEqual([]);
    expect(report.agree).toBe(1);
  });
});
