import { describe, expect, it } from 'vitest';
import { evaluateSheet, type Quantity } from '@kalketa/core';
import { unitChoices } from '../src/logic/unitChoices.js';

const value = (line: string) => evaluateSheet(`v := ${line}`).values.get('v') as Quantity;

describe('units a result can be shown in', () => {
  it('offers the units of the same dimension, each with the value in it', () => {
    const moment = unitChoices(value('54 kN·m'));
    expect(moment.map((c) => c.unit)).toEqual(['N·m', 'kN·m', 'N·mm']);
    expect(moment.find((c) => c.unit === 'N·mm')!.value).toBeCloseTo(54e6, 3);
    expect(unitChoices(value('166.7 MPa')).map((c) => c.unit)).toEqual(['Pa', 'kPa', 'MPa', 'GPa']);
    expect(unitChoices(value('18 mm')).map((c) => c.unit)).toEqual(['mm', 'cm', 'm', 'km']);
    // Energy keeps to energy, a moment to moments, though they share a dimension.
    expect(unitChoices(value('3.5 kWh')).map((c) => c.unit)).toEqual(['J', 'kJ', 'MJ', 'Wh', 'kWh']);
  });

  it('offers a plain number only percent and angles', () => {
    expect(unitChoices(value('0.75')).map((c) => c.unit)).toEqual(['rad', '°', '%']);
  });
});
