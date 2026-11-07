/**
 * @kalketa/library — the formula library (docs/navrhy/KNIHOVNA-VZORCU.md).
 *
 * Entries are data (packages/library/formulas/<field>/<id>.json); this package reads them, rearranges a formula
 * for the quantity sought through the core and writes the lines that put it into a sheet. No UI, no files.
 */

export * from './entry.js';
export * from './insert.js';
export * from './search.js';
