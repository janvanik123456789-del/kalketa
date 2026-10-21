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
  irr: 'CF := [-1000, 300, 400, 500] Kč\nirr(CF) | %',
  npv: 'CF := [-1000, 300, 400, 500] Kč\nnpv(5 %, CF)',
  payback: 'CF := [-1000, 300, 400, 500] Kč\npayback(CF)',
  pmt: 'pmt(5 % / 12, 240, 2000000 Kč)',
  date: 'date(2026, 10, 21) + 30 d',
  day: 'day(2026-10-21)',
  month: 'month(2026-10-21)',
  year: 'year(2026-10-21)',
  if: 'F := 12 kN\nγ := if(F > 10 kN, 1.5, 1.35)',
  filter: `${PROFILES}max(filter(Profily, where: r.A < 30 cm²).W_y)`,
  find_max: `${PROFILES}find_max(Profily, by: W_y, where: r.A < 30 cm²).profil`,
  find_min: `${PROFILES}W_pot := 150 cm³\nfind_min(Profily, by: A, where: r.W_y >= W_pot).profil`,
  interpolate: `${NTC}interpolate(NTC, T: 25 °C).R`,
  pick: `${PROFILES}pick(Profily, "IPE 200").W_y`,
  plot: 'plot(sin(x), cos(x), x: 0 .. 2·π)',
};

/** How a function is written: its signature in the user's notation, its sentence and its example. */
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
