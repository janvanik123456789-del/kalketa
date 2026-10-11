/**
 * Texts of the canvas editor. The module brings its own, so it needs nothing
 * from the catalogs of the main program; the host only says the language.
 */

const cs = {
  title: 'Plátno',
  'tool.select': 'Výběr a posun',
  'tool.text': 'Text',
  'tool.line': 'Čára',
  'tool.arrow': 'Šipka',
  'tool.rect': 'Obdélník',
  'tool.ellipse': 'Elipsa',
  'tool.dimension': 'Kóta (táhněte mezi dvěma body, pak popisek)',
  'tool.arc': 'Oblouk (od středu ke kraji)',
  'tool.moment': 'Moment (oblouk se šipkou, od středu ke kraji)',
  hatch: 'Šrafy',
  dimensionPrompt: 'Popisek kóty (např. l, 150, Δl)',
  picture: 'Vložit obrázek… (také Ctrl+V nebo přetažení)',
  lineWidth: 'Tloušťka čáry',
  fill: 'Výplň',
  fontSize: 'Velikost písma',
  front: 'Do popředí',
  back: 'Do pozadí',
  delete: 'Odstranit (Delete)',
  undo: 'Zpět (Ctrl+Z)',
  redo: 'Znovu (Ctrl+Y)',
  size: 'Velikost plátna',
  hint: 'tažením za pravý dolní roh změníte velikost plátna, dvojklik na text nebo kótu ho upraví, Alt vypne mřížku',
  done: 'Hotovo',
  cancel: 'Storno',
  expand: 'Zvětšit do okna',
  textPrompt: 'Text',
};

export type CanvasTextKey = keyof typeof cs;

const en: Record<CanvasTextKey, string> = {
  title: 'Canvas',
  'tool.select': 'Select and move',
  'tool.text': 'Text',
  'tool.line': 'Line',
  'tool.arrow': 'Arrow',
  'tool.rect': 'Rectangle',
  'tool.ellipse': 'Ellipse',
  'tool.dimension': 'Dimension (drag between two points, then its label)',
  'tool.arc': 'Arc (from the centre to the edge)',
  'tool.moment': 'Moment (an arc with an arrow, from the centre to the edge)',
  hatch: 'Hatch',
  dimensionPrompt: 'Label of the dimension (e.g. l, 150, Δl)',
  picture: 'Insert picture… (also Ctrl+V or drag and drop)',
  lineWidth: 'Line width',
  fill: 'Fill',
  fontSize: 'Font size',
  front: 'Bring to front',
  back: 'Send to back',
  delete: 'Delete (Delete)',
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Y)',
  size: 'Canvas size',
  hint: 'drag the bottom right corner to resize the canvas, double-click a text or a dimension to edit it, Alt turns the grid off',
  done: 'Done',
  cancel: 'Cancel',
  expand: 'Open in a large window',
  textPrompt: 'Text',
};

const TEXTS: Readonly<Record<string, Record<CanvasTextKey, string>>> = { cs, en };

/** Texts for a language such as "cs" or "cs-CZ"; English when the module does not have it. */
export function canvasTexts(language: string): Record<CanvasTextKey, string> {
  return TEXTS[language.toLowerCase().split(/[-_]/)[0] ?? 'en'] ?? en;
}
