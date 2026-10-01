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
  hint: 'tažením za pravý dolní roh změníte velikost plátna, dvojklik na text ho upraví, Alt vypne mřížku',
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
  hint: 'drag the bottom right corner to resize the canvas, double-click a text to edit it, Alt turns the grid off',
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
