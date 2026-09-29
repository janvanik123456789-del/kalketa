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
import type { BinaryOperator, Expr, Sheet, Statement, UnitExpr } from './ast.js';
import { tokenize, type Token, type TokenType } from './lexer.js';

export interface ParseOptions {
  /** Tells whether a name is a known unit symbol. */
  readonly isUnit: (name: string) => boolean;
}

export interface ParseResult {
  readonly sheet: Sheet;
  readonly diagnostics: Diagnostic[];
}

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false', 'check', 'source', 'solve', 'in', 'guess', 'dimension', 'unit']);
const UNSUPPORTED_STATEMENTS: Readonly<Record<string, string>> = {
  check: 'check',
  solve: 'solve',
  dimension: 'dimension',
  unit: 'unit-definition',
};
const COMPARISONS: ReadonlySet<TokenType> = new Set(['==', '!=', '<', '<=', '>', '>=']);

export function parse(source: string, options: ParseOptions): ParseResult {
  const lexed = tokenize(source);
  const diagnostics: Diagnostic[] = [...lexed.diagnostics];
  const statements: Statement[] = [];
  const defined = new Set<string>();

  for (const line of splitLines(lexed.tokens)) {
    const comments = line.filter((t) => t.type === 'comment');
    const tokens = line.filter((t) => t.type !== 'comment');
    const comment = comments.length > 0 ? comments.map((t) => t.text).join(' ') : undefined;

    if (tokens.length === 0) {
      if (comments.length > 0) statements.push(withComment({ kind: 'comment', span: comments[0]!.span }, comment));
      continue;
    }

    const parser = new LineParser(tokens, options, defined, diagnostics);
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

/** Splits tokens into logical lines. A line continues while brackets are open. */
function splitLines(tokens: readonly Token[]): Token[][] {
  const lines: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.type === 'eof') break;
    if (token.type === '(' || token.type === '[') depth++;
    if ((token.type === ')' || token.type === ']') && depth > 0) depth--;
    if (token.type === 'newline') {
      if (depth > 0) continue;
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

  /** Name on the left of ":=", if the line looks like a definition. */
  definitionName(): string | undefined {
    const [first, second] = this.tokens;
    return first?.type === 'ident' && second?.type === ':=' ? first.text : undefined;
  }

  parseStatement(): Statement {
    const first = this.peek();
    const lineSpan = spanOf(this.tokens[0]!, this.tokens[this.tokens.length - 1]!);

    if (first.type === 'heading') {
      this.next();
      this.expectEnd();
      return { kind: 'heading', level: first.value, text: first.text, span: lineSpan };
    }
    if (first.type === 'directive') {
      const args = this.tokens.slice(1).map((t) => t.text).join(' ');
      return { kind: 'directive', name: first.text, args, span: lineSpan };
    }
    if (first.type === 'string' && this.tokens.length === 1) {
      return { kind: 'text', text: first.text, span: lineSpan };
    }
    if (first.type === 'ident' && first.text in UNSUPPORTED_STATEMENTS && this.peek(1).type !== ':=') {
      fail('E-UNSUPPORTED', first.span, { feature: UNSUPPORTED_STATEMENTS[first.text]! });
    }

    const defineAt = this.tokens.findIndex((t) => t.type === ':=');
    if (defineAt !== -1) return this.parseDefinition(defineAt, lineSpan);
    return this.parseDisplay(lineSpan);
  }

  private parseDefinition(defineAt: number, lineSpan: Span): Statement {
    const nameToken = this.peek();
    if (defineAt !== 1 || nameToken.type !== 'ident') {
      if (nameToken.type === 'ident' && this.peek(1).type === '(') {
        fail('E-UNSUPPORTED', nameToken.span, { feature: 'function-definition' });
      }
      fail('E-SYNTAX', nameToken.span, { expected: 'name', found: nameToken.text });
    }
    if (KEYWORDS.has(nameToken.text)) fail('E-RESERVED', nameToken.span, { name: nameToken.text });
    this.next();
    this.next(); // :=
    const expr = this.parseExpression();
    const target = this.parseTarget();
    this.defined.add(nameToken.text);
    this.expectEnd();
    return {
      kind: 'definition',
      name: nameToken.text,
      nameSpan: nameToken.span,
      expr,
      ...(target ? { target } : {}),
      span: lineSpan,
    };
  }

  private parseDisplay(lineSpan: Span): Statement {
    const expr = this.parseExpression();
    const target = this.parseTarget();
    if (this.peek().type === '=') {
      const eq = this.next();
      if (this.peek().type !== 'eof') {
        // "a = 5": the user meant a definition.
        if (expr.kind === 'variable') fail('E-ASSIGN-WITH-EQUALS', eq.span, { name: expr.name });
        fail('E-SYNTAX', this.peek().span, { expected: 'end of line', found: this.peek().text });
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
      fail('E-SYNTAX', this.peek().span, { expected: 'end of comparison', found: this.peek().text });
    }
    return result;
  }

  private parseAdditive(): Expr {
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
        const name = this.expect('ident', 'member name');
        expr = { kind: 'member', object: expr, name: name.text, span: spanOf(expr, name) };
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
      case '(': {
        this.next();
        const inner = this.parseExpression();
        this.expect(')', ')');
        return inner;
      }
      case '[': {
        const unit = this.parseBracketUnit();
        return { kind: 'unit', unit, span: unit.span };
      }
      case '√': {
        this.next();
        const operand = this.parsePostfix();
        return { kind: 'call', name: 'sqrt', args: [operand], span: spanOf(token, operand) };
      }
      case 'ident':
        return this.parseName();
      default:
        fail('E-SYNTAX', token.span, { expected: 'value', found: token.text || 'end of line' });
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
      if (this.peek().type !== ')') {
        do {
          args.push(this.parseExpression());
        } while (this.peek().type === ',' && this.next());
      }
      const close = this.expect(')', ')');
      return { kind: 'call', name, args, span: spanOf(token, close) };
    }
    if (!this.defined.has(name) && this.options.isUnit(name)) {
      const unit: UnitExpr = { kind: 'unit-name', name, span: token.span };
      return { kind: 'unit', unit, span: token.span };
    }
    return { kind: 'variable', name, span: token.span };
  }

  /** Number with optional unit ("12 kN/m", "5 [m]") or implicit product ("2(a+b)"). */
  private parseNumber(): Expr {
    const token = this.next();
    const next = this.peek();
    if (next.type === '[') {
      const unit = this.parseBracketUnit();
      return { kind: 'number', value: token.value, unit, span: spanOf(token, unit) };
    }
    if (next.type === 'ident' && !KEYWORDS.has(next.text)) {
      if (!this.options.isUnit(next.text)) {
        if (this.defined.has(next.text)) fail('E-MISSING-OPERATOR', next.span, { found: next.text });
        fail('E-UNKNOWN-UNIT', next.span, { unit: next.text });
      }
      const unit = this.parseUnitChain();
      return { kind: 'number', value: token.value, unit, span: spanOf(token, unit) };
    }
    const value: Expr = { kind: 'number', value: token.value, span: token.span };
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
    if (token.type === 'ident' && this.options.isUnit(token.text)) return this.parseUnitFactor(false);
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
      if (!this.options.isUnit(token.text)) fail('E-UNKNOWN-UNIT', token.span, { unit: token.text });
      if (!explicit && this.defined.has(token.text)) {
        this.diagnostics.push(diagnostic('W-AMBIGUOUS-UNIT', token.span, { name: token.text }));
      }
      base = { kind: 'unit-name', name: token.text, span: token.span };
    } else {
      fail('E-SYNTAX', token.span, { expected: 'unit', found: token.text || 'end of line' });
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
    if (token.type === 'ident') return token.text !== 'and' && token.text !== 'or';
    return token.type === 'number' || token.type === '(' || token.type === '[' || token.type === '√' || token.type === 'string';
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
    if (token.type !== type) fail('E-SYNTAX', token.span, { expected, found: token.text || 'end of line' });
    return this.next();
  }

  private expectEnd(): void {
    const token = this.peek();
    if (token.type !== 'eof') fail('E-SYNTAX', token.span, { expected: 'end of line', found: token.text });
  }
}
