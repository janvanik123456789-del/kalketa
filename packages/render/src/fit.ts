/**
 * Equations wider than the page (the steps of a solved quadratic with all its units put in) are
 * made smaller to fit its width, as one would write them smaller on paper, but no smaller than
 * half: what still does not fit then overflows rather than turning unreadable. Run in the page
 * view and in the printout before the blocks are measured for pages; plain DOM, no imports, so
 * the printout can take its source as it is.
 */
export function fitWideEquations(root: ParentNode): void {
  const wide = [...root.querySelectorAll<HTMLElement>('.block table.eq, .block .eq-flow')];
  // Written all first, then read, then written again: one layout, not one per equation.
  for (const el of wide) el.style.removeProperty('zoom');
  const scales = wide.map((el) => {
    const room = el.parentElement ? el.parentElement.clientWidth : 0;
    const width = Math.max(el.scrollWidth, el.offsetWidth);
    return room > 0 && width > room + 1 ? Math.max(0.5, Math.floor((room / width) * 1000) / 1000) : 1;
  });
  wide.forEach((el, i) => {
    if (scales[i]! < 1) el.style.setProperty('zoom', String(scales[i]));
  });
}
