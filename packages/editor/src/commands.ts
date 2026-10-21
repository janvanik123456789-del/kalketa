/**
 * Commands: the single list of everything the user can do. Menus, toolbars
 * and keyboard shortcuts all run commands from here, so they never disagree.
 */

import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { FUNCTION_TEMPLATES, GREEK_CASE, GREEK_LETTERS, GREEK_SYMBOLS, NUMBER_SETS, NUMBER_SET_SYMBOLS, OPERATOR_SYMBOLS, OPERATOR_TEMPLATES, SYMBOL_GLYPHS } from './logic/toolbars.js';

export type CommandCategory = 'file' | 'edit' | 'view' | 'insert' | 'tools' | 'window' | 'help' | 'symbol';

export interface Command {
  readonly id: string;
  readonly category: CommandCategory;
  /** Menu label; "&" marks the Alt mnemonic. */
  readonly label: string;
  /** Shortcut shown in menus and tooltips, e.g. "Ctrl+S". */
  readonly shortcut?: string;
  /** Text shown instead of an icon (symbols). */
  readonly glyph?: string;
  readonly enabled: boolean;
  /** Toggle or radio state; undefined for plain commands. */
  readonly checked?: boolean;
  /** A toolbar button that opens a short list to pick from (the number sets); run() does nothing then. */
  readonly choices?: readonly { readonly label: string; run(): void }[];
  run(): void;
}

/** What the commands act on; provided by the application. */
export interface CommandContext {
  readonly catalog: Catalog;
  readonly desktop: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly zoomChoice: string;
  readonly pane: 'details' | 'tables' | 'layers' | 'chat' | 'none';
  readonly tableEditor: boolean;
  /** The AI is switched on for this run of the program (never at start). */
  readonly aiOn: boolean;
  /** Number of open calculations. */
  readonly documents: number;
  /** The calculation keeps conversations, a memory or a journal of the AI. */
  readonly aiRecords: boolean;
  /** The Greek toolbar shows (and inserts) capitals. */
  readonly greekCapitals: boolean;
  readonly actions: {
    newDocument(): void;
    open(): void;
    save(): void;
    saveAs(): void;
    /** A copy for others: without the conversations, memory and journal of the AI. */
    saveCopyWithoutAi(): void;
    closeDocument(): void;
    closeAllDocuments(): void;
    newWindow(): void;
    cycleDocument(direction: 1 | -1): void;
    properties(): void;
    revisions(): void;
    print(): void;
    exportPdf(): void;
    example(): void;
    exit(): void;
    undo(): void;
    redo(): void;
    clipboard(action: 'cut' | 'copy' | 'paste'): void;
    duplicateLine(): void;
    deleteLine(): void;
    /** Marks every row of the sheet (outside a text field; there Ctrl+A selects its text). */
    selectAll(): void;
    setZoom(choice: string): void;
    zoomBy(direction: 1 | -1): void;
    setPane(pane: 'details' | 'tables' | 'layers' | 'chat' | 'none'): void;
    toggleTableEditor(): void;
    customize(): void;
    insert(kind: 'text' | 'definition' | 'check' | 'pick' | 'pageBreak' | 'clear' | 'sheetTable'): void;
    /** Insert > Fit a curve…: the dialog of methods with a preview. */
    fitCurve(): void;
    /** Insert > Chart…: the dialog of the kind of chart. */
    insertChart(): void;
    newTable(): void;
    importTable(): void;
    insertBlock(): void;
    addLayer(kind: 'calc' | 'data' | 'sources'): void;
    settings(): void;
    toggleAi(): void;
    study(): void;
    shortcuts(): void;
    functions(): void;
    about(): void;
    insertSymbol(symbol: string): void;
    toggleGreekCapitals(): void;
    /** A function template with ‸ where the cursor goes; `line` puts it on a line of its own. */
    insertTemplate(template: string, line?: boolean): void;
    insertPicture(): void;
    insertCanvas(): void;
  };
}

export function buildCommands(ctx: CommandContext): Map<string, Command> {
  const { catalog: c, actions: a } = ctx;
  const list: Command[] = [];
  const add = (id: string, category: CommandCategory, run: () => void, extra: Partial<Pick<Command, 'shortcut' | 'enabled' | 'checked'>> = {}) =>
    list.push({ id, category, label: t(c, `cmd.${id}` as UiKey), enabled: true, run, ...extra });

  add('file.new', 'file', a.newDocument, { shortcut: 'Ctrl+N' });
  add('file.open', 'file', a.open, { shortcut: 'Ctrl+O' });
  add('file.save', 'file', a.save, { shortcut: 'Ctrl+S' });
  add('file.saveAs', 'file', a.saveAs, { shortcut: 'Ctrl+Shift+S' });
  add('file.saveWithoutAi', 'file', a.saveCopyWithoutAi, { enabled: ctx.aiRecords });
  add('file.close', 'file', a.closeDocument, { shortcut: 'Ctrl+W' });
  add('file.properties', 'file', a.properties);
  add('file.revisions', 'file', a.revisions);
  add('file.print', 'file', a.print, { shortcut: 'Ctrl+P' });
  add('file.pdf', 'file', a.exportPdf, { enabled: ctx.desktop });
  add('file.example', 'file', a.example);
  add('file.exit', 'file', a.exit, { shortcut: 'Alt+F4', enabled: ctx.desktop });

  add('edit.undo', 'edit', a.undo, { shortcut: 'Ctrl+Z', enabled: ctx.canUndo });
  add('edit.redo', 'edit', a.redo, { shortcut: 'Ctrl+Y', enabled: ctx.canRedo });
  add('edit.cut', 'edit', () => a.clipboard('cut'), { shortcut: 'Ctrl+X' });
  add('edit.copy', 'edit', () => a.clipboard('copy'), { shortcut: 'Ctrl+C' });
  add('edit.paste', 'edit', () => a.clipboard('paste'), { shortcut: 'Ctrl+V' });
  add('edit.duplicateLine', 'edit', a.duplicateLine, { shortcut: 'Ctrl+D' });
  add('edit.deleteLine', 'edit', a.deleteLine, { shortcut: 'Ctrl+Shift+K' });
  add('edit.selectAll', 'edit', a.selectAll, { shortcut: 'Ctrl+A' });

  add('view.fit1', 'view', () => a.setZoom('fit1'), { checked: ctx.zoomChoice === 'fit1' });
  add('view.fit2', 'view', () => a.setZoom('fit2'), { checked: ctx.zoomChoice === 'fit2' });
  add('view.fit3', 'view', () => a.setZoom('fit3'), { checked: ctx.zoomChoice === 'fit3' });
  add('view.zoomIn', 'view', () => a.zoomBy(1), { shortcut: 'Ctrl++' });
  add('view.zoomOut', 'view', () => a.zoomBy(-1), { shortcut: 'Ctrl+-' });
  add('view.zoom100', 'view', () => a.setZoom('1'), { shortcut: 'Ctrl+0', checked: ctx.zoomChoice === '1' });
  add('view.paneDetails', 'view', () => a.setPane('details'), { checked: ctx.pane === 'details' });
  add('view.paneTables', 'view', () => a.setPane('tables'), { checked: ctx.pane === 'tables' });
  add('view.paneLayers', 'view', () => a.setPane('layers'), { checked: ctx.pane === 'layers' });
  add('view.paneChat', 'view', () => a.setPane('chat'), { checked: ctx.pane === 'chat' });
  add('view.paneNone', 'view', () => a.setPane('none'), { checked: ctx.pane === 'none' });
  add('view.tableEditor', 'view', a.toggleTableEditor, { checked: ctx.tableEditor });
  add('view.customize', 'view', a.customize);

  add('insert.text', 'insert', () => a.insert('text'));
  add('insert.definition', 'insert', () => a.insert('definition'));
  add('insert.check', 'insert', () => a.insert('check'));
  add('insert.pick', 'insert', () => a.insert('pick'));
  add('insert.pageBreak', 'insert', () => a.insert('pageBreak'), { shortcut: 'Ctrl+Enter' });
  add('insert.clear', 'insert', () => a.insert('clear'));
  add('insert.picture', 'insert', a.insertPicture);
  add('insert.canvas', 'insert', a.insertCanvas);
  add('insert.chart', 'insert', a.insertChart);
  add('insert.fit', 'insert', a.fitCurve);
  add('insert.sheetTable', 'insert', () => a.insert('sheetTable'));
  add('insert.newTable', 'insert', a.newTable);
  add('insert.importTable', 'insert', a.importTable);
  add('insert.block', 'insert', a.insertBlock);
  add('insert.layerCalc', 'insert', () => a.addLayer('calc'));
  add('insert.layerData', 'insert', () => a.addLayer('data'));
  add('insert.layerSources', 'insert', () => a.addLayer('sources'));

  add('tools.settings', 'tools', a.settings);
  add('tools.ai', 'tools', a.toggleAi, { checked: ctx.aiOn });
  add('tools.study', 'tools', a.study, { enabled: ctx.desktop });
  add('window.new', 'window', a.newWindow, { shortcut: 'Ctrl+Shift+N', enabled: ctx.desktop });
  add('window.next', 'window', () => a.cycleDocument(1), { shortcut: 'Ctrl+Tab', enabled: ctx.documents > 1 });
  add('window.previous', 'window', () => a.cycleDocument(-1), { shortcut: 'Ctrl+Shift+Tab', enabled: ctx.documents > 1 });
  add('window.closeAll', 'window', a.closeAllDocuments);
  add('help.functions', 'help', a.functions, { shortcut: 'F1' });
  add('help.shortcuts', 'help', a.shortcuts);
  add('help.about', 'help', a.about);

  // The sets of numbers a solution is taken from (solve n ∈ ℕ: …), one button with a list.
  list.push({
    id: NUMBER_SETS,
    category: 'symbol',
    label: t(c, 'cmd.numberSets'),
    glyph: 'ℝ▾',
    enabled: true,
    choices: NUMBER_SET_SYMBOLS.map(([symbol, key]) => ({ label: `${symbol} – ${t(c, key as UiKey)}`, run: () => a.insertSymbol(symbol) })),
    run: () => undefined,
  });
  list.push({ id: GREEK_CASE, category: 'symbol', label: t(c, 'cmd.greek.capitals'), glyph: 'Αα', enabled: true, checked: ctx.greekCapitals, run: a.toggleGreekCapitals });
  for (const symbol of [...OPERATOR_SYMBOLS, ...GREEK_SYMBOLS]) {
    // A small Greek letter's button inserts its capital while the toolbar is switched to capitals.
    if (ctx.greekCapitals && GREEK_LETTERS.includes(symbol)) {
      const capital = symbol.toUpperCase();
      list.push({ id: `sym:${symbol}`, category: 'symbol', label: t(c, 'cmd.symbol', { symbol: capital }), glyph: capital, enabled: true, run: () => a.insertSymbol(capital) });
      continue;
    }
    list.push({
      id: `sym:${symbol}`,
      category: 'symbol',
      label: symbol === '^' ? t(c, 'cmd.power') : symbol === ':=' ? t(c, 'cmd.define') : symbol === '⃗' ? t(c, 'cmd.vector') : symbol === '≐' ? t(c, 'cmd.rounded') : symbol === '′' || symbol === '″' ? t(c, symbol === '′' ? 'cmd.prime' : 'cmd.prime2') : t(c, 'cmd.symbol', { symbol }),
      glyph: SYMBOL_GLYPHS[symbol] ?? symbol,
      enabled: true,
      run: () => a.insertSymbol(symbol),
    });
  }
  for (const fn of [...FUNCTION_TEMPLATES, ...OPERATOR_TEMPLATES]) {
    list.push({
      id: `fn:${fn.id}`,
      category: 'symbol',
      label: t(c, `cmd.fn.${fn.id}` as UiKey),
      ...(fn.glyph ? { glyph: fn.glyph } : {}),
      enabled: true,
      run: () => a.insertTemplate(fn.text, fn.line),
    });
  }
  return new Map(list.map((cmd) => [cmd.id, cmd]));
}

/** "Ctrl+Shift+S" for a keyboard event, matching Command.shortcut. */
export function shortcutOf(e: KeyboardEvent): string {
  const key = e.key === '=' ? '+' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && key.length > 1 ? 'Shift' : e.shiftKey && /[A-Z]/.test(key) ? 'Shift' : '', key]
    .filter(Boolean)
    .join('+');
}

/** Label without the "&" mnemonic marker. */
export function plainLabel(label: string): string {
  return label.replace(/&(.)/g, '$1');
}
