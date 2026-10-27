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
  // A sum a + b + c is written as nested rows ((a + b) + c): its terms lie along the left edge.
  const termsOf = (math: Element): Element[] | undefined => {
    let node: Element | null = math.firstElementChild;
    while (node && node.localName === 'mrow' && node.children.length === 1) node = node.firstElementChild;
    const parts: Element[] = [];
    while (node && node.localName === 'mrow' && node.children.length === 3 && node.children[1]!.localName === 'mo' && ['+', '−', '-'].includes(node.children[1]!.textContent ?? '')) {
      parts.unshift(node.children[1]!, node.children[2]!);
      node = node.children[0]!;
    }
    return node && parts.length >= 4 ? [node, ...parts] : undefined;
  };
  const rooms = cells.map((math) => {
    const table = math.closest('table');
    const room = table?.parentElement ? table.parentElement.clientWidth : 0;
    // The room of the right side: the page less the name, the sign and the note beside it.
    const others = table ? Math.max(table.scrollWidth, table.offsetWidth) - (math.parentElement?.offsetWidth ?? 0) : 0;
    const widest = table ? Math.max(...[...table.querySelectorAll<HTMLElement>('td.rhs > math')].map((m) => m.scrollWidth)) : 0;
    return room - others - Math.max(0, (math.parentElement?.offsetWidth ?? 0) - widest);
  });
  const rows = cells.map((math, i) => scaleOf(math.scrollWidth, rooms[i]!));
  // A long sum is broken before a plus or minus onto more lines, as on paper, rather than made
  // small: lines filled greedily by the measured widths of its terms, the next ones indented.
  const breaks = cells.map((math, i) => {
    if (rows[i]! >= 0.9 || math.classList.contains('eq-line')) return undefined;
    const terms = termsOf(math);
    if (!terms) return undefined;
    const widths = terms.map((t) => t.getBoundingClientRect().width);
    const indent = 16;
    const lines: Element[][] = [[terms[0]!]];
    let width = widths[0]!;
    for (let k = 1; k < terms.length; k += 2) {
      const step = widths[k]! + widths[k + 1]!;
      if (width + step > rooms[i]! * 0.97 && lines[lines.length - 1]!.length > 1) {
        lines.push([]);
        width = indent;
      }
      lines[lines.length - 1]!.push(terms[k]!, terms[k + 1]!);
      width += step;
    }
    return lines.length > 1 ? lines : undefined;
  });
  cells.forEach((math, i) => {
    const lines = breaks[i];
    if (lines) {
      const ns = math.namespaceURI;
      const made = lines.map((items, k) => {
        const line = document.createElementNS(ns, 'math') as HTMLElement;
        line.setAttribute('display', 'inline');
        line.classList.add('eq-line');
        line.style.display = 'block';
        if (k > 0) line.style.paddingLeft = '16px';
        const body = document.createElementNS(ns, 'mrow');
        for (const item of items) body.appendChild(item);
        line.appendChild(body);
        return line;
      });
      // The equals sign stands at the first line, not in the middle of all of them.
      for (const cell of math.closest('tr')?.children ?? []) (cell as HTMLElement).style.verticalAlign = 'baseline';
      math.replaceWith(...made);
    } else if (rows[i]! < 1) math.style.setProperty('zoom', String(rows[i]));
  });
  const scales = wide.map((el) => scaleOf(Math.max(el.scrollWidth, el.offsetWidth), el.parentElement ? el.parentElement.clientWidth : 0));
  wide.forEach((el, i) => {
    if (scales[i]! < 1) el.style.setProperty('zoom', String(scales[i]));
  });
}
