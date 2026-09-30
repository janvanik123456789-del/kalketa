import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession } from '../src/index.js';
import { codes, expectValue } from './helpers.js';

const MENA = 'dimension Mena\nunit CZK: Mena\n';

describe("a sheet's own dimensions and units", () => {
  it('convert between the units of a dimension', () => {
    expectValue(`${MENA}unit EUR := 25 CZK\ncena := 100 EUR\ncena | CZK`, 2500, 'CZK');
    expectValue(`${MENA}unit EUR := 25 CZK\n300 CZK + 2 EUR`, 350, 'CZK');
  });

  it('keep dimensions apart: money is not people and not metres', () => {
    expect(codes(`${MENA}x := 5 CZK + 2 m`)).toEqual(['E-UNIT-MISMATCH']);
    expect(codes(`${MENA}dimension Osoby\nunit os: Osoby\nx := 5 CZK + 2 os`)).toEqual(['E-UNIT-MISMATCH']);
  });

  it('name computed results by their own base units', () => {
    expectValue(`${MENA}dimension Osoby\nunit os: Osoby\nc := 1000 CZK\nn := 4 os\nc/n`, 250, 'CZK/os');
  });

  it('count pieces without a dimension', () => {
    expectValue('unit ks: dimensionless\nn := 12 ks\nn =', 12, 'ks');
    expectValue('unit ks: 1\nn := 12 ks\nn·2', 24, 'ks');
  });

  it('give short names to units', () => {
    expectValue('unit kNm := kN·m\nM := 5 kNm\nM | N·m', 5000, 'N·m');
    expectValue('unit kNm := kN·m\n2 kN · 3 m | kNm', 6, 'kNm');
  });

  it('may take a value from above', () => {
    expectValue(`${MENA}kurz := 24.5\nunit EUR := kurz·CZK\n10 EUR | CZK`, 245, 'CZK');
  });

  it('keep a unit of their own that starts with u', () => {
    expectValue(`${MENA}unit usd := 23 CZK\nx := 5 usd\nx =`, 5, 'usd');
  });

  it('report mistakes', () => {
    expect(codes('unit CZK: Mena')).toEqual(['E-UNDEFINED']);
    expect(codes('unit m: 1')).toEqual(['E-REDEFINED']);
    expect(codes('dimension L')).toEqual(['E-REDEFINED']);
    expect(codes('dimension Mena\ndimension Mena')).toEqual(['E-REDEFINED']);
    expect(codes(`${MENA}unit CZK: Mena`)).toEqual(['E-REDEFINED']);
    expect(codes('x := 5 CZK\ndimension Mena\nunit CZK: Mena')).toEqual(['E-UNKNOWN-UNIT']);
    expect(codes('unit X := "text"')).toEqual(['E-TYPE']);
  });

  it('recalculate everything when a unit changes', () => {
    const session = new SheetSession();
    const sheet = (rate: string) => `${MENA}unit EUR := ${rate} CZK\ncena := 100 EUR | CZK`;
    session.update(sheet('25'));
    const r = session.update(sheet('24'));
    expect((r.values.get('cena') as { si: number }).si).toBe(2400);
    expect(session.update(sheet('24')).stats.evaluated).toBe(0);
  });

  it('do not leak into other sheets', () => {
    evaluateSheet(`${MENA}x := 1 CZK`);
    expect(codes('x := 1 CZK')).toEqual(['E-UNKNOWN-UNIT']);
  });
});
