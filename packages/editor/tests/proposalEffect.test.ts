import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { applyProposal } from '@kalketa/ai';
import { proposalEffect } from '../src/logic/proposalEffect.js';

const sheet = ['L := 5 m', 'w := L / 200', 'w_lim := L / 250', 'check "Průhyb": w ≤ w_lim', 'check "Délka": L ≤ 10 m'].join('\n');

describe('what a proposed change does', () => {
  it('compares the checks it changes, leaving out those it does not', () => {
    const changed = applyProposal(sheet, { from: 2, to: 2, lines: ['w := L / 300'] });
    const effect = proposalEffect(evaluateSheet(sheet), evaluateSheet(changed));
    expect(effect.errors).toEqual({ before: 0, after: 0 });
    expect(effect.checks).toEqual([{ label: 'Průhyb', before: { passed: false, utilization: 1.25 }, after: { passed: true, utilization: expect.closeTo(250 / 300, 9) } }]);
  });

  it('counts errors a change brings', () => {
    const broken = applyProposal(sheet, { from: 2, to: 2, lines: ['w := x / 300'] });
    expect(proposalEffect(evaluateSheet(sheet), evaluateSheet(broken)).errors.after).toBeGreaterThan(0);
  });
});
