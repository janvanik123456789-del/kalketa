/**
 * Toolbar icons: simple 20×20 line drawings. Operators and functions get a
 * drawing with boxes for the operands; other symbols (α, ≤ …) show themselves.
 */

import type { ReactElement } from 'react';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const page = <path {...S} d="M5 2.5h7l3.5 3.5v11.5H5z M12 2.5V6h3.5" />;

/** Placeholder box for an operand; a thinner line than the symbol itself. */
function box(x: number, y: number, width: number, height: number): ReactElement {
  return <rect {...S} strokeWidth={1.2} x={x} y={y} width={width} height={height} rx={0.6} />;
}

/** Radical sign: small tick, down stroke, long up stroke and the bar over the operand. */
function radical(x0: number): ReactElement {
  return <path {...S} d={`M${x0} 11.5l1.8-.8 2.4 5.8L${x0 + 8} 3h${17 - x0 - 8}`} />;
}

/** A digit or letter drawn in the icon (an index, an exponent, "dx"). */
function label(x: number, y: number, text: string, size: number): ReactElement {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={600} textAnchor="middle" fill="currentColor" fontFamily="system-ui, 'Segoe UI', sans-serif">
      {text}
    </text>
  );
}

const ICONS: Readonly<Record<string, ReactElement>> = {
  'file.new': (
    <>
      {page}
      <path {...S} d="M10 9v5M7.5 11.5h5" />
    </>
  ),
  'file.open': <path {...S} d="M2.5 6V16h13l2-7h-13l-2 7M2.5 6h5l1.5 1.5h6V9" />,
  'file.save': (
    <>
      <path {...S} d="M3 3h11l3 3v11H3z" />
      <path {...S} d="M6 3v4h7V3M6 17v-5h8v5" />
    </>
  ),
  'file.saveAs': (
    <>
      <path {...S} d="M3 3h11l3 3v4M3 3v14h6" />
      <path {...S} d="M6 3v4h7V3M11 17l1-3 5-5 2 2-5 5z" />
    </>
  ),
  'file.print': (
    <>
      <path {...S} d="M5.5 7V2.5h9V7M5.5 14H3V7h14v7h-2.5" />
      <path {...S} d="M5.5 11h9v6.5h-9z" />
    </>
  ),
  'file.pdf': (
    <>
      {page}
      <text x="10" y="14.5" fontSize="5.5" fontWeight="700" textAnchor="middle" fill="currentColor">PDF</text>
    </>
  ),
  'file.properties': (
    <>
      {page}
      <path {...S} d="M7.5 9h5M7.5 11.5h5M7.5 14h3" />
    </>
  ),
  'edit.undo': <path {...S} d="M7 5 3 9l4 4M3 9h9a5 5 0 0 1 0 10h-2" />,
  'edit.redo': <path {...S} d="m13 5 4 4-4 4M17 9H8a5 5 0 0 0 0 10h2" />,
  'edit.cut': (
    <>
      <circle {...S} cx="6" cy="15" r="2.5" />
      <circle {...S} cx="14" cy="15" r="2.5" />
      <path {...S} d="M7.5 13 14 3M12.5 13 6 3" />
    </>
  ),
  'edit.copy': (
    <>
      <path {...S} d="M7 6h9v11.5H7z" />
      <path {...S} d="M4 14V2.5h9V6" />
    </>
  ),
  'edit.paste': (
    <>
      <path {...S} d="M6 4H4v13.5h12V4h-2" />
      <path {...S} d="M7 2.5h6V6H7zM7 10h6M7 13h4" />
    </>
  ),
  'edit.duplicateLine': <path {...S} d="M3 5h10M3 9h10M7 13h10M7 17h10" />,
  'edit.deleteLine': <path {...S} d="M3 10h14M6 6l8 8M14 6l-8 8" />,
  'insert.heading': <path {...S} d="M5 4v12M13 4v12M5 10h8" />,
  'insert.text': <path {...S} d="M15 3.5H8.5a3.5 3.5 0 0 0 0 7H11M11 3.5V17M14 3.5V17" />,
  'insert.definition': (
    <text x="10" y="14.5" fontSize="12" textAnchor="middle" fill="currentColor">
      ≔
    </text>
  ),
  'insert.check': (
    <>
      <path {...S} d="M3 3h14v14H3z" />
      <path {...S} d="m6 10.5 3 3 5-7" />
    </>
  ),
  'insert.pick': (
    <>
      <path {...S} d="M2.5 3.5h15v13h-15zM2.5 8h15M2.5 12.5h15M8 3.5v13" />
      <path d="M8.5 8.8h8.4v3.2H8.5z" fill="currentColor" opacity="0.35" />
    </>
  ),
  'insert.pageBreak': <path {...S} d="M5 2.5v5h10v-5M5 17.5v-5h10v5M2 10h2.5M7 10h2M11 10h2M15.5 10H18" />,
  'insert.newTable': (
    <>
      <path {...S} d="M2.5 3.5h11v10h-11zM2.5 7h11M2.5 10.5h11M7 3.5v10" />
      <path {...S} d="M16 12v6M13 15h6" />
    </>
  ),
  'insert.picture': (
    <>
      <path {...S} d="M2.5 4h15v12h-15z" />
      <path {...S} d="M2.5 14l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" />
      <circle {...S} cx="13" cy="7.5" r="1.3" />
    </>
  ),
  'insert.canvas': (
    <>
      <path {...S} d="M2.5 3.5h15v13h-15z" />
      <path {...S} d="M5 13l3-4 2 2.5M12 6.5h3.5v3.5h-3.5zM5 6.5h4" />
    </>
  ),
  'insert.chart': (
    <>
      <path {...S} d="M3 2.5v14.5h14.5" />
      <path {...S} d="M5 14c2-6 4-9 6-9s3.5 4 6 6" />
    </>
  ),
  'help.functions': (
    <>
      <path {...S} d="M8 3.5c-2 0-2 1.5-2 3v8c0 1.5-.5 2.5-2 2.5M4 9h4.5" />
      <path {...S} d="M11 8l5 6M16 8l-5 6" />
    </>
  ),
  'insert.importTable': (
    <>
      <path {...S} d="M6.5 7.5h11v10h-11zM6.5 11h11M6.5 14.5h11M11 7.5v10" />
      <path {...S} d="M2.5 2.5l5 5M7.5 3.5v4h-4" />
    </>
  ),
  'view.zoomIn': (
    <>
      <circle {...S} cx="8.5" cy="8.5" r="5.5" />
      <path {...S} d="m12.5 12.5 5 5M6 8.5h5M8.5 6v5" />
    </>
  ),
  'view.zoomOut': (
    <>
      <circle {...S} cx="8.5" cy="8.5" r="5.5" />
      <path {...S} d="m12.5 12.5 5 5M6 8.5h5" />
    </>
  ),
  'view.zoom100': (
    <>
      <circle {...S} cx="8.5" cy="8.5" r="5.5" />
      <path {...S} d="m12.5 12.5 5 5" />
      <text x="8.5" y="10.8" fontSize="5.5" textAnchor="middle" fill="currentColor">1:1</text>
    </>
  ),
  'view.fit1': <path {...S} d="M6.5 2.5h7v15h-7z" />,
  'view.fit2': <path {...S} d="M2.5 3.5h6.5v13H2.5zM11 3.5h6.5v13H11z" />,
  'view.fit3': <path {...S} d="M1.5 4.5h5v11h-5zM7.5 4.5h5v11h-5zM13.5 4.5h5v11h-5z" />,
  'view.paneDetails': (
    <>
      <path {...S} d="M2.5 3.5h15v13h-15zM12 3.5v13" />
      <path {...S} d="M14 7h1.5M14 10h1.5M14 13h1.5" />
    </>
  ),
  'view.paneTables': (
    <>
      <path {...S} d="M2.5 3.5h15v13h-15zM10.5 3.5v13" />
      <path {...S} d="M10.5 8h7M10.5 12h7M14 3.5v13" />
    </>
  ),
  'view.paneChat': (
    <>
      <path {...S} d="M3 4h10.5v7.5H8l-3 2.5v-2.5H3z" />
      <path {...S} d="M15.5 8H17v7.5h-2v2.5l-3-2.5H8.5V13.5" />
    </>
  ),
  'view.paneNone': <path {...S} d="M2.5 3.5h15v13h-15z" />,
  'view.tableEditor': <path {...S} d="M2.5 3.5h15v13h-15zM2.5 7.5h15M2.5 11.5h15M7.5 3.5v13M12.5 3.5v13" />,
  'view.customize': (
    <>
      <path {...S} d="M2.5 4h15v4h-15z" />
      <path {...S} d="M5 6h1M8 6h1M11 6h1M4 12h4M4 15.5h8M15 11v7M11.5 14.5h7" />
    </>
  ),
  // A power switch: the AI on or off for this run.
  'tools.ai': <path {...S} d="M6.2 5.6a6 6 0 1 0 7.6 0M10 2.8v6.4" />,
  'tools.study': <path {...S} d="M3 4.5c2.5-1 5-1 7 .5v11c-2-1.5-4.5-1.5-7-.5zM17 4.5c-2.5-1-5-1-7 .5v11c2-1.5 4.5-1.5 7-.5z" />,
  'tools.settings': <path {...S} d="M3 5h8M14 5h3M3 10h3M9 10h8M3 15h9M15 15h2M11 3.5v3M6 8.5v3M12 13.5v3" />,
  'help.shortcuts': <path {...S} d="M2 5.5h16v9H2zM5 8.5h1M8 8.5h1M11 8.5h1M14 8.5h1M6 11.5h8" />,
  'help.about': (
    <>
      <circle {...S} cx="10" cy="10" r="7.5" />
      <path {...S} d="M10 9v5M10 6.2v.1" />
    </>
  ),

  // Operators and functions, as on the palettes of Mathcad: a box marks where the operand goes.
  'sym:√': (
    <>
      {radical(2)}
      {box(11, 6.5, 5.5, 7)}
    </>
  ),
  'sym:∛': (
    <>
      {radical(4)}
      {label(3.4, 8.8, '3', 8.5)}
      {box(12, 6.5, 5, 7)}
    </>
  ),
  'fn:root': (
    <>
      {radical(4)}
      {box(1.5, 3.5, 3.5, 3.5)}
      {box(12, 6.5, 5, 7)}
    </>
  ),
  'sym:²': (
    <>
      {box(2, 8, 8, 9.5)}
      {label(14.8, 9.5, '2', 10)}
    </>
  ),
  'sym:³': (
    <>
      {box(2, 8, 8, 9.5)}
      {label(14.8, 9.5, '3', 10)}
    </>
  ),
  'sym:^': (
    <>
      {box(2, 8, 8, 9.5)}
      {box(12.5, 2, 5, 5)}
    </>
  ),
  'sym:⁻¹': (
    <>
      {box(1, 8, 7.5, 9.5)}
      {label(14, 9.5, '−1', 9.5)}
    </>
  ),
  'sym:_': (
    <>
      {box(2.5, 3.5, 8, 9)}
      {box(13, 13, 4.5, 4.5)}
    </>
  ),
  'sym:÷': (
    <>
      {box(6.5, 1.8, 7, 5.5)}
      <path {...S} d="M3 10h14" />
      {box(6.5, 12.7, 7, 5.5)}
    </>
  ),
  'fn:abs': (
    <>
      <path {...S} d="M4 3v14M16 3v14" />
      {box(7, 6.5, 6, 7)}
    </>
  ),
  'fn:integral': (
    <>
      <path {...S} d="M9 3.5c-.4-1.2-2.6-1.3-3 .5L4.6 16c-.3 1.8-2.5 1.7-3 .5" />
      {box(10, 6.5, 6.5, 7)}
    </>
  ),
  'fn:derivative': (
    <>
      {label(10, 8.3, 'd', 9.5)}
      <path {...S} d="M3.5 10.6h13" />
      {label(10, 19, 'dx', 9.5)}
    </>
  ),
  'fn:sum': (
    <>
      <path {...S} d="M10 3.5H2.5L7 10l-4.5 6.5H10" />
      {box(12, 6.5, 5.5, 7)}
    </>
  ),
  'fn:matrix': (
    <>
      <path {...S} d="M4.5 2.5h-2v15h2M15.5 2.5h2v15h-2" />
      {box(5.5, 4.5, 3.8, 3.8)}
      {box(10.7, 4.5, 3.8, 3.8)}
      {box(5.5, 11.7, 3.8, 3.8)}
      {box(10.7, 11.7, 3.8, 3.8)}
    </>
  ),
};

/** Icon of a command, or undefined when it has none (then the label or symbol is shown). */
export function commandIcon(id: string): ReactElement | undefined {
  const icon = ICONS[id];
  return icon ? (
    <svg className="icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      {icon}
    </svg>
  ) : undefined;
}
