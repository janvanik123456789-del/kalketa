/**
 * Distributions of measured data, for uncertainties as the GUM and NIST TN 1900
 * evaluate them, and for tests of hypotheses: the standard normal, Student's t, χ² and
 * Fisher–Snedecor F, their distribution functions and quantiles. Named as in MATLAB
 * (normcdf, norminv, tcdf, tinv, chi2cdf, chi2inv, fcdf, finv): the coverage factor for
 * 95 % and 21 degrees of freedom is tinv(0.975, 21) = 2.080.
 */

/** erfc(x) to nearly full double precision: a series below 2, a continued fraction above (short formulas are too coarse for quantiles). */
function erfc(x: number): number {
  const z = Math.abs(x);
  let result: number;
  if (z < 2) {
    // erf by its Taylor series, erfc = 1 − erf.
    let term = z;
    let sum = z;
    for (let n = 1; n < 200; n++) {
      term *= (-z * z) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    result = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // A continued fraction (Lentz) for large z.
    const tiny = 1e-300;
    let f = z;
    let c = z;
    let d = 0;
    for (let n = 1; n < 500; n++) {
      const a = n / 2;
      d = z + a * d;
      d = Math.abs(d) < tiny ? tiny : d;
      c = z + a / c;
      c = Math.abs(c) < tiny ? tiny : c;
      d = 1 / d;
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    result = Math.exp(-z * z) / (f * Math.sqrt(Math.PI));
  }
  return x >= 0 ? result : 2 - result;
}

/** P(X ≤ x) of the standard normal distribution. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
function logGamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const y = x - 1;
  let a = c[0]!;
  const t = y + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (y + i);
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The continued fraction of the incomplete beta function (modified Lentz). */
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = Math.abs(d) < tiny ? tiny : d;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = 1 + aa / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = 1 + aa / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaFraction(a, b, x)) / a : 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

/** P(T ≤ t) of Student's t distribution with ν degrees of freedom (ν > 0, not necessarily whole). */
export function studentCdf(t: number, nu: number): number {
  const tail = 0.5 * incompleteBeta(nu / (nu + t * t), nu / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/** The x with cdf(x) = p, by Newton's steps kept inside a bracket that halves when a step leaves it. */
function quantile(p: number, cdf: (x: number) => number, density: (x: number) => number): number {
  if (p === 0.5) return 0;
  let low = -1;
  let high = 1;
  while (cdf(low) > p) low *= 2;
  while (cdf(high) < p) high *= 2;
  let x = (low + high) / 2;
  for (let i = 0; i < 200; i++) {
    const f = cdf(x) - p;
    if (f > 0) high = x;
    else low = x;
    const step = f / density(x);
    let next = x - step;
    if (!(next > low && next < high) || !Number.isFinite(next)) next = (low + high) / 2;
    if (Math.abs(next - x) <= 1e-15 * Math.max(1, Math.abs(x))) return next;
    x = next;
  }
  return x;
}

/** The p-quantile of the standard normal distribution (0 < p < 1). */
export function normalQuantile(p: number): number {
  return quantile(p, normalCdf, (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI));
}

/** The p-quantile of Student's t distribution with ν degrees of freedom. */
export function studentQuantile(p: number, nu: number): number {
  const logDensity = logGamma((nu + 1) / 2) - logGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI);
  return quantile(p, (t) => studentCdf(t, nu), (t) => Math.exp(logDensity - ((nu + 1) / 2) * Math.log(1 + (t * t) / nu)));
}

/** The regularized lower incomplete gamma function P(a, x): a series below a + 1, a continued fraction above. */
function incompleteGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-16 * Math.abs(sum)) break;
    }
    return front * sum;
  }
  // Q(a, x) by its continued fraction (modified Lentz), P = 1 − Q.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let n = 1; n < 1000; n++) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b;
    d = Math.abs(d) < tiny ? tiny : d;
    c = b + an / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return 1 - front * h;
}

/** P(X ≤ x) of the χ² distribution with ν degrees of freedom. */
export function chiSquareCdf(x: number, nu: number): number {
  return incompleteGamma(nu / 2, x / 2);
}

/** P(X ≤ x) of the F distribution with ν₁ and ν₂ degrees of freedom. */
export function fisherCdf(x: number, nu1: number, nu2: number): number {
  return x <= 0 ? 0 : incompleteBeta((nu1 * x) / (nu1 * x + nu2), nu1 / 2, nu2 / 2);
}

/** The x ≥ 0 with cdf(x) = p of a distribution on the positive numbers: bracketed, then halved and Newton-free (the density may be infinite at 0). */
function positiveQuantile(p: number, cdf: (x: number) => number): number {
  let low = 0;
  let high = 1;
  while (cdf(high) < p) {
    low = high;
    high *= 2;
  }
  // Regula falsi with the Illinois correction: fast, and it keeps the bracket.
  let fLow = cdf(low) - p;
  let fHigh = cdf(high) - p;
  let side = 0;
  for (let i = 0; i < 300; i++) {
    const x = (low * fHigh - high * fLow) / (fHigh - fLow);
    const f = cdf(x) - p;
    if (Math.abs(f) < 1e-15 || high - low <= 1e-15 * Math.max(1, x)) return x;
    if (f > 0) {
      high = x;
      fHigh = f;
      if (side === -1) fLow /= 2;
      side = -1;
    } else {
      low = x;
      fLow = f;
      if (side === 1) fHigh /= 2;
      side = 1;
    }
  }
  return (low + high) / 2;
}

/** The p-quantile of the χ² distribution with ν degrees of freedom: chi2inv(0.95, 3) = 7.815. */
export function chiSquareQuantile(p: number, nu: number): number {
  return positiveQuantile(p, (x) => chiSquareCdf(x, nu));
}

/** The p-quantile of the F distribution with ν₁ and ν₂ degrees of freedom: finv(0.95, 3, 24) = 3.009. */
export function fisherQuantile(p: number, nu1: number, nu2: number): number {
  return positiveQuantile(p, (x) => fisherCdf(x, nu1, nu2));
}
