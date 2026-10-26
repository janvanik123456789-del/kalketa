/**
 * The help of each built-in function in English (Help → Functions, F1): what its arguments are, what unit the
 * result has and what to watch for. The one sentence of the function is in en.ts (functions); the example
 * in the notation of the sheet is in the editor (functionHelp.ts), the same for every language.
 */
/** The lines that are no functions: solve, derive, relation. */
export const EN_STATEMENT_HELP: Readonly<Record<string, { readonly summary: string; readonly details: string }>> = {
  solve: {
    summary: 'Solves an equation or a system: solve x: k·x == F finds the x at which both sides are equal. The unknown is then a value of the sheet.',
    details:
      'The equation is written with ==. More unknowns and equations are separated by commas: solve (x, y): x + y == 1, x - y == 0. in a .. b limits the search to an interval, guess x = 1 m gives a first guess (and with it the unit). With a domain ∈ ℝ, ℂ, ℕ, ℕ₀ or ℤ (the ℝ▾ button) and conditions after a comma (solve x ∈ ℝ, x > 0: …) it writes out every root as on paper, a quadratic with its discriminant, and marks those that fail; two roots are then x_1 and x_2. solve w(x): … solves a differential equation, solve y: Circle the equation of a named relation. Written by the solve button of the Functions toolbar.',
  },
  derive: {
    summary: 'Derives a formula step by step: derive a == b == c checks that each step follows from the one before, as a teacher would.',
    details:
      'Steps are separated by ==; the program compares them for general values and marks a right step as checked, a wrong one as an error. ≐ marks a step that holds only approximately (small angles: sin(γ) ≐ γ). derive M := … == … names the resulting formula, so it can be used further. Steps may start from relations above the line. Written by the a=b button of the Functions toolbar.',
  },
  relation: {
    summary: 'An equation that holds: a physical law or a geometric relation, e.g. relation x^2 + y^2 == r^2 {eq=Circle}.',
    details:
      'Unlike solve it computes and checks nothing; names the sheet has no value for are general symbols in it. derive steps below start from it. A named one ({eq=Circle}) is solved by a line solve y: Circle and drawn into a chart as a curve: plot(Circle, x: -6 m .. 6 m, y: -6 m .. 6 m).',
  },
  check: {
    summary: 'A check: a condition the calculation must meet, e.g. check "Bending": σ ≤ f_y. Printed with its utilization and PASSES / FAILS.',
    details:
      'The condition is a comparison (≤, <, ≥, >, ==), joined by and / or; the label in quotes is optional. The utilization is the ratio of the sides (σ / f_y). A source may follow the condition: source "EN 1993-1-1, 6.2.5". The checks are summed up at the start of the printout and in the status bar; Calculation properties set how the verdict reads.',
  },
  source: {
    summary: 'The source of a formula or a check at the end of its line: M_Ed := 1.35·G_k source "EN 1990, 6.10".',
    details: 'Printed after the formula in square brackets, in the style with columns in the left column; the checker sees where a formula or a limit comes from. It belongs to definitions and checks.',
  },
  table: {
    summary: 'A table right in the sheet: a line table Measured: and indented lines | … | below it; the first is the header.',
    details:
      'Header: the name of the column, its unit in [ ], the format of numbers in { } ({0.0}). In the calculation Measured.T is a series in the unit of the column and Measured.t[2] one value; pick, find_min, interpolate work. A formula after = in the header computes the column (g_k [kN/m²] = h·ρ), Σ in a cell sums the column. A click opens the table as a grid, {across} prints it across. Catalogue tables (sections, materials) belong in the Data layer.',
  },
  unit: {
    summary: 'A unit of one\'s own: unit EUR := 25 CZK (a rate, an alias), unit pcs: dimensionless (pieces), unit CZK: Money (the base of a new dimension).',
    details:
      'With := the unit is given by a value of other units and computes like the built-in ones (4 pcs · 120 EUR | CZK). With : it is the base unit of a dimension from a dimension line, or dimensionless for countable things. The built-in currencies (CZK, EUR, USD …) each have a dimension of their own until the sheet sets a rate.',
  },
  dimension: {
    summary: 'A new base dimension (money, points, pieces): dimension Points; unit lines below set its units.',
    details:
      'Quantities of different dimensions can be neither added nor compared, so the sheet keeps points from being added to crowns. A dimension line is followed by a unit with the base unit (unit point: Points) and maybe more units of it (unit cent := point/100).',
  },
  input: {
    summary: 'An input of a block: input q := 12 kN/m is a value a call of the block may change; in the sheet itself it is a plain definition.',
    details:
      'A block (Insert → Block from file…) is a finished calculation kept in the sheet; it is called by its name with its inputs by name: N1 := Simple_beam(L: 6 m, q: 10 kN/m), inputs not given keep the values of the block. An input must have the dimension it has in the block. The results of a block are read with a dot: N1.M_max.',
  },
};

export const EN_FUNCTION_DETAILS: Readonly<Record<string, string>> = {
  // Mathematics
  abs: 'The argument may have a unit, the result keeps it (|−3.5 kN| = 3.5 kN). Of a complex number it gives the magnitude |a + bj| = √(a² + b²). The magnitude of a series (vector) is norm.',
  cbrt: 'Unlike x^(1/3) it gives a real result of a negative number too. The unit is rooted where it can be (∛(m³) = m). The same as the ∛ sign of the Operators toolbar.',
  ceil: 'Rounds up to the next whole number, negative ones too (ceil(−2.3) = −2). The argument must be a plain number; a count of pieces rounded up comes from a ratio, e.g. ceil(L / l_piece).',
  exp: 'eˣ of a plain number x; it can also be written as a power of e. Of a complex x it gives a complex result (Euler\'s formula).',
  factorial: 'n! = 1·2·…·n for a whole n from 0 to 170 (0! = 1); a larger n overflows. A negative or fractional n is an error.',
  floor: 'Rounds down to the next whole number, negative ones too (floor(−2.3) = −3). The argument must be a plain number.',
  hypot: '√(a² + b² + …) of any number of values of one unit, without overflow for large numbers. Typically a hypotenuse or the size of a resultant from its components.',
  ln: 'The natural logarithm of a plain positive number. A logarithm of a quantity with a unit makes no sense: take it of a ratio, e.g. ln(p_1 / p_2).',
  log: 'The logarithm of x to the base b; log(x, 10) is log10(x). Both must be plain positive numbers, the base other than 1.',
  log10: 'The common logarithm of a plain positive number, e.g. for decibels 10·log10(P / P_0).',
  max: 'Takes single values and series (a table column too). All must have the same unit; the result is in the unit of the first value.',
  min: 'Takes single values and series (a table column too). All must have the same unit; the result is in the unit of the first value.',
  mod: 'The remainder of a/b with the sign of b (mod(−7, 3) = 2). a and b may have one unit, e.g. mod(370°, 360°) = 10°.',
  root: 'The n-th root for a whole n ≥ 2. An odd root of a negative number is negative, an even one is an error. The unit is rooted where it can be. The same as the ⁿ√ button.',
  round: 'Without the second argument to a whole number, with it to n decimal places. It rounds the value used further; for showing only, {decimals=2} after the line is enough.',
  sign: 'The sign of a number as −1, 0 or 1, without a unit. Useful e.g. for the direction of a force: F·sign(v).',
  sqrt: 'The square root; the unit is rooted (√(m²) = m, √(m) stays as m^0.5). Of a negative number the result is complex. The same as the √ sign.',
  // Trigonometric
  acos: 'Arc cosine of a number from −1 to 1; the result is an angle in rad from 0 to π. | ° after the line shows it in degrees.',
  acosh: 'Inverse hyperbolic cosine for x ≥ 1; a plain number.',
  asin: 'Arc sine of a number from −1 to 1; the result is an angle in rad from −π/2 to π/2. | ° after the line shows it in degrees.',
  asinh: 'Inverse hyperbolic sine; a plain number.',
  atan: 'Arc tangent; the result is an angle in rad from −π/2 to π/2. For the angle of a point in every quadrant use atan2(y, x).',
  atan2: 'The angle of the point (x, y) from the positive x axis, from −π to π, so in the right quadrant. Mind the order: y first, then x. Both may have one unit.',
  atanh: 'Inverse hyperbolic tangent for −1 < x < 1; a plain number.',
  cos: 'An angle without a unit is taken in radians; in degrees write 60° (or 60 deg). The result is a plain number.',
  cosh: 'Hyperbolic cosine of a plain number, e.g. the catenary y = a·cosh(x / a).',
  cot: 'Cotangent = 1/tan; not defined at multiples of π (0°, 180° …). The angle in rad or with the ° sign.',
  cotg: 'The same as cot, by the name Czech textbooks use.',
  sin: 'An angle without a unit is taken in radians; in degrees write 30° (or 30 deg). The result is a plain number.',
  sinh: 'Hyperbolic sine of a plain number.',
  tan: 'An angle without a unit is taken in radians; in degrees write 45°. Not defined at odd multiples of 90°.',
  tanh: 'Hyperbolic tangent of a plain number, between −1 and 1.',
  tg: 'The same as tan, by the name Czech textbooks use.',
  // Integrals and derivatives
  derivative: 'The numeric derivative of an expression or a function of the sheet by a named variable at the point a; order: 2 gives the second derivative. The unit of the result is the unit of f over the unit of x (x² for the second). To derive a formula, use a derive line or the d/dx button.',
  fit: 'Fits the points (y against x) by least squares. kind: "linear", "poly2" to "poly10", "exp", "power", "log". The result is a function of the sheet to call (T_fit(15 s)) and draw; the printout shows its equation with the numbers and R². steps: true writes out the working. A form of one\'s own instead of a kind, as linfit in Mathcad: form: [1, t, sin(ω·t)] finds the coefficients of the combination c₀ + c₁·t + c₂·sin(ω·t); the functions are written in the name of the column of x (t), and each coefficient gets its unit. More comfortably: Insert → Fit a curve…',
  integral: 'The definite integral of an expression by a named variable between a .. b. The limits may have units; the result has the unit of f times the unit of x (e.g. kN/m · m = kN). Computed numerically to about 10 significant digits.',
  maximize: 'Gives the x where f is largest in the interval a .. b (not the value of f). The maximum itself is then f(x_max). It finds the global maximum in the interval, at its ends too.',
  minimize: 'Gives the x where f is smallest in the interval a .. b (not the value of f). The minimum itself is then f(x_min). It finds the global minimum in the interval, at its ends too.',
  polyfit: 'The polynomial of degree n fitted to the points x, y by least squares, as in MATLAB and NumPy. The result is a function P(x) with units and the printout shows its equation. At least n + 1 points are needed.',
  polyval: 'The value of a polynomial at a point or a series of points. P is a function from polyfit, or a series of coefficients from the highest power as in MATLAB: [1, 0, −2] is x² − 2.',
  roots: 'Every root of the polynomial p in the variable x, complex ones too, as a series. For other equations than polynomials use a solve x: … line (with the domain ∈ ℝ and conditions).',
  // Matrices and vectors
  col: 'Column j of the matrix A (counted from 1) as a series.',
  cols: 'The number of columns of a matrix; 1 of a series.',
  cross: 'The cross product a × b of two series of three items; the units multiply (r × F gives a moment in N·m).',
  det: 'The determinant of a square matrix; its unit is the unit of the items to the n-th. A zero determinant means the system has no unique solution.',
  diag: 'Of a series, a square matrix with the series on its diagonal (zeros elsewhere); of a matrix, its diagonal as a series.',
  dot: 'The dot product a·b = a₁b₁ + a₂b₂ + … of two series of one length; the units multiply (F·s gives work in J).',
  eigenvals: 'The eigenvalues of a symmetric matrix K, ascending. With a second matrix M it solves K·φ = λ·M·φ, e.g. stiffness and mass of a vibration (λ = ω², natural frequency f = √λ / (2·π)).',
  eigenvecs: 'The eigenvectors to eigenvals in the same order, as the columns of a matrix; each scaled so that its largest item is 1.',
  identity: 'The n×n identity matrix (ones on the diagonal).',
  inverse: 'The inverse of a regular square matrix; the units invert. The same as A^-1. To solve a system, lsolve(A, b) is more accurate.',
  lsolve: 'Solves the linear system A·x = b by LU decomposition. The units of x follow from those of A and b (stiffness in kN/m and forces in kN give displacements in m). b may be a matrix of several right-hand sides.',
  norm: 'The size √(v₁² + v₂² + …) of a series in its unit, e.g. the length of a vector or a resultant.',
  row: 'Row i of the matrix A (counted from 1) as a series.',
  rows: 'The number of rows of a matrix; of a series, the number of its items.',
  trace: 'The sum of the diagonal items of a square matrix.',
  transpose: 'Swaps rows and columns; makes a row of a series (a column).',
  // Complex numbers
  arg: 'The angle of a complex number from −π to π in rad; | ° shows it in degrees. Of a voltage phasor it is the phase shift.',
  conj: 'The complex conjugate a − bj; the unit stays. Useful for the apparent power S = U·conj(I).',
  im: 'The imaginary part of a complex number, with its unit.',
  polar: 'A complex number of the size r (with a unit) and the angle φ: r·(cos φ + j·sin φ). An angle in degrees with the ° sign.',
  re: 'The real part of a complex number, with its unit.',
  // Series
  cumsum: 'The series of running sums: [1, 2, 3] gives [1, 3, 6]. The unit stays, e.g. a growing load.',
  interp1: 'The value at xi by the points x, y. Method: "linear" (a broken line, the default), "nearest", "spline", "pchip"; with "extrap" it goes on past the end points, otherwise that is an error. x must be ascending; xi may be a number or a series.',
  len: 'The number of items of a series or a table column.',
  pchip: 'Piecewise cubic interpolation that does not overshoot: between rising points it keeps rising. Good for measured data. It goes on past the end points.',
  range: 'The series from from to to, both included, by step (1 without it). The step may have a unit: range(0 m, 6 m, 0.5 m). At most 10 000 items.',
  spline: 'A smooth cubic spline of the points x, y (not-a-knot ends as in MATLAB). It may overshoot between the points; for measured data pchip is often better.',
  sum: 'The sum of a series or a table column (sum([1, 2, 3] kN) = 6 kN). With two arguments it sums an expression over whole k: sum(1/k², k: 1 .. 100). The units must agree.',
  // Statistics
  mean: 'The arithmetic mean of a series or a table column, in their unit.',
  median: 'The middle value of the sorted series; of an even count, the mean of the two middle ones. Less sensitive to outliers than the mean.',
  stdev: 'The sample standard deviation √(Σ(x − x̄)² / (n − 1)), in the unit of the data. Needs at least two values.',
  normcdf: 'The probability that a standard normal quantity is at most x; x is a plain number (convert a value: (x − μ)/σ).',
  norminv: 'The value a standard normal quantity stays below with probability p (0 < p < 1); 95 % two-sided: norminv(0.975) = 1.960. For N(μ, σ): μ + σ·norminv(p).',
  tcdf: "The probability that a quantity with Student's t distribution of ν degrees of freedom is at most t; ν need not be whole (Welch–Satterthwaite).",
  tinv: "The quantile of Student's t (0 < p < 1, ν > 0), as tinv in MATLAB and T.INV in Excel. The coverage factor for 95 % from n measurements: k = tinv(0.975, n − 1), for n = 22 k = 2.080 (GUM, NIST TN 1900).",
  // Finance
  irr: 'The rate at which the net present value of the cash flows CF is zero. The first flow is usually negative (the investment), the others positive. The result is a fraction (0.089); | % after the line shows it in per cent.',
  npv: 'The sum of the cash flows CF discounted at rate: the first flow is today, the k-th is divided by (1 + rate)^(k − 1). The rate per period, e.g. 5 %.',
  payback: 'How many periods it takes until the sum of the flows CF reaches zero; linear between periods. An investment that does not pay back is an error.',
  pmt: 'The regular instalment of an annuity loan: the rate per period, the number of periods and the principal. For monthly instalments divide the yearly rate by 12. The result is in the unit of the principal.',
  // Dates
  date: 'A date of year, month and day. A date can also be written directly: 2026-10-21. Days can be added to a date (+ 30 d).',
  day: 'The day of the month (1–31) as a number.',
  month: 'The month (1–12) as a number.',
  year: 'The year as a number.',
  // Logic
  if: 'A conditional value: when the condition holds the result is then, otherwise else. The condition is a comparison (<, ≤, ==, ≠ …), joined by and / or. Both branches should have one unit. When the condition compares a series (x > 0 m for a series x), it holds item by item: the result is a series and each item comes from then or else (of a series of the same length its item, of a number that number), e.g. the positive part of a series if(x > 0 m, x, 0 m).',
  // Tables
  compare:
    'Compares variants of the calculation. A table of variants (table Variants: {variants=B}) names the variants in its first column and holds inputs of the sheet in the others (b [mm], h [mm]); the sheet calculates with the variant chosen (=B, without it the first). compare(Variants, W, σ) calculates the sheet for each variant and gives a table of the values named, with the largest utilization η_max and the result of the checks ✓; the chosen variant is marked in print.',
  filter: 'Gives a table of only the rows that meet the condition; in where, r is the row tried and r.column its value. The result can go on into max, sum or find_min.',
  find_max: 'Finds the row with the largest value of the column by among the rows that meet where (r is the row tried). Another column of the row is read with a dot: find_max(…).A.',
  find_min: 'Finds the row with the smallest value of the column by among the rows that meet where (r is the row tried). Typically the lightest section that passes: find_min(Profiles, by: A, where: r.W_y ≥ W_req).',
  interpolate: 'Linear interpolation in a table by a value of a column (T: 25 °C); it gives a row whose value is read with a dot. With two named columns it interpolates in two variables. Outside the table it is an error.',
  pick: 'A row of a table by the value of its key column (the first); a value is read from it with a dot: pick(Profiles, "IPE 200").W_y. Another column can select too: pick(Rates, date: 2026-09-30). The line then offers a list to pick from.',
  // Charts
  plot: 'A chart of a function over x: a .. b, of more functions separated by commas in one chart, or of data against a series (x: Measured.t). Options: kind ("line", "points", "bar", "surface"), title, samples, roots, area, tangent and more; | unit after the line sets the unit of the y axis. More comfortably: Insert → Chart…',
};
