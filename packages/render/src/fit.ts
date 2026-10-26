/**
 * Equations and tables of the sheet wider than the page (the steps of a solved quadratic with all its
 * units put in, a table of rooms with many columns) are made smaller to fit its width, as one would
 * write them smaller on paper, but no smaller than half: what still does not fit then overflows
 * rather than turning unreadable. Run in the page
 * view and in the printout before the blocks are measured for pages; plain DOM, no imports, so
 * the printout can take its source as it is.
 */
export function fitWideEquations(root: ParentNode): void {
  const wide = [...root.querySelectorAll<HTMLElement>('.block table.eq, .block .eq-flow, .block table.data-table')];
  const cells = [...root.querySelectorAll<HTMLElement>('.block table.eq td.rhs > math')];
  // Written all first, then read, then written again: one layout, not one per equation.
  for (const el of [...wide, ...cells]) el.style.removeProperty('zoom');
  const scaleOf = (width: number, room: number) => (room > 0 && width > room + 1 ? Math.max(0.5, Math.floor((room / width) * 1000) / 1000) : 1);
  // In the steps of an equation only the steps too wide are made smaller (a substitution with all
  // its units), the equation and its result above and below them stay as they are.
  const rows = cells.map((math) => {
    const table = math.closest('table');
    const room = table?.parentElement ? table.parentElement.clientWidth : 0;
    // The room of the right side: the page less the name, the sign and the note beside it.
    const others = table ? Math.max(table.scrollWidth, table.offsetWidth) - (math.parentElement?.offsetWidth ?? 0) : 0;
    const widest = table ? Math.max(...[...table.querySelectorAll<HTMLElement>('td.rhs > math')].map((m) => m.scrollWidth)) : 0;
    return scaleOf(math.scrollWidth, room - others - Math.max(0, (math.parentElement?.offsetWidth ?? 0) - widest));
  });
  cells.forEach((math, i) => {
    if (rows[i]! < 1) math.style.setProperty('zoom', String(rows[i]));
  });
  const scales = wide.map((el) => scaleOf(Math.max(el.scrollWidth, el.offsetWidth), el.parentElement ? el.parentElement.clientWidth : 0));
  wide.forEach((el, i) => {
    if (scales[i]! < 1) el.style.setProperty('zoom', String(scales[i]));
  });
}
