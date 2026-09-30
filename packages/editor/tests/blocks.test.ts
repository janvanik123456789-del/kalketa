import { describe, expect, it } from 'vitest';
import { blockCall } from '../src/logic/blocks.js';

describe('inserting a block', () => {
  it('writes the call with the block inputs and their own values', () => {
    const source = '# Prostý nosník\n@version 1.0\ninput L := 5 m    \' rozpětí\ninput q := 12 kN/m\nM_max := q·L²/8';
    expect(blockCall('Prosty_nosnik', source)).toBe('Prosty_nosnik(L: 5 m, q: 12 kN/m)');
    expect(blockCall('B', 'a := 1')).toBe('B()');
  });
});
