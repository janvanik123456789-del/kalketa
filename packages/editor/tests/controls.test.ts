import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTROLS, readControls } from '../src/logic/controls.js';

describe('the controls of the program (Settings > Controls)', () => {
  it('are on unless switched off, each kept on its own', () => {
    expect(readControls(null)).toEqual(DEFAULT_CONTROLS);
    expect(readControls('nonsense')).toEqual(DEFAULT_CONTROLS);
    expect(readControls('{"insertMenu":false,"startScreen":"no"}')).toEqual({ ...DEFAULT_CONTROLS, insertMenu: false });
  });
});
