/**
 * Page view of the editor: the sheet laid out on the same pages as the
 * printout, so several pages can sit side by side on a wide screen.
 */

export interface PageGeometry {
  readonly width: number;
  readonly height: number;
  /** Margins in mm, as in the print stylesheet (@page). */
  readonly margin: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}

const PAPER_MM: Readonly<Record<'A4' | 'A3' | 'Letter', readonly [number, number]>> = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
};

/** Must match @page in packages/render/src/html.ts. */
const MARGIN = { top: 18, right: 16, bottom: 18, left: 20 } as const;

export function pageGeometry(paper: 'A4' | 'A3' | 'Letter', orientation: 'portrait' | 'landscape'): PageGeometry {
  const [w, h] = PAPER_MM[paper];
  return orientation === 'portrait' ? { width: w, height: h, margin: MARGIN } : { width: h, height: w, margin: MARGIN };
}

/**
 * Splits items of the given heights into pages of `pageHeight`. An item never
 * starts a page it does not fit on unless it is taller than a whole page.
 * `breakAfter[i]` forces a new page after item i (@page).
 * Returns the index of the first item of each page.
 */
export function paginate(heights: readonly number[], pageHeight: number, breakAfter: readonly boolean[] = []): number[] {
  const starts = [0];
  let used = 0;
  heights.forEach((h, i) => {
    if (used > 0 && used + h > pageHeight) {
      starts.push(i);
      used = 0;
    }
    used += h;
    if (breakAfter[i] && i < heights.length - 1) {
      starts.push(i + 1);
      used = 0;
    }
  });
  return starts;
}
