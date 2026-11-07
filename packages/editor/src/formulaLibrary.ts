/** The built-in formula library: packages/library/formulas/<field>/<id>.json, read once with the editor. */

import { readEntries, type Entry } from '@kalketa/library';

const FILES = import.meta.glob<string>('../../library/formulas/*/*.json', { query: '?raw', import: 'default', eager: true });

export const FORMULA_LIBRARY: readonly Entry[] = readEntries(FILES).entries;
