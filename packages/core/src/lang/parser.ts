/**
 * Parser: tokens -> statements (recursive descent, one statement per line).
 *
 * Operator precedence, lowest first (docs/03-jazyk.md, ch. 5):
 *   or · and · not · comparison · + - · * / · unary - + · ^ (right-assoc)
 *   · postfix (², .member) · primary
 *
 * Units vs. variables (docs/03-jazyk.md, ch. 4.2):
 *   - A name right after a number starts a unit chain ("12 kN/m"). Inside the
 *     chain units win, also over a defined variable ("2.5 m" with a mass m);
 *     the first such place in the sheet gets an info, not every one a warning.
 *   - A standalone name is a variable when defined above, otherwise a unit.
 *   - "[...]" always contains units.
 *   - Juxtaposed values other than number·unit and number·(...) are an error
 *     ("a b" is never multiplication).
 */

import { CalcError, diagnostic, fail, type Diagnostic, type Span } from '../diagnostics.js';
import { DOMAIN_SPELLINGS, TEXT_ALIGNS, TEXT_COLORS, type SolveDomain, type BinaryOperator, type Equation, type Expr, type LineFormat, type NamedArg, type Param, type Sheet, type Statement, type TextAlign, type TextColor, type UnitExpr } from './ast.js';
import { tokenize, type Token, type TokenType } from './lexer.js';

export interface ParseOptions {
  /** Tells whether a name is a known unit symbol. */
  readonly isUnit: (name: string) => boolean;
  /** Names that exist before the first line (tables of the sheet). */
  readonly predefined?: Iterable<string>;
}

export interface ParseResult {
  readonly sheet: Sheet;
  readonly diagnostics: Diagnostic[];
}

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false', 'check', 'source', 'solve', 'in', 'guess', 'dimension', 'unit', 'input', 'derive', 'relation']);
const UNSUPPORTED_STATEMENTS: Readonly<Record<string, string>> = {};
/** Units of an absolute temperature, as written: a minus before such a number belongs to it. */
const ABSOLUTE_TEMPERATURES: ReadonlySet<string> = new Set(['°C', '°F', '℃', '℉', 'degC', 'degF']);
/** "unit ks: dimensionless" (also "unit ks: 1"). */
export const DIMENSIONLESS_NAME = 'dimensionless';
/** Keywords that may follow a complete expression. */
const CONTINUATION_KEYWORDS = new Set(['and', 'or', 'source', 'in', 'guess']);
const COMPARISONS: ReadonlySet<TokenType> = new Set(['==', '!=', '<', '<=', '>', '>=']);


/** Functions with a variable of their own, named after the expression: integral(f(x), x: a .. b). */
export const BINDING_FUNCTIONS: ReadonlySet<string> = new Set(['integral', 'derivative', 'sum', 'plot', 'roots', 'minimize', 'maximize']);
/** Named arguments of those functions that are options, not the variable. */
export const BINDING_OPTIONS: ReadonlySet<string> = new Set(['order', 'kind', 'title', 'samples']);

export function parse(source: string, options: ParseOptions): ParseResult {
  // Tables written in the sheet are read on their own: their cells are text, not expressions.
  const { tables, rest } = sheetTables(source, options);
  const lexed = tokenize(rest);
  const diagnostics: Diagnostic[] = [...lexed.diagnostics, ...tables.flatMap((t) => t.diagnostics)];
  const statements: Statement[] = [];
  const defined = new Set<string>(options.predefined ?? []);
  // The sheet's own units, known from their "unit" line on.
  const units = new Set<string>();
  // Variables already said to be read as units after a number: said once per sheet.
  const noted = new Set<string>();
  // A table goes in among the statements where it stands, and is a name from there on.
  const pending = [...tables];
  const tablesBefore = (offset: number) => {
    while (pending[0] && pending[0].statement.span.offset < offset) {
      const table = pending.shift()!;
      defined.add(table.statement.name);
      // A table of variants defines its columns but the first as names: h is a height there, not an hour.
      if (table.statement.kind === 'table' && table.statement.format?.variants !== undefined) for (const column of table.statement.columns.slice(1)) defined.add(column.name);
      statements.push(table.statement);
    }
  };

  for (const line of splitLines(lexed.tokens)) {
    const comments = line.filter((t) => t.type === 'comment');
    const attributes = line.filter((t) => t.type === 'attributes');
    const tokens = line.filter((t) => t.type !== 'comment' && t.type !== 'attributes');
    const format = attributes.length > 0 ? lineFormat(attributes, diagnostics, (tokens[0] ?? attributes[0]!).span) : undefined;
    const comment = comments.length > 0 ? comments.map((t) => t.text).join(' ') : undefined;
    if (line[0]) tablesBefore(line[0].span.offset);

    if (tokens.length === 0) {
      if (comments.length > 0) statements.push(withComment({ kind: 'comment', span: comments[0]!.span }, comment));
      continue;
    }

    const parser = new LineParser(tokens, options, defined, diagnostics, units, noted);
    let statement: Statement;
    try {
      statement = parser.parseStatement();
    } catch (err) {
      if (!(err instanceof CalcError)) throw err;
      diagnostics.push(err.diagnostic);
      const name = parser.definitionName();
      statement = { kind: 'invalid', span: spanOf(tokens[0]!, tokens[tokens.length - 1]!), ...(name ? { name } : {}) };
      if (name) defined.add(name);
    }
    statements.push(withFormat(withComment(statement, comment), format));
  }
  tablesBefore(Infinity);

  return { sheet: { statements }, diagnostics };
}

const TABLE_HEAD = /^table[ \t]+([\p{L}_][\p{L}\p{N}_]*)[ \t]*:[ \t]*(?:\{([^{}]*)\})?[ \t]*$/u;
const TABLE_ROW = /^[ \t]+\|/;
const COLUMN = /^([\p{L}_][\p{L}\p{N}_]*)\s*(?:\[([^\]]*)\])?\s*(?:\{([^}]*)\})?\s*(?:=\s*(.+))?$/u;

/**
 * The tables written in the sheet, and the source with their lines blanked
 * (same length, so every other span stays where it was):
 *
 *   table Mereni:
 *       | t [s] | T [°C] {0.0} | poznamka |
 *       | 0     | 20.1         | start    |
 */
function sheetTables(source: string, options: ParseOptions): { tables: { statement: Extract<Statement, { kind: 'table' }>; diagnostics: Diagnostic[] }[]; rest: string } {
  const lines = source.split('\n');
  const tables: { statement: Extract<Statement, { kind: 'table' }>; diagnostics: Diagnostic[] }[] = [];
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const blank = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const head = TABLE_HEAD.exec(lines[i]!.replace(/\r$/, ''));
    if (!head) continue;
    let end = i;
    while (end + 1 < lines.length && TABLE_ROW.test(lines[end + 1]!)) end++;
    const diagnostics: Diagnostic[] = [];
    const lineSpan = (n: number): Span => ({ offset: starts[n]!, length: lines[n]!.replace(/\r$/, '').length, line: n + 1, column: 1 });
    const cells = (n: number) => {
      const text = lines[n]!.replace(/\r$/, '').trim();
      return text.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    };
    // In a formula of a column the names of the columns are no units (h is a height, not an hour).
    const names = end > i ? cells(i + 1).map((text) => COLUMN.exec(text)?.[1] ?? '') : [];
    const isUnit = (name: string) => !names.includes(name) && options.isUnit(name);
    const columns = end > i ? cells(i + 1).map((text) => {
      const match = COLUMN.exec(text);
      if (!match) diagnostics.push(diagnostic('E-TABLE-SCHEMA', lineSpan(i + 1), { table: head[1]!, problem: 'column-name', value: text }));
      // The formula of a calculated column, read as an expression of the language.
      let formula: Expr | undefined;
      if (match?.[4]) {
        const read = parse(match[4], { isUnit });
        const statement = read.sheet.statements.find((s) => s.kind !== 'comment');
        if (statement?.kind === 'display' && read.diagnostics.every((d) => d.severity !== 'error')) formula = statement.expr;
        else diagnostics.push(diagnostic('E-TABLE-SCHEMA', lineSpan(i + 1), { table: head[1]!, problem: 'formula', value: match[4] }));
      }
      return { name: match?.[1] ?? text, ...(match?.[2]?.trim() ? { unit: match[2].trim() } : {}), ...(match?.[3]?.trim() ? { format: match[3].trim() } : {}), ...(formula ? { formula } : {}) };
    }) : [];
    if (columns.length === 0) diagnostics.push(diagnostic('E-TABLE-SCHEMA', lineSpan(i), { table: head[1]!, problem: 'no-columns', value: '' }));
    const rows = [];
    for (let n = i + 2; n <= end; n++) {
      const row = cells(n);
      if (row.length > columns.length) diagnostics.push(diagnostic('E-TABLE-CELL', lineSpan(n), { table: head[1]!, row: n - i - 1, column: '', value: row.slice(columns.length).join(' | ') }));
      rows.push(row.slice(0, columns.length));
    }
    const nameAt = lines[i]!.indexOf(head[1]!, 5);
    const span: Span = { offset: starts[i]!, length: starts[end]! + lines[end]!.replace(/\r$/, '').length - starts[i]!, line: i + 1, column: 1 };
    // table Pavlik: {across} — set across in print; table Varianty: {variants=B} — variants of the calculation.
    const words = (head[2] ?? '').split(/\s+/).filter(Boolean);
    const variants = words.map((word) => /^variants(?:=(.+))?$/.exec(word)).find((m) => m);
    for (const word of words) if (word !== 'across' && !/^variants(=.+)?$/.test(word)) diagnostics.push(diagnostic('W-FORMAT', lineSpan(i), { item: word }));
    const tableFormat: LineFormat = { ...(words.includes('across') ? { across: true } : {}), ...(variants ? { variants: variants[1] ?? (true as const) } : {}) };
    tables.push({
      statement: { kind: 'table', name: head[1]!, nameSpan: { offset: starts[i]! + nameAt, length: head[1]!.length, line: i + 1, column: nameAt + 1 }, columns, rows, span, ...(Object.keys(tableFormat).length > 0 ? { format: tableFormat } : {}) },
      diagnostics,
    });
    for (let n = i; n <= end; n++) blank.add(n);
    i = end;
  }
  if (blank.size === 0) return { tables, rest: source };
  const rest = lines.map((line, n) => (blank.has(n) ? line.replace(/[^\r]/g, ' ') : line)).join('\n');
  return { tables, rest };
}

function withFormat(statement: Statement, format: LineFormat | undefined): Statement {
  return format === undefined || Object.keys(format).length === 0 ? statement : { ...statement, format };
}

/**
 * {decimals=2} or {digits=3} (whole numbers 0 to 15, digits from 1); of text {size=12} (6 to 48 pt),
 * {font=serif|sans|mono} or a font by name (font=Times_New_Roman), {italic}, {bold}. Anything else is reported.
 */
function lineFormat(tokens: readonly Token[], diagnostics: Diagnostic[], at: Span): LineFormat {
  const format: { -readonly [K in keyof LineFormat]: LineFormat[K] } = {};
  for (const token of tokens) {
    for (const item of token.text.split(/\s+/).filter(Boolean)) {
      const [key, value] = item.split('=');
      const n = Number(value);
      if ((key === 'decimals' || key === 'digits') && Number.isInteger(n) && n >= (key === 'digits' ? 1 : 0) && n <= 15) format[key] = n;
      else if (key === 'size' && Number.isFinite(n) && n >= 6 && n <= 48) format.size = n;
      else if (key === 'font' && value !== undefined && /^[\p{L}\p{N}_\-]+$/u.test(value)) format.font = value;
      else if ((key === 'italic' || key === 'bold' || key === 'rounded' || key === 'exact' || key === 'noeq' || key === 'beside') && value === undefined) format[key] = true;
      // A name for references (eq=hooke), or the number a book gave the formula (eq=32, eq=12a).
      else if (key === 'eq' && (value === undefined || /^[\p{L}\p{N}_]+$/u.test(value))) format.eq = value ?? true;
      // A position: numbered on (pos), or as the calculation numbers it (pos=3, pos=12a).
      else if (key === 'pos' && (value === undefined || /^[\p{L}\p{N}_]+$/u.test(value))) format.pos = value ?? true;
      else if (key === 'align' && (TEXT_ALIGNS as readonly string[]).includes(value ?? '')) format.align = value as TextAlign;
      else if (key === 'slider' && /^-?\d+(\.\d+)?\.\.-?\d+(\.\d+)?(\.\.\d+(\.\d+)?)?$/.test(value ?? '') && sliderOf(value!)) format.slider = sliderOf(value!)!;
      else if (key === 'color' && ((TEXT_COLORS as readonly string[]).includes(value ?? '') || /^#[0-9a-fA-F]{6}$/.test(value ?? ''))) format.color = value as TextColor;
      else diagnostics.push(diagnostic('W-FORMAT', at, { item }));
    }
  }
  return format;
}

/** "-5..5" or "-5..5..0.5": from, to (greater) and the step (positive); undefined otherwise. */
function sliderOf(value: string): { low: number; high: number; step?: number } | undefined {
  const m = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)(?:\.\.(\d+(?:\.\d+)?))?$/.exec(value);
  if (!m) return undefined;
  const [low, high, step] = [Number(m[1]), Number(m[2]), m[3] !== undefined ? Number(m[3]) : undefined];
  if (!(high > low) || (step !== undefined && !(step > 0))) return undefined;
  return step !== undefined ? { low, high, step } : { low, high };
}

function withComment(statement: Statement, comment: string | undefined): Statement {
  return comment === undefined ? statement : { ...statement, comment };
}

/**
 * Splits tokens into logical lines. A line continues while brackets are open,
 * and a "solve" line continues on the indented lines below it (its equations);
 * there the line breaks are kept, they separate the equations.
 */
function splitLines(tokens: readonly Token[]): Token[][] {
  const lines: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'eof') break;
    if (token.type === '(' || token.type === '[') depth++;
    if ((token.type === ')' || token.type === ']') && depth > 0) depth--;
    if (token.type === 'newline') {
      if (depth > 0) continue;
      const next = tokens[i + 1];
      const solving = current[0]?.type === 'ident' && current[0].text === 'solve';
      if (solving && next && next.type !== 'newline' && next.type !== 'eof' && next.span.column > 1) {
        current.push(token);
        continue;
      }
      lines.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  lines.push(current);
  return lines;
}

export function spanOf(first: { span: Span }, last: { span: Span }): Span {
  const a = first.span;
  const b = last.span;
  return { offset: a.offset, length: b.offset + b.length - a.offset, line: a.line, column: a.column };
}

class LineParser {
  private pos = 0;
  private readonly end: Token;
  /**
   * In a derivation a name not defined above is a name, even where it spells a
   * unit (F, l, E): theory uses symbols, units stand after numbers there.
   */
  private freeNames = false;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly options: ParseOptions,
    private readonly defined: Set<string>,
    private readonly diagnostics: Diagnostic[],
    private readonly units: Set<string>,
    private readonly noted: Set<string> = new Set(),
  ) {
    const last = tokens[tokens.length - 1]!;
    // Synthetic end-of-line token placed right after the last real token.
    this.end = {
      type: 'eof',
      text: '',
      value: 0,
      span: { offset: last.span.offset + last.span.length, length: 0, line: last.span.line, column: last.span.column + last.span.length },
    };
  }

  /** Name on the left of ":=", if the line looks like a definition (of a value or a function). */
  definitionName(): string | undefined {
    const [input, ...rest] = this.tokens;
    const [first, second] = input?.type === 'ident' && (input.text === 'input' || input.text === 'derive') ? rest : this.tokens;
    if (first?.type !== 'ident') return undefined;
    if (second?.type === ':=') return first.text;
    return second?.type === '(' && this.tokens.some((t) => t.type === ':=') ? first.text : undefined;
  }

  parseStatement(): Statement {
    const first = this.peek();
    const lineSpan = spanOf(this.tokens[0]!, this.tokens[this.tokens.length - 1]!);

    if (first.type === 'heading') {
      this.next();
      this.expectEnd();
      return { kind: 'heading', level: first.value, text: first.text, span: lineSpan };
    }
    if (first.type === 'picture') {
      this.next();
      this.expectEnd();
      const picture = parsePicture(first.text);
      if (!picture) fail('E-PICTURE-SYNTAX', first.span);
      return { kind: 'picture', ...picture, span: lineSpan };
    }
    if (first.type === 'directive') {
      const args = this.tokens.slice(1).map((t) => t.text).join(' ');
      return { kind: 'directive', name: first.text, args, span: lineSpan };
    }
    if (first.type === 'string' && this.tokens.length === 1) {
      return { kind: 'text', text: first.text, span: lineSpan };
    }
    const cites = first.type === 'string' ? citationsOf(this.tokens.slice(1)) : undefined;
    if (cites) return { kind: 'text', text: first.text, cites, span: lineSpan };
    if (first.type === 'ident' && first.text === 'check' && this.peek(1).type !== ':=') {
      return this.parseCheck(lineSpan);
    }
    if (first.type === 'ident' && first.text === 'solve' && this.peek(1).type !== ':=') {
      return this.parseSolve(lineSpan);
    }
    if (first.type === 'ident' && first.text === 'derive' && this.peek(1).type !== ':=') {
      return this.parseDerive(lineSpan);
    }
    if (first.type === 'ident' && first.text === 'relation' && this.peek(1).type !== ':=') {
      return this.parseRelation(lineSpan);
    }
    if (first.type === 'ident' && first.text === 'dimension' && this.peek(1).type === 'ident') {
      this.next();
      const name = this.next();
      this.expectEnd();
      return { kind: 'dimension', name: name.text, nameSpan: name.span, span: lineSpan };
    }
    if (first.type === 'ident' && first.text === 'unit' && this.peek(1).type === 'ident') {
      return this.parseUnitDefinition(lineSpan);
    }
    if (first.type === 'ident' && first.text in UNSUPPORTED_STATEMENTS && this.peek(1).type !== ':=') {
      fail('E-UNSUPPORTED', first.span, { feature: UNSUPPORTED_STATEMENTS[first.text]! });
    }

    const defineAt = this.tokens.findIndex((t) => t.type === ':=');
    // "input L := 5 m": an input of a block.
    if (first.type === 'ident' && first.text === 'input' && this.peek(1).type === 'ident') {
      this.next();
      const definition = this.parseDefinition(defineAt, lineSpan);
      if (definition.kind === 'definition' && definition.params) fail('E-SYNTAX', first.span, { expected: 'name', found: 'input' });
      return { ...definition, input: true } as Statement;
    }
    if (defineAt !== -1) {
      // y := a == b (== c …): a derivation ending in a definition. A comparison stays one:
      // ok := m.trida == "S235", flags with true/false, and/or, <, ≠.
      const members = this.chainLength(defineAt + 1);
      if (members >= 2 && !this.isComparison(defineAt + 1)) return this.parseDerivedDefinition(lineSpan, false);
      return this.parseDefinition(defineAt, lineSpan);
    }
    return this.parseDisplay(lineSpan);
  }

  /** How many members "==" joins at the top level of the tokens from `from` on. */
  private chainLength(from: number): number {
    let depth = 0;
    let members = 1;
    for (const token of this.tokens.slice(from)) {
      if (token.type === '(' || token.type === '[') depth++;
      else if (token.type === ')' || token.type === ']') depth--;
      else if ((token.type === '==' || token.type === '≐') && depth === 0) members++;
    }
    return members;
  }

  /** Whether the tokens from `from` on read as a test (text, true/false, and/or/not, <, ≠), not as equal values. */
  private isComparison(from: number): boolean {
    return this.tokens
      .slice(from)
      .some((t) => t.type === 'string' || ['<', '<=', '>', '>=', '!='].includes(t.type) || (t.type === 'ident' && ['true', 'false', 'and', 'or', 'not'].includes(t.text)));
  }

  /** relation x^2 + y^2 == r^2: an equation that holds; its names are symbols where the sheet has no value for them. */
  private parseRelation(lineSpan: Span): Statement {
    this.next(); // relation
    this.freeNames = true;
    const left = this.parseAdditive();
    const eq = this.peek();
    if (eq.type !== '==' && eq.type !== '=') fail('E-SYNTAX', eq.span, { expected: '==', found: eq.text || 'end-of-line' });
    this.next();
    const right = this.parseAdditive();
    this.expectEnd();
    return { kind: 'derive', members: [left, right], relation: true, span: lineSpan };
  }

  /** derive a == b == c · derive y := a == b · derive M_mp := l^3·F/3 (a symbol of theory) */
  private parseDerive(lineSpan: Span): Statement {
    this.next(); // derive
    const defineAt = this.tokens.findIndex((t) => t.type === ':=');
    if (defineAt !== -1) return this.parseDerivedDefinition(lineSpan, true);
    this.freeNames = true;
    const members = this.parseChain();
    const approx = this.approx;
    this.expectEnd();
    return { kind: 'derive', members, ...(approx.length > 0 ? { approx } : {}), span: lineSpan };
  }

  /**
   * y := a == b == c: every member checked, the last one gives y. After derive
   * one member is enough: a symbol of theory, which needs no values.
   */
  private parseDerivedDefinition(lineSpan: Span, symbolic: boolean): Statement {
    const nameToken = this.peek();
    // A function may be derived too: dV(z) := 2·ε_xx(z) + ε_zz == −ρ·g/E·(3·h − 2·z − a).
    const isFunction = nameToken.type === 'ident' && this.peek(1).type === '(';
    if (nameToken.type !== 'ident' || (this.peek(1).type !== ':=' && !isFunction)) fail('E-SYNTAX', nameToken.span, { expected: 'name', found: nameToken.text });
    if (KEYWORDS.has(nameToken.text)) fail('E-RESERVED', nameToken.span, { name: nameToken.text });
    this.next();
    const params = isFunction ? this.parseParams() : undefined;
    this.expect(':=', ':=');
    this.freeNames = true;
    const added = (params ?? []).map((p) => p.name).filter((name) => !this.defined.has(name));
    added.forEach((name) => this.defined.add(name));
    let members: Expr[];
    let target: UnitExpr | undefined;
    let approx: number[] = [];
    try {
      members = this.parseChain(symbolic ? 1 : 2);
      approx = this.approx;
      target = this.parseTarget();
    } finally {
      added.forEach((name) => this.defined.delete(name));
    }
    this.defined.add(nameToken.text);
    const source = this.parseSource();
    this.expectEnd();
    return {
      kind: 'definition',
      name: nameToken.text,
      nameSpan: nameToken.span,
      expr: members.at(-1)!,
      ...(members.length > 1 ? { derivation: members } : {}),
      ...(approx.length > 0 ? { approx } : {}),
      ...(symbolic ? { symbolic } : {}),
      ...(target ? { target } : {}),
      ...(params ? { params } : {}),
      ...(source !== undefined ? { source } : {}),
      span: lineSpan,
    };
  }

  /** source "EN 1990, 6.10" at the end of a line: where its formula, value or condition comes from. */
  private parseSource(): string | undefined {
    if (!this.isKeyword('source')) return undefined;
    this.next();
    return this.expect('string', 'text').text;
  }

  /** Steps of the chain last read that are equal when rounded (≐): step i joins members i and i + 1. */
  private approx: number[] = [];

  /** a == b == c (also with "="), a step also ≐ (equal when rounded): at least `least` members. */
  private parseChain(least = 2): Expr[] {
    const members = [this.parseAdditive()];
    this.approx = [];
    while (this.peek().type === '==' || this.peek().type === '=' || this.peek().type === '≐') {
      if (this.peek().type === '≐') this.approx.push(members.length - 1);
      this.next();
      members.push(this.parseAdditive());
    }
    if (members.length < least) fail('E-SYNTAX', this.peek().span, { expected: '==', found: this.peek().text || 'end-of-line' });
    return members;
  }

  private parseDefinition(defineAt: number, lineSpan: Span): Statement {
    const nameToken = this.peek();
    const isFunction = nameToken.type === 'ident' && this.peek(1).type === '(';
    if (nameToken.type !== 'ident' || (defineAt !== this.pos + 1 && !isFunction)) {
      fail('E-SYNTAX', nameToken.span, { expected: 'name', found: nameToken.text });
    }
    if (KEYWORDS.has(nameToken.text)) fail('E-RESERVED', nameToken.span, { name: nameToken.text });
    this.next();
    const params = isFunction ? this.parseParams() : undefined;
    this.expect(':=', ':=');

    // Parameters are names inside the body, even where they spell a unit (m, t, s).
    const added = (params ?? []).map((p) => p.name).filter((name) => !this.defined.has(name));
    added.forEach((name) => this.defined.add(name));
    let expr: Expr;
    let target: UnitExpr | undefined;
    try {
      expr = this.parseExpression();
      target = this.parseTarget();
    } finally {
      added.forEach((name) => this.defined.delete(name));
    }
    this.defined.add(nameToken.text);
    const source = this.parseSource();
    this.expectEnd();
    return {
      kind: 'definition',
      name: nameToken.text,
      nameSpan: nameToken.span,
      expr,
      ...(target ? { target } : {}),
      ...(params ? { params } : {}),
      ...(source !== undefined ? { source } : {}),
      span: lineSpan,
    };
  }

  /** "(d)" or "(M, W)" after the name of a function being defined. */
  private parseParams(): Param[] {
    this.expect('(', '(');
    const params: Param[] = [];
    if (this.peek().type !== ')') {
      do {
        const token = this.expect('ident', 'parameter');
        if (KEYWORDS.has(token.text)) fail('E-RESERVED', token.span, { name: token.text });
        if (params.some((p) => p.name === token.text)) fail('E-REDEFINED', token.span, { name: token.text });
        params.push({ name: token.text, span: token.span });
      } while (this.peek().type === ',' && this.next());
    }
    this.expect(')', ')');
    return params;
  }

  /** check ["label":] condition [source "reference"] */
  private parseCheck(lineSpan: Span): Statement {
    this.next(); // check
    let label: string | undefined;
    if (this.peek().type === 'string') {
      label = this.next().text;
      this.expect(':', ':');
    }
    const expr = this.parseExpression();
    const source = this.parseSource();
    this.expectEnd();
    return {
      kind: 'check',
      expr,
      ...(label !== undefined ? { label } : {}),
      ...(source !== undefined ? { source } : {}),
      span: lineSpan,
    };
  }

  /**
   * solve x: equation [in low .. high]
   * solve (a, b): equation, equation [guess a = 1 m, b = 2 m]
   * Equations may also stand on the indented lines below.
   */
  private parseSolve(lineSpan: Span): Statement {
    this.next(); // solve
    const unknowns: Param[] = [];
    const unknown = () => {
      const token = this.expect('ident', 'unknown');
      if (KEYWORDS.has(token.text)) fail('E-RESERVED', token.span, { name: token.text });
      if (unknowns.some((u) => u.name === token.text)) fail('E-REDEFINED', token.span, { name: token.text });
      unknowns.push({ name: token.text, span: token.span });
    };
    let ode: { variable: string; span: Span } | undefined;
    if (this.peek().type === '(') {
      this.next();
      do unknown();
      while (this.peek().type === ',' && this.next());
      this.expect(')', ')');
    } else {
      unknown();
      // solve w(x): the unknown is a function, of a differential equation.
      if (this.peek().type === '(') {
        this.next();
        const variable = this.expect('ident', 'parameter');
        this.expect(')', ')');
        ode = { variable: variable.text, span: variable.span };
      }
    }
    // The unknowns are names from here on, even where they spell a unit (t, s); so is the variable of a function.
    unknowns.forEach((u) => this.defined.add(u.name));
    // Conditions of the solution, as on paper: x ∈ ℝ, x > 0.
    let domain: SolveDomain | undefined;
    const conditions: Expr[] = [];
    if (this.peek().type === '∈') {
      this.next();
      const set = this.expect('ident', 'ℝ');
      domain = (Object.keys(DOMAIN_SPELLINGS) as SolveDomain[]).find((d) => DOMAIN_SPELLINGS[d].includes(set.text));
      if (!domain) fail('E-SYNTAX', set.span, { expected: 'ℝ, ℂ, ℕ, ℕ₀, ℤ', found: set.text });
    }
    while (!ode && this.peek().type === ',') {
      this.next();
      conditions.push(this.parseComparison());
    }
    this.expect(':', ':');
    // The variable is a name inside the statement only; one defined above stays so.
    const ownVariable = ode !== undefined && !this.defined.has(ode.variable);
    if (ode) this.defined.add(ode.variable);

    const equations: Equation[] = [];
    const guesses: NamedArg[] = [];
    let range: { low: Expr; high: Expr } | undefined;
    for (;;) {
      while (this.peek().type === 'newline' || this.peek().type === ',') this.next();
      if (this.peek().type === 'eof') break;
      if (this.isKeyword('in')) {
        this.next();
        const low = this.parseAdditive();
        this.expect('..', '..');
        range = { low, high: this.parseAdditive() };
        continue;
      }
      if (this.isKeyword('guess')) {
        this.next();
        do {
          const name = this.expect('ident', 'unknown');
          if (this.peek().type !== '=' && this.peek().type !== ':') fail('E-SYNTAX', this.peek().span, { expected: '=', found: this.peek().text || 'end-of-line' });
          this.next();
          guesses.push({ name: name.text, nameSpan: name.span, value: this.parseAdditive() });
        } while (this.peek().type === ',' && this.next());
        continue;
      }
      const left = this.parseAdditive();
      const eq = this.peek();
      // solve y: Kruh — a relation of the sheet by its name.
      const ends = eq.type === ',' || eq.type === 'newline' || eq.type === 'eof' || this.isKeyword('in') || this.isKeyword('guess');
      const name = left.kind === 'variable' ? left.name : left.kind === 'unit' && left.unit.kind === 'unit-name' ? left.unit.name : undefined;
      if (ends && name !== undefined && !ode) {
        equations.push({ left, right: left, named: name, span: left.span });
        continue;
      }
      const relation = eq.type === '<' || eq.type === '<=' || eq.type === '>' || eq.type === '>=' ? eq.type : undefined;
      if (eq.type !== '==' && eq.type !== '=' && !relation) fail('E-SYNTAX', eq.span, { expected: '==', found: eq.text || 'end-of-line' });
      this.next();
      const right = this.parseAdditive();
      equations.push({ left, right, ...(relation ? { relation } : {}), span: spanOf(left, right) });
      const after = this.peek();
      if (after.type !== ',' && after.type !== 'newline' && after.type !== 'eof' && !this.isKeyword('in') && !this.isKeyword('guess')) {
        fail('E-SYNTAX', after.span, { expected: 'end-of-line', found: after.text });
      }
    }
    if (equations.length === 0) fail('E-SYNTAX', this.end.span, { expected: '==', found: 'end-of-line' });
    if (range && unknowns.length !== 1) fail('E-SYNTAX', range.low.span, { expected: 'guess', found: 'in' });
    // An inequality has a side of its bound: one unknown, one inequality.
    const inequality = equations.find((e) => e.relation);
    if (inequality && (unknowns.length !== 1 || equations.length !== 1)) fail('E-SOLVE-INEQUALITY', inequality.span);
    if (ode && ownVariable) this.defined.delete(ode.variable);
    if ((domain || conditions.length > 0) && unknowns.length !== 1) fail('E-SOLVE-CONDITIONS', unknowns[1]?.span ?? lineSpan);
    return { kind: 'solve', unknowns, equations, ...(range ? { range } : {}), guesses, ...(ode ? { ode } : {}), ...(domain ? { domain } : {}), ...(conditions.length > 0 ? { conditions } : {}), span: lineSpan };
  }

  /** unit CZK: Mena · unit ks: dimensionless · unit EUR := 25 CZK */
  private parseUnitDefinition(lineSpan: Span): Statement {
    this.next(); // unit
    const name = this.next();
    if (KEYWORDS.has(name.text)) fail('E-RESERVED', name.span, { name: name.text });
    if (this.units.has(name.text) || this.defined.has(name.text)) fail('E-REDEFINED', name.span, { name: name.text });
    let statement: Statement;
    if (this.peek().type === ':') {
      this.next();
      const dim = this.peek();
      if (dim.type === 'number' && dim.value === 1) {
        this.next();
        statement = { kind: 'unit', name: name.text, nameSpan: name.span, dimension: { name: DIMENSIONLESS_NAME, span: dim.span }, span: lineSpan };
      } else {
        const token = this.expect('ident', 'dimension');
        statement = { kind: 'unit', name: name.text, nameSpan: name.span, dimension: { name: token.text, span: token.span }, span: lineSpan };
      }
    } else {
      this.expect(':=', ':=');
      statement = { kind: 'unit', name: name.text, nameSpan: name.span, expr: this.parseExpression(), span: lineSpan };
    }
    this.expectEnd();
    this.units.add(name.text);
    return statement;
  }

  /** Built-in units and the sheet's own ones defined above. */
  private isUnit(name: string): boolean {
    return this.options.isUnit(name) || this.units.has(name);
  }

  private parseDisplay(lineSpan: Span): Statement {
    const expr = this.parseExpression();
    const target = this.parseTarget();
    if (this.peek().type === '=') {
      const eq = this.next();
      if (this.peek().type !== 'eof') {
        // "a = 5": the user meant a definition.
        // (also "m = 5": a name that happens to be a unit)
        if (expr.kind === 'variable') fail('E-ASSIGN-WITH-EQUALS', eq.span, { name: expr.name });
        if (expr.kind === 'unit' && expr.unit.kind === 'unit-name') fail('E-ASSIGN-WITH-EQUALS', eq.span, { name: expr.unit.name });
        fail('E-SYNTAX', this.peek().span, { expected: 'end-of-line', found: this.peek().text });
      }
    }
    this.expectEnd();
    return { kind: 'display', expr, ...(target ? { target } : {}), span: lineSpan };
  }

  private parseTarget(): UnitExpr | undefined {
    if (this.peek().type !== '|') return undefined;
    this.next();
    return this.parseUnitExpr();
  }

  // -------------------------------------------------------------------------
  // Expressions
  // -------------------------------------------------------------------------

  parseExpression(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isKeyword('or')) {
      this.next();
      left = this.binary('or', left, this.parseAnd());
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isKeyword('and')) {
      this.next();
      left = this.binary('and', left, this.parseNot());
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKeyword('not')) {
      const op = this.next();
      const operand = this.parseNot();
      return { kind: 'unary', operator: 'not', operand, span: spanOf(op, operand) };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const left = this.parseAdditive();
    if (!COMPARISONS.has(this.peek().type)) return left;
    const op = this.next().type as BinaryOperator;
    const result = this.binary(op, left, this.parseAdditive());
    if (COMPARISONS.has(this.peek().type)) {
      fail('E-SYNTAX', this.peek().span, { expected: 'end-of-comparison', found: this.peek().text });
    }
    return result;
  }

  parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.peek().type === '+' || this.peek().type === '-' || this.peek().type === '±') {
      const op = this.next().type as '+' | '-' | '±';
      left = this.binary(op, left, this.parseMultiplicative());
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const type = this.peek().type;
      if (type === '*' || type === '/') {
        this.next();
        left = this.binary(type, left, this.parseUnary());
        continue;
      }
      if (this.startsOperand(this.peek())) {
        fail('E-MISSING-OPERATOR', this.peek().span, { found: this.peek().text });
      }
      return left;
    }
  }

  private parseUnary(): Expr {
    const type = this.peek().type;
    if (type === '-' || type === '+' || type === '±') {
      const op = this.next();
      const operand = this.parseUnary();
      // "-15 °C" is a temperature of −15 °C, not the opposite of 15 °C (−288,15 K): the minus belongs to the number.
      if (type === '-' && operand.kind === 'number' && operand.unit?.kind === 'unit-name' && ABSOLUTE_TEMPERATURES.has(operand.unit.name)) {
        return { ...operand, value: -operand.value, span: spanOf(op, operand) };
      }
      return { kind: 'unary', operator: type, operand, span: spanOf(op, operand) };
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePostfix();
    if (this.peek().type !== '^') return base;
    this.next();
    return this.binary('^', base, this.parseUnary());
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token.type === 'superscript') {
        this.next();
        const exponent: Expr = { kind: 'number', value: token.value, span: token.span };
        expr = this.binary('^', expr, exponent);
      } else if (token.type === '.') {
        this.next();
        const name = this.expect('ident', 'member-name');
        expr = { kind: 'member', object: expr, name: name.text, span: spanOf(expr, name) };
      } else if (token.type === '[' && expr.kind !== 'number') {
        // CF[1]: an item of a series; A[i, j]: an item of a matrix.
        this.next();
        const index = this.parseExpression();
        const column = this.peek().type === ',' ? (this.next(), this.parseExpression()) : undefined;
        const close = this.expect(']', ']');
        expr = { kind: 'index', object: expr, index, ...(column ? { column } : {}), span: spanOf(expr, close) };
      } else {
        return expr;
      }
    }
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    switch (token.type) {
      case 'number':
        return this.parseNumber();
      case 'string':
        this.next();
        return { kind: 'string', value: token.text, span: token.span };
      case 'date':
        this.next();
        return { kind: 'date', days: token.value, span: token.span };
      case '(': {
        this.next();
        const inner = this.parseExpression();
        const close = this.expect(')', ')');
        // A unit right after a group: "(3 + 4j) Ω". A name defined above stays a name.
        const next = this.peek();
        if (!this.freeNames && next.type === 'ident' && !KEYWORDS.has(next.text) && !this.defined.has(next.text) && this.isUnit(next.text)) {
          const unit = this.parseUnitChain();
          const factor: Expr = { kind: 'unit', unit, span: unit.span };
          return { kind: 'binary', operator: '*', left: inner, right: factor, span: spanOf(token, unit) };
        }
        // The group as written, with its brackets: what quotes the source shows them.
        return { ...inner, span: spanOf(token, close) };
      }
      case '[': {
        // "[m]" is a unit; anything else in brackets is a series: [100, 120, 150] CZK.
        const save = this.pos;
        const diagnosticsBefore = this.diagnostics.length;
        try {
          const unit = this.parseBracketUnit();
          return { kind: 'unit', unit, span: unit.span };
        } catch (err) {
          if (!(err instanceof CalcError)) throw err;
          this.pos = save;
          this.diagnostics.length = diagnosticsBefore;
        }
        return this.parseVector();
      }
      case '√':
      case '∛': {
        // √x and ∛x: prefixes for sqrt(x) and cbrt(x).
        this.next();
        const operand = this.parsePostfix();
        return { kind: 'call', name: token.type === '√' ? 'sqrt' : 'cbrt', args: [operand], named: [], span: spanOf(token, operand) };
      }
      case 'ident':
        return this.parseName();
      default:
        fail('E-SYNTAX', token.span, { expected: 'value', found: token.text || 'end-of-line' });
    }
  }

  private parseName(): Expr {
    const token = this.next();
    const name = token.text;
    if (name === 'true' || name === 'false') return { kind: 'boolean', value: name === 'true', span: token.span };
    if (KEYWORDS.has(name)) fail('E-SYNTAX', token.span, { expected: 'value', found: name });

    // w″ in a differential equation, w′(0 m) at a point.
    if (this.peek().type === 'prime') {
      const prime = this.next();
      if (this.peek().type === '(') {
        this.next();
        const arg = this.parseExpression();
        const close = this.expect(')', ')');
        return { kind: 'prime', name, order: prime.value, arg, span: spanOf(token, close) };
      }
      return { kind: 'prime', name, order: prime.value, span: spanOf(token, prime) };
    }

    if (this.peek().type === '(') {
      this.next();
      const args: Expr[] = [];
      const named: NamedArg[] = [];
      // integral(3·t², t: 0 s .. 2 s): the variable is named after the expression that uses it, so look
      // ahead for it; inside the call it is a name, not a unit (t would be tonnes), as after solve t:.
      const bound = BINDING_FUNCTIONS.has(name)
        ? this.namesAhead().filter((n) => !this.defined.has(n) && !BINDING_OPTIONS.has(n))
        : name === 'fit'
          ? this.formVariableAhead().filter((n) => !this.defined.has(n))
          : [];
      bound.forEach((n) => this.defined.add(n));
      if (this.peek().type !== ')') {
        do {
          if (this.peek().type === 'ident' && this.peek(1).type === ':') {
            const label = this.next();
            this.next();
            if (named.some((n) => n.name === label.text)) fail('E-NAMED-ARG', label.span, { function: name, argument: label.text, problem: 'duplicate' });
            const value = this.parseExpression();
            // A range: x: 0 m .. L.
            if (this.peek().type === '..') {
              this.next();
              const high = this.parseExpression();
              named.push({ name: label.text, nameSpan: label.span, value: { kind: 'range', low: value, high, span: spanOf(value, high) } });
            } else {
              named.push({ name: label.text, nameSpan: label.span, value });
            }
          } else {
            if (named.length > 0) fail('E-NAMED-ARG', this.peek().span, { function: name, argument: '', problem: 'positional-after-named' });
            args.push(this.parseExpression());
          }
        } while (this.peek().type === ',' && this.next());
      }
      const close = this.expect(')', ')');
      bound.forEach((n) => this.defined.delete(n));
      return { kind: 'call', name, args, named, span: spanOf(token, close) };
    }
    if (!this.freeNames && !this.defined.has(name) && this.isUnit(name)) {
      const unit: UnitExpr = { kind: 'unit-name', name, span: token.span };
      // A one-letter unit alone among names (k·t, t/t_v) is most likely meant as a variable: t would be tonnes,
      // s seconds. A unit after a number (5/s) is a unit as meant.
      const before = this.tokens[this.pos - 2];
      const afterNumber = before?.type === 'number' || (before?.type === '/' && this.tokens[this.pos - 3]?.type === 'number');
      // Nor a name given to an option (by: S, a column of a table), nor "m = 5" (another hint says to use :=).
      const option = before?.type === ':';
      const shown = this.peek().type === '=';
      if (name.length === 1 && !afterNumber && !option && !shown) this.diagnostics.push(diagnostic('W-BARE-UNIT', token.span, { name }));
      return { kind: 'unit', unit, span: token.span };
    }
    return { kind: 'variable', name, span: token.span };
  }

  /** [a, b, c] with an optional unit after it: [100, 120] CZK. */
  private parseVector(): Expr {
    const open = this.next();
    // Items separated by commas, rows of a matrix by | (as in Calcpad): [4, -2 | -2, 4].
    const rows: Expr[][] = [[]];
    if (this.peek().type !== ']') {
      for (;;) {
        rows.at(-1)!.push(this.parseExpression());
        if (this.peek().type === ',') this.next();
        else if (this.peek().type === '|') {
          this.next();
          rows.push([]);
        } else break;
      }
    }
    const close = this.expect(']', ']');
    const vector: Expr = rows.length > 1 ? { kind: 'matrix', rows, span: spanOf(open, close) } : { kind: 'vector', items: rows[0]!, span: spanOf(open, close) };
    const next = this.peek();
    if (next.type === 'ident' && !KEYWORDS.has(next.text) && !this.defined.has(next.text) && this.isUnit(next.text)) {
      const unit = this.parseUnitChain();
      return { kind: 'binary', operator: '*', left: vector, right: { kind: 'unit', unit, span: unit.span }, span: spanOf(open, unit) };
    }
    return vector;
  }

  /** Number with optional unit ("12 kN/m", "5 [m]") or implicit product ("2(a+b)"). */
  private parseNumber(): Expr {
    const token = this.next();
    const next = this.peek();
    if (next.type === '[') {
      const unit = this.parseBracketUnit();
      return { kind: 'number', value: token.value, unit, span: spanOf(token, unit), ...(token.imaginary ? { imaginary: true } : {}) };
    }
    if (next.type === 'ident' && !KEYWORDS.has(next.text)) {
      if (!this.isUnit(next.text)) {
        if (this.defined.has(next.text)) fail('E-MISSING-OPERATOR', next.span, { found: next.text });
        fail('E-UNKNOWN-UNIT', next.span, { unit: next.text });
      }
      const unit = this.parseUnitChain();
      return { kind: 'number', value: token.value, unit, span: spanOf(token, unit), ...(token.imaginary ? { imaginary: true } : {}) };
    }
    const value: Expr = { kind: 'number', value: token.value, span: token.span, ...(token.imaginary ? { imaginary: true } : {}) };
    if (next.type === '(') {
      this.next();
      const inner = this.parseExpression();
      const close = this.expect(')', ')');
      return { kind: 'binary', operator: '*', left: value, right: inner, span: spanOf(token, close) };
    }
    return value;
  }

  // -------------------------------------------------------------------------
  // Units
  // -------------------------------------------------------------------------

  /** Unit chain right after a number: continues only while units follow. */
  private parseUnitChain(): UnitExpr {
    let left = this.parseUnitFactor(false);
    for (;;) {
      const op = this.peek();
      if (op.type !== '*' && op.type !== '/') return left;
      const save = this.pos;
      this.next();
      const right = this.tryParseUnitFactor();
      if (!right) {
        this.pos = save;
        return left;
      }
      left = { kind: op.type === '*' ? 'unit-mul' : 'unit-div', left, right, span: spanOf(left, right) };
    }
  }

  private tryParseUnitFactor(): UnitExpr | undefined {
    const token = this.peek();
    if (token.type === 'ident' && this.isUnit(token.text)) return this.parseUnitFactor(false);
    if (token.type !== '(') return undefined;
    // "J/(kg·K)": accept the group only if it contains nothing but units.
    const save = this.pos;
    const diagnosticsBefore = this.diagnostics.length;
    try {
      this.next();
      const inner = this.parseUnitExpr(false);
      this.expect(')', ')');
      return this.parseUnitPowers(inner);
    } catch (err) {
      if (!(err instanceof CalcError)) throw err;
      this.pos = save;
      this.diagnostics.length = diagnosticsBefore;
      return undefined;
    }
  }

  private parseBracketUnit(): UnitExpr {
    const open = this.next();
    if (this.peek().type === ']') fail('E-SYNTAX', this.peek().span, { expected: 'unit', found: ']' });
    const unit = this.parseUnitExpr(true);
    const close = this.expect(']', ']');
    return { ...unit, span: spanOf(open, close) };
  }

  /** Full unit expression (target units, brackets): every name must be a unit. */
  private parseUnitExpr(explicit = true): UnitExpr {
    let left = this.parseUnitFactor(explicit);
    while (this.peek().type === '*' || this.peek().type === '/') {
      const op = this.next();
      const right = this.parseUnitFactor(explicit);
      left = { kind: op.type === '*' ? 'unit-mul' : 'unit-div', left, right, span: spanOf(left, right) };
    }
    return left;
  }

  /**
   * One unit with optional powers. `explicit` means the user marked it as a
   * unit ([...] or | target), so no ambiguity warning is needed.
   */
  private parseUnitFactor(explicit: boolean): UnitExpr {
    const token = this.peek();
    let base: UnitExpr;
    if (token.type === 'number' && token.value === 1) {
      this.next();
      base = { kind: 'unit-one', span: token.span };
    } else if (token.type === '(') {
      this.next();
      base = this.parseUnitExpr(explicit);
      this.expect(')', ')');
    } else if (token.type === 'ident') {
      this.next();
      if (!this.isUnit(token.text)) fail('E-UNKNOWN-UNIT', token.span, { unit: token.text });
      if (!explicit && this.defined.has(token.text) && !this.noted.has(token.text)) {
        this.noted.add(token.text);
        this.diagnostics.push(diagnostic('I-AMBIGUOUS-UNIT', token.span, { name: token.text }));
      }
      base = { kind: 'unit-name', name: token.text, span: token.span };
    } else {
      fail('E-SYNTAX', token.span, { expected: 'unit', found: token.text || 'end-of-line' });
    }
    return this.parseUnitPowers(base);
  }

  private parseUnitPowers(base: UnitExpr): UnitExpr {
    let unit = base;
    for (;;) {
      const token = this.peek();
      if (token.type === 'superscript') {
        this.next();
        unit = { kind: 'unit-pow', base: unit, exponent: token.value, span: spanOf(unit, token) };
      } else if (token.type === '^') {
        this.next();
        const negative = this.peek().type === '-' ? (this.next(), true) : false;
        const exp = this.expect('number', 'exponent');
        unit = { kind: 'unit-pow', base: unit, exponent: negative ? -exp.value : exp.value, span: spanOf(unit, exp) };
      } else {
        return unit;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private binary(operator: BinaryOperator, left: Expr, right: Expr): Expr {
    return { kind: 'binary', operator, left, right, span: spanOf(left, right) };
  }

  private startsOperand(token: Token): boolean {
    if (token.type === 'ident') return !CONTINUATION_KEYWORDS.has(token.text);
    return token.type === 'number' || token.type === '(' || token.type === '[' || token.type === '√' || token.type === '∛' || token.type === 'string' || token.type === 'date';
  }

  private isKeyword(word: string): boolean {
    const token = this.peek();
    return token.type === 'ident' && token.text === word;
  }

  /** Names given as "name:" in the parentheses that start here, at their own level (not in nested calls). */
  private namesAhead(): string[] {
    const names: string[] = [];
    let depth = 0;
    for (let i = this.pos; i < this.tokens.length; i++) {
      const token = this.tokens[i]!;
      if (token.type === '(' || token.type === '[') depth++;
      else if (token.type === ')' || token.type === ']') {
        if (depth === 0) break;
        depth--;
      } else if (token.type === 'newline' && depth === 0) break;
      else if (depth === 0 && token.type === 'ident' && this.tokens[i + 1]?.type === ':') names.push(token.text);
      // The variable as the last argument: roots(p, x), integral(y^2, dS), sum(F_i·a_i, i).
      else if (depth === 0 && token.type === 'ident' && this.tokens[i - 1]?.type === ',' && this.tokens[i + 1]?.type === ')') names.push(token.text);
    }
    return names;
  }

  /**
   * fit(T, x: Mereni.t, form: [1, t, sin(t)]): the functions of the form are written in the name of the column
   * of x (t), a name there, not a unit (t would be tonnes). Nothing without a form.
   */
  private formVariableAhead(): string[] {
    let depth = 0;
    let inX = false;
    let last: string | undefined;
    let form = false;
    for (let i = this.pos; i < this.tokens.length; i++) {
      const token = this.tokens[i]!;
      if (token.type === '(' || token.type === '[') depth++;
      else if (token.type === ')' || token.type === ']') {
        if (depth === 0) break;
        depth--;
      } else if (token.type === 'newline' && depth === 0) break;
      else if (depth === 0 && token.type === ',') inX = false;
      else if (depth === 0 && token.type === 'ident' && this.tokens[i + 1]?.type === ':') {
        inX = token.text === 'x';
        form ||= token.text === 'form';
        i++;
      } else if (inX && token.type === 'ident') last = token.text;
    }
    return form && last ? [last] : [];
  }

  private peek(ahead = 0): Token {
    return this.tokens[this.pos + ahead] ?? this.end;
  }

  private next(): Token {
    const token = this.peek();
    if (token !== this.end) this.pos++;
    return token;
  }

  private expect(type: TokenType, expected: string): Token {
    const token = this.peek();
    if (token.type !== type) fail('E-SYNTAX', token.span, { expected, found: token.text || 'end-of-line' });
    return this.next();
  }

  private expectEnd(): void {
    const token = this.peek();
    if (token.type !== 'eof') fail('E-SYNTAX', token.span, { expected: 'end-of-line', found: token.text });
  }
}

/** Where a picture or a chart stands among the lines ("width=40% wrap=right dx=6% dy=8mm"). */
export interface Placement {
  /** Share of the text width in percent; absent for the picture's own size. */
  readonly width?: number;
  /** Beside the lines that follow it (up to a blank line or a heading) instead of centred. */
  readonly side?: 'left' | 'right';
  /** On this side with the lines flowing around it: beside it down to its bottom, full width below. */
  readonly wrap?: 'left' | 'right';
  /** At the left or right edge, alone on its lines (no text beside it); centred without it. */
  readonly align?: 'left' | 'right';
  /** A wrapped picture placed freely: this far from its edge, in percent of the text width. */
  readonly dx?: number;
  /** A wrapped picture placed freely: this far below the line it belongs to, in millimetres. */
  readonly dy?: number;
  /** Never flowed around ("wrap=none"): alone on its lines, dragging only moves it between them. */
  readonly noWrap?: boolean;
  /** A chart's height to its width (ratio=0.6): set by dragging its edge, the width staying. */
  readonly ratio?: number;
}

export interface PictureLine extends Placement {
  readonly caption: string;
  readonly path: string;
  /** alt="…": what the picture shows, in words, for a reader who cannot see it (the AI); not printed. */
  readonly description?: string;
}

const PICTURE = /^!\[([^\]]*)\]\(([^()\s]+)\)\s*(?:\{([^}]*)\})?$/;

/** "![Schéma](images/sheet/a.png){width=40% side=right}" -> its parts; undefined when malformed. */
/**
 * The sources after a text line, "…" [T1] or [ST:T1][T2]: section ids of the
 * sheet's sources or of a theory library. Anything else is not a citation.
 */
function citationsOf(tokens: readonly Token[]): string[] | undefined {
  const cites: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i]!.type !== '[') return undefined;
    const parts: string[] = [];
    i++;
    while (i < tokens.length && tokens[i]!.type !== ']') {
      const t = tokens[i]!;
      const expected = parts.length % 2 === 0 ? 'ident' : ':';
      if (t.type !== expected) return undefined;
      parts.push(t.text);
      i++;
    }
    if (i >= tokens.length || parts.length % 2 === 0) return undefined;
    cites.push(parts.join(''));
    i++;
  }
  return cites.length > 0 ? cites : undefined;
}

export function parsePicture(text: string): PictureLine | undefined {
  const match = PICTURE.exec(text.trim());
  if (!match) return undefined;
  // The description first: its words are not options of the placement.
  const options = match[3] ?? '';
  const description = /(?:^|\s)alt="([^"]*)"/.exec(options)?.[1];
  const placement = parsePlacement(options.replace(/(?:^|\s)alt="[^"]*"/, ' '));
  return placement ? { caption: match[1]!.trim(), path: match[2]!, ...placement, ...(description ? { description } : {}) } : undefined;
}

/** "width=40% wrap=right dx=6% dy=8mm" -> the placement; undefined when malformed. */
export function parsePlacement(text: string): Placement | undefined {
  let width: number | undefined;
  let side: 'left' | 'right' | undefined;
  let wrap: 'left' | 'right' | undefined;
  let align: 'left' | 'right' | undefined;
  let dx: number | undefined;
  let dy: number | undefined;
  let noWrap = false;
  let ratio: number | undefined;
  for (const option of text.split(/[\s,;]+/).filter(Boolean)) {
    const ratioOption = /^ratio=(\d+(?:\.\d+)?)$/.exec(option);
    if (ratioOption && ratio === undefined) {
      ratio = Number(ratioOption[1]);
      continue;
    }
    const widthOption = /^width=(\d+(?:\.\d+)?)%$/.exec(option);
    const placeOption = /^(side|wrap|align)=(left|right)$/.exec(option);
    const dxOption = /^dx=(\d+(?:\.\d+)?)%$/.exec(option);
    const dyOption = /^dy=(\d+(?:\.\d+)?)mm$/.exec(option);
    if (widthOption && width === undefined) width = Number(widthOption[1]);
    else if (option === 'wrap=none' && !noWrap) noWrap = true;
    else if (dxOption && dx === undefined) dx = Number(dxOption[1]);
    else if (dyOption && dy === undefined) dy = Number(dyOption[1]);
    else if (placeOption && side === undefined && wrap === undefined && align === undefined) {
      const at = placeOption[2] as 'left' | 'right';
      if (placeOption[1] === 'side') side = at;
      else if (placeOption[1] === 'wrap') wrap = at;
      else align = at;
    } else return undefined;
  }
  if (width !== undefined && !(width > 0 && width <= 100)) return undefined;
  // An offset places a wrapped picture; without the flow around it, it means nothing.
  if ((dx !== undefined || dy !== undefined) && !wrap) return undefined;
  if (dx !== undefined && dx > 100) return undefined;
  if (noWrap && (side || wrap)) return undefined;
  if (ratio !== undefined && !(ratio >= 0.1 && ratio <= 3)) return undefined;
  return { ...(ratio !== undefined ? { ratio } : {}), ...(width !== undefined ? { width } : {}), ...(side ? { side } : {}), ...(wrap ? { wrap } : {}), ...(align ? { align } : {}), ...(dx ? { dx } : {}), ...(dy ? { dy } : {}), ...(noWrap ? { noWrap } : {}) };
}

/** The options of a placement, as parsePlacement reads them; empty for the default. */
export function formatPlacement(placement: Placement): string {
  return [
    placement.width === undefined ? '' : `width=${Math.round(placement.width)}%`,
    placement.side ? `side=${placement.side}` : '',
    placement.wrap ? `wrap=${placement.wrap}` : '',
    placement.align ? `align=${placement.align}` : '',
    placement.noWrap && !placement.wrap && !placement.side ? 'wrap=none' : '',
    placement.wrap && placement.dx ? `dx=${Math.round(placement.dx)}%` : '',
    placement.wrap && placement.dy ? `dy=${Math.round(placement.dy)}mm` : '',
    placement.ratio === undefined ? '' : `ratio=${Math.round(placement.ratio * 100) / 100}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The line of a picture, as parsePicture reads it. */
export function formatPicture(picture: PictureLine): string {
  const description = picture.description?.replace(/["{}\n]/g, ' ').replace(/\s+/g, ' ').trim();
  const options = [formatPlacement(picture), description ? `alt="${description}"` : ''].filter(Boolean).join(' ');
  return `![${picture.caption.replace(/[\[\]\n]/g, ' ').trim()}](${picture.path})${options ? `{${options}}` : ''}`;
}
