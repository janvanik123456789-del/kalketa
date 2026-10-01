/**
 * Commands: the single list of everything the user can do. Menus, toolbars
 * and keyboard shortcuts all run commands from here, so they never disagree.
 */

import { t, type Catalog, type UiKey } from '@calccanvas/i18n';
import { GREEK_SYMBOLS, OPERATOR_SYMBOLS } from './logic/toolbars.js';

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
  run(): void;
}

/** What the commands act on; provided by the application. */
export interface CommandContext {
  readonly catalog: Catalog;
  readonly desktop: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly zoomChoice: string;
  readonly pane: 'details' | 'tables' | 'layers' | 'none';
  readonly tableEditor: boolean;
  /** Number of open calculations. */
  readonly documents: number;
  readonly actions: {
    newDocument(): void;
    open(): void;
    save(): void;
    saveAs(): void;
    closeDocument(): void;
    closeAllDocuments(): void;
    newWindow(): void;
    cycleDocument(direction: 1 | -1): void;
    properties(): void;
    print(): void;
    exportPdf(): void;
    example(): void;
    exit(): void;
    undo(): void;
    redo(): void;
    clipboard(action: 'cut' | 'copy' | 'paste'): void;
    duplicateLine(): void;
    deleteLine(): void;
    setZoom(choice: string): void;
    zoomBy(direction: 1 | -1): void;
    setPane(pane: 'details' | 'tables' | 'layers' | 'none'): void;
    toggleTableEditor(): void;
    customize(): void;
    insert(kind: 'heading' | 'text' | 'definition' | 'check' | 'pick' | 'pageBreak' | 'clear'): void;
    newTable(): void;
    importTable(): void;
    insertBlock(): void;
    addLayer(kind: 'calc' | 'data' | 'sources'): void;
    settings(): void;
    shortcuts(): void;
    functions(): void;
    about(): void;
    insertSymbol(symbol: string): void;
    insertPicture(): void;
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
  add('file.close', 'file', a.closeDocument, { shortcut: 'Ctrl+W' });
  add('file.properties', 'file', a.properties);
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

  add('view.fit1', 'view', () => a.setZoom('fit1'), { checked: ctx.zoomChoice === 'fit1' });
  add('view.fit2', 'view', () => a.setZoom('fit2'), { checked: ctx.zoomChoice === 'fit2' });
  add('view.fit3', 'view', () => a.setZoom('fit3'), { checked: ctx.zoomChoice === 'fit3' });
  add('view.zoomIn', 'view', () => a.zoomBy(1), { shortcut: 'Ctrl++' });
  add('view.zoomOut', 'view', () => a.zoomBy(-1), { shortcut: 'Ctrl+-' });
  add('view.zoom100', 'view', () => a.setZoom('1'), { shortcut: 'Ctrl+0', checked: ctx.zoomChoice === '1' });
  add('view.paneDetails', 'view', () => a.setPane('details'), { checked: ctx.pane === 'details' });
  add('view.paneTables', 'view', () => a.setPane('tables'), { checked: ctx.pane === 'tables' });
  add('view.paneLayers', 'view', () => a.setPane('layers'), { checked: ctx.pane === 'layers' });
  add('view.paneNone', 'view', () => a.setPane('none'), { checked: ctx.pane === 'none' });
  add('view.tableEditor', 'view', a.toggleTableEditor, { checked: ctx.tableEditor });
  add('view.customize', 'view', a.customize);

  add('insert.heading', 'insert', () => a.insert('heading'));
  add('insert.text', 'insert', () => a.insert('text'));
  add('insert.definition', 'insert', () => a.insert('definition'));
  add('insert.check', 'insert', () => a.insert('check'));
  add('insert.pick', 'insert', () => a.insert('pick'));
  add('insert.pageBreak', 'insert', () => a.insert('pageBreak'), { shortcut: 'Ctrl+Enter' });
  add('insert.clear', 'insert', () => a.insert('clear'));
  add('insert.picture', 'insert', a.insertPicture);
  add('insert.newTable', 'insert', a.newTable);
  add('insert.importTable', 'insert', a.importTable);
  add('insert.block', 'insert', a.insertBlock);
  add('insert.layerCalc', 'insert', () => a.addLayer('calc'));
  add('insert.layerData', 'insert', () => a.addLayer('data'));
  add('insert.layerSources', 'insert', () => a.addLayer('sources'));

  add('tools.settings', 'tools', a.settings);
  add('window.new', 'window', a.newWindow, { shortcut: 'Ctrl+Shift+N', enabled: ctx.desktop });
  add('window.next', 'window', () => a.cycleDocument(1), { shortcut: 'Ctrl+Tab', enabled: ctx.documents > 1 });
  add('window.previous', 'window', () => a.cycleDocument(-1), { shortcut: 'Ctrl+Shift+Tab', enabled: ctx.documents > 1 });
  add('window.closeAll', 'window', a.closeAllDocuments);
  add('help.functions', 'help', a.functions, { shortcut: 'F1' });
  add('help.shortcuts', 'help', a.shortcuts);
  add('help.about', 'help', a.about);

  for (const symbol of [...OPERATOR_SYMBOLS, ...GREEK_SYMBOLS]) {
    list.push({
      id: `sym:${symbol}`,
      category: 'symbol',
      label: t(c, 'cmd.symbol', { symbol }),
      glyph: symbol,
      enabled: true,
      run: () => a.insertSymbol(symbol),
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
