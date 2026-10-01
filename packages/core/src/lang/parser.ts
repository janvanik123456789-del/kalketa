/**
 * Parser: tokens -> statements (recursive descent, one statement per line).
 *
 * Operator precedence, lowest first (docs/03-jazyk.md, ch. 5):
 *   or · and · not · comparison · + - · * / · unary - + · ^ (right-assoc)
 *   · postfix (², .member) · primary
 *
 * Units vs. variables (docs/03-jazyk.md, ch. 4.2):
 *   - A name right after a number starts a unit chain ("12 kN/m"). Inside the
 *     chain units win; if the name is also a defined variable we warn.
 *   - A standalone name is a variable when defined above, otherwise a unit.
 *   - "[...]" always contains units.
 *   - Juxtaposed values other than number·unit and number·(...) are an error
 *     ("a b" is never multiplication).
 */

import { CalcError, diagnostic, fail, type Diagnostic, type Span } from '../diagnostics.js';
import type { BinaryOperator, Equation, Expr, NamedArg, Param, Sheet, Statement, UnitExpr } from './ast.js';
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

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false', 'check', 'source', 'solve', 'in', 'guess', 'dimension', 'unit', 'input']);
const UNSUPPORTED_STATEMENTS: Readonly<Record<string, string>> = {};
/** "unit ks: dimensionless" (also "unit ks: 1"). */
export const DIMENSIONLESS_NAME = 'dimensionless';
/** Keywords that may follow a complete expression. */
const CONTINUATION_KEYWORDS = new Set(['and', 'or', 'source', 'in', 'guess']);
const COMPARISONS: ReadonlySet<TokenType> = new Set(['==', '!=', '<', '<=', '>', '>=']);

export function parse(source: string, options: ParseOptions): ParseResult {
  const lexed = tokenize(source);
  const diagnostics: Diagnostic[] = [...lexed.diagnostics];
  const statements: Statement[] = [];
  const defined = new Set<string>(options.predefined ?? []);
  // The sheet's own units, known from their "unit" line on.
  const units = new Set<string>();

  for (const line of splitLines(lexed.tokens)) {
    const comments = line.filter((t) => t.type === 'comment');
    const tokens = line.filter((t) => t.type !== 'comment');
    const comment = comments.length > 0 ? comments.map((t) => t.text).join(' ') : undefined;

    if (tokens.length === 0) {
      if (comments.length > 0) statements.push(withComment({ kind: 'comment', span: comments[0]!.span }, comment));
      continue;
    }

    const parser = new LineParser(tokens, options, defined, diagnostics, units);
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
    statements.push(withComment(statement, comment));
  }

  return { sheet: { statements }, diagnostics };
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

  constructor(
    private readonly tokens: readonly Token[],
    private readonly options: ParseOptions,
    private readonly defined: Set<string>,
    private readonly diagnostics: Diagnostic[],
    private readonly units: Set<string>,
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
    const [first, second] = input?.type === 'ident' && input.text === 'input' ? rest : this.tokens;
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
    if (first.type === 'ident' && first.text === 'check' && this.peek(1).type !== ':=') {
      return this.parseCheck(lineSpan);
    }
    if (first.type === 'ident' && first.text === 'solve' && this.peek(1).type !== ':=') {
      return this.parseSolve(lineSpan);
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
    if (defineAt !== -1) return this.parseDefinition(defineAt, lineSpan);
    return this.parseDisplay(lineSpan);
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
    this.expectEnd();
    return {
      kind: 'definition',
      name: nameToken.text,
      nameSpan: nameToken.span,
      expr,
      ...(target ? { target } : {}),
      ...(params ? { params } : {}),
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
    let source: string | undefined;
    if (this.isKeyword('source')) {
      this.next();
      source = this.expect('string', 'text').text;
    }
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
    if (this.peek().type === '(') {
      this.next();
      do unknown();
      while (this.peek().type === ',' && this.next());
      this.expect(')', ')');
    } else {
      unknown();
    }
    this.expect(':', ':');
    // The unknowns are names from here on, even where they spell a unit (t, s).
    unknowns.forEach((u) => this.defined.add(u.name));

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
      if (eq.type !== '==' && eq.type !== '=') fail('E-SYNTAX', eq.span, { expected: '==', found: eq.text || 'end-of-line' });
      this.next();
      const right = this.parseAdditive();
      equations.push({ left, right, span: spanOf(left, right) });
      const after = this.peek();
      if (after.type !== ',' && after.type !== 'newline' && after.type !== 'eof' && !this.isKeyword('in') && !this.isKeyword('guess')) {
        fail('E-SYNTAX', after.span, { expected: 'end-of-line', found: after.text });
      }
    }
    if (equations.length === 0) fail('E-SYNTAX', this.end.span, { expected: '==', found: 'end-of-line' });
    if (range && unknowns.length !== 1) fail('E-SYNTAX', range.low.span, { expected: 'guess', found: 'in' });
    return { kind: 'solve', unknowns, equations, ...(range ? { range } : {}), guesses, span: lineSpan };
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
    while (this.peek().type === '+' || this.peek().type === '-') {
      const op = this.next().type as '+' | '-';
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
    if (type === '-' || type === '+') {
      const op = this.next();
      const operand = this.parseUnary();
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
        // CF[1]: an item of a series.
        this.next();
        const index = this.parseExpression();
        const close = this.expect(']', ']');
        expr = { kind: 'index', object: expr, index, span: spanOf(expr, close) };
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
        if (next.type === 'ident' && !KEYWORDS.has(next.text) && !this.defined.has(next.text) && this.isUnit(next.text)) {
          const unit = this.parseUnitChain();
          const factor: Expr = { kind: 'unit', unit, span: unit.span };
          return { kind: 'binary', operator: '*', left: inner, right: factor, span: spanOf(token, unit) };
        }
        void close;
        return inner;
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
      case '√': {
        this.next();
        const operand = this.parsePostfix();
        return { kind: 'call', name: 'sqrt', args: [operand], named: [], span: spanOf(token, operand) };
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

    if (this.peek().type === '(') {
      this.next();
      const args: Expr[] = [];
      const named: NamedArg[] = [];
      if (this.peek().type !== ')') {
        do {
          if (this.peek().type === 'ident' && this.peek(1).type === ':') {
            const label = this.next();
            this.next();
            if (named.some((n) => n.name === label.text)) fail('E-NAMED-ARG', label.span, { function: name, argument: label.text, problem: 'duplicate' });
            named.push({ name: label.text, nameSpan: label.span, value: this.parseExpression() });
          } else {
            if (named.length > 0) fail('E-NAMED-ARG', this.peek().span, { function: name, argument: '', problem: 'positional-after-named' });
            args.push(this.parseExpression());
          }
        } while (this.peek().type === ',' && this.next());
      }
      const close = this.expect(')', ')');
      return { kind: 'call', name, args, named, span: spanOf(token, close) };
    }
    if (!this.defined.has(name) && this.isUnit(name)) {
      const unit: UnitExpr = { kind: 'unit-name', name, span: token.span };
      return { kind: 'unit', unit, span: token.span };
    }
    return { kind: 'variable', name, span: token.span };
  }

  /** [a, b, c] with an optional unit after it: [100, 120] CZK. */
  private parseVector(): Expr {
    const open = this.next();
    const items: Expr[] = [];
    if (this.peek().type !== ']') {
      do items.push(this.parseExpression());
      while (this.peek().type === ',' && this.next());
    }
    const close = this.expect(']', ']');
    const vector: Expr = { kind: 'vector', items, span: spanOf(open, close) };
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
      if (!explicit && this.defined.has(token.text)) {
        this.diagnostics.push(diagnostic('W-AMBIGUOUS-UNIT', token.span, { name: token.text }));
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
    return token.type === 'number' || token.type === '(' || token.type === '[' || token.type === '√' || token.type === 'string' || token.type === 'date';
  }

  private isKeyword(word: string): boolean {
    const token = this.peek();
    return token.type === 'ident' && token.text === word;
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

export interface PictureLine {
  readonly caption: string;
  readonly path: string;
  /** Share of the text width in percent; absent for the picture's own size. */
  readonly width?: number;
  /** Beside the lines that follow it (up to a blank line or a heading) instead of centred. */
  readonly side?: 'left' | 'right';
  /** On this side with the lines flowing around it: beside it down to its bottom, full width below. */
  readonly wrap?: 'left' | 'right';
  /** At the left or right edge, alone on its lines (no text beside it); centred without it. */
  readonly align?: 'left' | 'right';
}

const PICTURE = /^!\[([^\]]*)\]\(([^()\s]+)\)\s*(?:\{([^}]*)\})?$/;

/** "![Schéma](images/sheet/a.png){width=40% side=right}" -> its parts; undefined when malformed. */
export function parsePicture(text: string): PictureLine | undefined {
  const match = PICTURE.exec(text.trim());
  if (!match) return undefined;
  let width: number | undefined;
  let side: 'left' | 'right' | undefined;
  let wrap: 'left' | 'right' | undefined;
  let align: 'left' | 'right' | undefined;
  for (const option of (match[3] ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const widthOption = /^width=(\d+(?:\.\d+)?)%$/.exec(option);
    const placeOption = /^(side|wrap|align)=(left|right)$/.exec(option);
    if (widthOption && width === undefined) width = Number(widthOption[1]);
    else if (placeOption && side === undefined && wrap === undefined && align === undefined) {
      const at = placeOption[2] as 'left' | 'right';
      if (placeOption[1] === 'side') side = at;
      else if (placeOption[1] === 'wrap') wrap = at;
      else align = at;
    } else return undefined;
  }
  if (width !== undefined && !(width > 0 && width <= 100)) return undefined;
  return { caption: match[1]!.trim(), path: match[2]!, ...(width !== undefined ? { width } : {}), ...(side ? { side } : {}), ...(wrap ? { wrap } : {}), ...(align ? { align } : {}) };
}

/** The line of a picture, as parsePicture reads it. */
export function formatPicture(picture: PictureLine): string {
  const options = [picture.width === undefined ? '' : `width=${Math.round(picture.width)}%`, picture.side ? `side=${picture.side}` : '', picture.wrap ? `wrap=${picture.wrap}` : '', picture.align ? `align=${picture.align}` : ''].filter(Boolean);
  return `![${picture.caption.replace(/[\[\]\n]/g, ' ').trim()}](${picture.path})${options.length ? `{${options.join(' ')}}` : ''}`;
}
