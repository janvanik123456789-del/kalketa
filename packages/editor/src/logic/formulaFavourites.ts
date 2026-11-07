/**
 * Favourite formulas of the library (docs/navrhy/KNIHOVNA-VZORCU.md): starred in Insert → Formula…, offered by the
 * right button on a line and by "/". Kept for the user in the program, never in a calculation; few, so the menu
 * stays quick.
 */

export const FAVOURITES_KEY = 'kalketa.formulaFavourites';

/** More would make the menu of the right button slow to read. */
export const MAX_FAVOURITES = 15;

/** The ids as stored (JSON), the unreadable ones left out, at most MAX_FAVOURITES. */
export function readFavourites(stored: string | null | undefined): string[] {
  try {
    const value = JSON.parse(stored ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v): v is string => typeof v === 'string' && /^[a-z0-9-]+$/.test(v)))].slice(0, MAX_FAVOURITES);
  } catch {
    return [];
  }
}

/** The favourites with the id added or taken away; a new one beyond the limit is not added. */
export function toggleFavourite(favourites: readonly string[], id: string): string[] {
  if (favourites.includes(id)) return favourites.filter((f) => f !== id);
  return favourites.length >= MAX_FAVOURITES ? [...favourites] : [...favourites, id];
}
