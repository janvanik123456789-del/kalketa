/**
 * How each built-in function is written in Kalketa: an example in the notation of the sheet (decimal point,
 * comma between arguments; shown in the user's notation), the same for every language. Help (F1) shows it with
 * the value it gives; the Details pane shows the signature and the example of the functions of the line.
 * A test computes every example.
 */

import { builtinFunctions, signature, toDecimalComma, type FunctionDef } from '@kalketa/core';
import { CATALOGS, type Catalog } from '@kalketa/i18n';

const PROFILES = `table Profily:
    | profil | A [cm²] | W_y [cm³] |
    | IPE 160 | 20.1 | 109 |
    | IPE 180 | 23.9 | 146 |
    | IPE 200 | 28.5 | 194 |
    | IPE 220 | 33.4 | 252 |
`;

const NTC = `table NTC:
    | T [°C] | R [kΩ] |
    | 0 | 33.62 |
    | 20 | 12.54 |
    | 40 | 5.301 |
`;

const MEASURED = `table Mereni:
    | t [s] | T [°C] |
    | 0 | 20.1 |
    | 10 | 25.3 |
    | 20 | 29.8 |
    | 30 | 33.9 |
`;

/** The example of each function: lines of a sheet, the last one using it. */
export const FUNCTION_EXAMPLES: Readonly<Record<string, string>> = {
  abs: 'abs(-3.5 kN)',
  cbrt: 'cbrt(-27)',
  ceil: 'n := ceil(6.2 m / 2.5 m)',
  exp: 'exp(1)',
  factorial: 'factorial(5)',
  floor: 'floor(-2.3)',
  hypot: 'hypot(3 m, 4 m)',
  parallel: 'R_1 := 2 kΩ\nR_2 := 3 kΩ\nR := R_1 ∥ R_2\nR_3 := parallel(R_1, R_2, 6 kΩ)',
  ln: 'ln(2.5 MPa / 1 MPa)',
  log: 'log(8, 2)',
  log10: 'log10(1000)',
  max: 'max(12 kN, 9.5 kN, 14 kN)',
  min: 'min([3.2, 1.8, 2.5] m)',
  mod: 'mod(370°, 360°)',
  root: 'root(16, 4)',
  round: 'round(3.14159, 2)',
  sign: 'sign(-4 kN)',
  sqrt: 'sqrt(9 m^2)',
  acos: 'acos(0.5) | °',
  acosh: 'acosh(2)',
  asin: 'asin(0.5) | °',
  asinh: 'asinh(1)',
  atan: 'atan(1) | °',
  atan2: 'atan2(4 m, -3 m) | °',
  atanh: 'atanh(0.5)',
  cos: 'cos(60°)',
  cosh: 'cosh(1)',
  cot: 'cot(45°)',
  cotg: 'cotg(45°)',
  sin: 'sin(30°)',
  sinh: 'sinh(1)',
  tan: 'tan(45°)',
  tanh: 'tanh(1)',
  tg: 'tg(45°)',
  derivative: 'f(x) := x^3\nderivative(f(x), x: 2)',
  fit: `${MEASURED}T_fit := fit(Mereni.T, x: Mereni.t, kind: "linear")\nT_fit(15 s)`,
  integral: 'q := 12 kN/m\nintegral(q·x/6 m, x: 0 m .. 6 m)',
  maximize: 'f(x) := x·(4 - x)\nx_max := maximize(f(x), x: 0 .. 4)',
  minimize: 'f(x) := (x - 2)^2 + 1\nx_min := minimize(f(x), x: 0 .. 5)',
  polyfit: 'X := [1, 2, 3, 4]\nY := [2.1, 3.9, 6.2, 7.8]\nP := polyfit(X, Y, 1)\nP(5)',
  polyval: 'polyval([1, 0, -2], 3)',
  roots: 'roots(x^3 - 6·x^2 + 11·x - 6, x)',
  col: 'A := [1, 2 | 3, 4]\ncol(A, 2)',
  cols: 'cols([1, 2, 3 | 4, 5, 6])',
  cross: 'r := [0.5, 0, 0] m\nF := [0, 10, 0] kN\ncross(r, F)',
  det: 'det([2, 1 | 1, 3])',
  diag: 'diag([1, 2, 3])',
  dot: 'F := [3, 4] kN\ns := [2, 0] m\ndot(F, s)',
  eigenvals: 'K := [2, -1 | -1, 2]\neigenvals(K)',
  eigenvecs: 'K := [2, -1 | -1, 2]\neigenvecs(K)',
  identity: 'identity(3)',
  inverse: 'inverse([2, 1 | 1, 3])',
  lsolve: 'K := [4, -2 | -2, 4] kN/m\nF := [2, 0] kN\nlsolve(K, F)',
  norm: 'norm([3, 4] m)',
  row: 'A := [1, 2 | 3, 4]\nrow(A, 1)',
  rows: 'rows([1, 2 | 3, 4 | 5, 6])',
  trace: 'trace([1, 2 | 3, 4])',
  transpose: 'transpose([1, 2 | 3, 4])',
  arg: 'arg(3 + 4j) | °',
  conj: 'conj(3 + 4j)',
  im: 'im(3 + 4j)',
  polar: 'U := polar(230 V, 30°)',
  re: 're(3 + 4j)',
  cumsum: 'cumsum([1, 2, 3, 4] kN)',
  interp1: 'interp1([0, 10, 20], [1.0, 1.5, 3.0], 15)',
  len: 'len([4, 8, 15, 16])',
  pchip: 'pchip([0, 1, 2, 3], [0, 1, 1, 2], 1.5)',
  range: 'range(0 m, 2 m, 0.5 m)',
  spline: 'spline([0, 1, 2, 3], [0, 1, 8, 27], 1.5)',
  sum: 'sum([1.2, 3.4, 2.0] kN)',
  mean: 'mean([12, 15, 11, 14] MPa)',
  median: 'median([12, 15, 11, 14, 40] MPa)',
  stdev: 'stdev([12, 15, 11, 14] MPa)',
  normcdf: 'normcdf(1.96)',
  norminv: 'norminv(0.975)',
  tcdf: 'tcdf(2.08, 21)',
  tinv: 'tinv(0.975, 21)',
  chi2cdf: 'chi2cdf(8.53, 3)',
  chi2inv: 'chi2inv(0.95, 3)',
  fcdf: 'fcdf(0.42, 3, 24)',
  finv: 'finv(0.95, 3, 24)',
  nchoosek: 'nchoosek(8, 3)',
  binopdf: 'binopdf(3, 8, 0.49)',
  binocdf: 'binocdf(2, 8, 0.49)',
  poisspdf: 'poisspdf(2, 1.5)',
  poisscdf: 'poisscdf(2, 1.5)',
  irr: 'CF := [-1000, 300, 400, 500] Kč\nirr(CF) | %',
  npv: 'CF := [-1000, 300, 400, 500] Kč\nnpv(5 %, CF)',
  payback: 'CF := [-1000, 300, 400, 500] Kč\npayback(CF)',
  pmt: 'pmt(5 % / 12, 240, 2000000 Kč)',
  date: 'date(2026, 10, 21) + 30 d',
  day: 'day(2026-10-21)',
  days360: 'n := days360(2022-03-20, 2022-12-31)\nn_A := days360(2022-01-31, 2022-03-31, "30A/360")',
  month: 'month(2026-10-21)',
  year: 'year(2026-10-21)',
  if: 'F := 12 kN\nγ := if(F > 10 kN, 1.5, 1.35)',
  compare: 'table Varianty: {variants=B}\n    | varianta | b [mm] | h [mm] |\n    | A        | 200    | 300    |\n    | B        | 250    | 400    |\nM := 120 kN·m\nσ := M/(b·h^2/6) | MPa\ncheck σ ≤ 20 MPa\ncompare(Varianty, σ)',
  filter: `${PROFILES}max(filter(Profily, where: r.A < 30 cm²).W_y)`,
  find_max: `${PROFILES}find_max(Profily, by: W_y, where: r.A < 30 cm²).profil`,
  find_min: `${PROFILES}W_pot := 150 cm³\nfind_min(Profily, by: A, where: r.W_y >= W_pot).profil`,
  interpolate: `${NTC}interpolate(NTC, T: 25 °C).R`,
  pick: `${PROFILES}pick(Profily, "IPE 200").W_y`,
  plot: 'plot(sin(x), cos(x), x: 0 .. 2·π)',
};

/**
 * The lines that are no functions but have their help beside them: the keyword they start with (source stands
 * at the end of a line).
 */
export const STATEMENTS = ['solve', 'derive', 'relation', 'check', 'source', 'table', 'unit', 'dimension', 'input'] as const;
export type StatementKeyword = (typeof STATEMENTS)[number];

/** How each such line is written, and its example (computed by a test as the functions' ones). */
export const STATEMENT_SYNTAX: Readonly<Record<StatementKeyword, string>> = {
  solve: 'solve x: a == b',
  derive: 'derive a == b == …',
  relation: 'relation a == b {eq=…}',
  check: 'check "…": a ≤ b',
  source: '… source "…"',
  table: 'table T: | x [m] | y [kN] |',
  unit: 'unit u := 25 CZK',
  dimension: 'dimension D',
  input: 'input a := 5 m',
};
export const STATEMENT_EXAMPLES: Readonly<Record<StatementKeyword, string>> = {
  solve: 'F := 12 kN\nk := 3 kN/cm\nsolve x: k·x == F',
  derive: 'derive (a + b)^2 == (a + b)·(a + b) == a^2 + 2·a·b + b^2',
  relation: 'relation x^2 + y^2 == r^2 {eq=Kruh}\nx := 3 m\nr := 5 m\nsolve y ∈ ℝ, y > 0: Kruh',
  check: 'σ := 193 MPa\nf_y := 235 MPa\ncheck "Ohyb": σ ≤ f_y source "EN 1993-1-1, 6.2.5"',
  source: 'G_k := 20 kN·m\nM_Ed := 1.35·G_k source "EN 1990, 6.10"',
  table: 'table Mereni:\n    | t [s] | T [°C] |\n    | 0 | 20.1 |\n    | 10 | 25.3 |\nT_max := max(Mereni.T)',
  unit: 'unit ks: dimensionless\nunit EUR := 25 CZK\nc := 4 ks · 120 EUR | CZK',
  dimension: 'dimension Body\nunit bod: Body\nunit cent := bod/100\ns := 3 bod + 50 cent',
  input: 'input l_n := 5 m\ninput q := 12 kN/m\nM := q·l_n^2/8 | kN·m',
};

const isStatement = (name: string): name is StatementKeyword => (STATEMENTS as readonly string[]).includes(name);

/** How a function or a line is written: its signature in the user's notation, its sentence and its example. */
export interface HowToWrite {
  readonly name: string;
  readonly signature: string;
  readonly summary: string;
  readonly details: string;
  readonly example: string;
  /** The example without the tables it reads, for the Details pane. */
  readonly shortExample: string;
}

const text = (catalog: Catalog, key: 'functions' | 'functionDetails', name: string) => catalog[key][name] ?? CATALOGS['en']?.[key][name] ?? '';

export function howToWrite(def: FunctionDef, catalog: Catalog, decimalComma: boolean): HowToWrite {
  const example = FUNCTION_EXAMPLES[def.name] ?? '';
  const notation = (s: string) => (decimalComma ? toDecimalComma(s) : s);
  return {
    name: def.name,
    signature: signature(def, decimalComma ? ';' : ','),
    summary: text(catalog, 'functions', def.name),
    details: text(catalog, 'functionDetails', def.name),
    example: notation(example),
    shortExample: notation(example.replace(/^table[^\n]*\n(?:[ \t]+\|[^\n]*\n)*/gm, '')),
  };
}

/** The help of a function or of a line (solve, derive, relation) by its name; undefined for any other name. */
export function helpOf(name: string, catalog: Catalog, decimalComma: boolean): HowToWrite | undefined {
  const def = builtinFunctions.get(name);
  if (def) return howToWrite(def, catalog, decimalComma);
  if (!isStatement(name)) return undefined;
  const words = catalog.statementHelp[name] ?? CATALOGS['en']?.statementHelp[name];
  const example = decimalComma ? toDecimalComma(STATEMENT_EXAMPLES[name]) : STATEMENT_EXAMPLES[name];
  return { name, signature: STATEMENT_SYNTAX[name], summary: words?.summary ?? '', details: words?.details ?? '', example, shortExample: example };
}

/** The keyword of a line that is no function (solve, check, table …), if it starts with one. */
export function statementOfLine(line: string): StatementKeyword | undefined {
  const word = /^\s*([a-z]+)\b/.exec(line)?.[1];
  return word && word !== 'source' && isStatement(word) ? word : undefined;
}

/** Whether a line names its source: … source "EN 1990, 6.10" (outside other texts). */
function citesSource(line: string): boolean {
  // Texts emptied (their quotes kept), so a word source inside one does not count.
  return /(?<![\p{L}\p{N}_])source\s+"/u.test(line.replace(/"[^"\n]*"/g, (s) => `"${' '.repeat(s.length - 2)}"`));
}

/**
 * What the help of a line is about, by name: the function at the cursor first (while typing), then the kind of
 * line (solve …), then the other functions it calls.
 */
export function helpNamesOfLine(line: string, cursor?: number): string[] {
  const atCursor = cursor !== undefined ? functionAtCursor(line, cursor)?.name : undefined;
  const statement = statementOfLine(line);
  const names = [...(atCursor ? [atCursor] : []), ...(statement ? [statement] : []), ...functionsOfLine(line).map((d) => d.name), ...(citesSource(line) ? ['source'] : [])];
  return [...new Set(names)];
}

/** The built-in functions a line calls, in order, each once: what the Details pane explains for it. */
export function functionsOfLine(line: string): FunctionDef[] {
  const found: FunctionDef[] = [];
  // Names before "(", outside text in quotes.
  for (const m of line.replace(/"[^"\n]*"/g, '').matchAll(/([\p{L}_][\p{L}\p{N}_]*)\s*\(/gu)) {
    const def = builtinFunctions.get(m[1]!);
    if (def && !found.includes(def)) found.push(def);
  }
  return found;
}

/** The built-in function whose call the cursor is in (the innermost open one), or the name being typed. */
export function functionAtCursor(line: string, cursor: number): FunctionDef | undefined {
  const before = line.slice(0, cursor).replace(/"[^"\n]*"/g, (s) => ' '.repeat(s.length));
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === ')') depth++;
    else if (ch === '(') {
      if (depth > 0) depth--;
      else {
        const name = /([\p{L}_][\p{L}\p{N}_]*)\s*$/u.exec(before.slice(0, i))?.[1];
        const def = name ? builtinFunctions.get(name) : undefined;
        if (def) return def;
      }
    }
  }
  const typed = /([\p{L}_][\p{L}\p{N}_]*)$/u.exec(before)?.[1];
  return typed ? builtinFunctions.get(typed) : undefined;
}
