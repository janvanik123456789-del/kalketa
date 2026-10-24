/**
 * Matters of taste in how the program is used (Settings > Controls): kept for the user in the program,
 * never in a calculation. Each is on unless switched off.
 */

export interface Controls {
  /** The start screen at a start of the program with no files to open again. */
  readonly startScreen: boolean;
  /** The floating toolbar above the line being edited (precision, unit, number, source). */
  readonly rowToolbar: boolean;
  /** The menu of "/" at the start of an empty line. */
  readonly insertMenu: boolean;
  /** "=" typed after a new name becomes ":=". */
  readonly autoDefine: boolean;
}

export const CONTROLS_KEY = 'kalketa.controls';

export const DEFAULT_CONTROLS: Controls = { startScreen: true, rowToolbar: true, insertMenu: true, autoDefine: true };

/** The controls as stored (JSON), each missing or unreadable one at its default. */
export function readControls(stored: string | null | undefined): Controls {
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(stored ?? '{}') as unknown;
    if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
  } catch {
    // Unreadable: the defaults.
  }
  const flag = (key: keyof Controls) => (typeof parsed[key] === 'boolean' ? (parsed[key] as boolean) : DEFAULT_CONTROLS[key]);
  return { startScreen: flag('startScreen'), rowToolbar: flag('rowToolbar'), insertMenu: flag('insertMenu'), autoDefine: flag('autoDefine') };
}
