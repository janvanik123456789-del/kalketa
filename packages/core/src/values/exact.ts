/**
 * The exact form a value may carry beside its number: (num/den)·√root, a fraction times the square root of a
 * square-free whole number (49/9, 13·√2/2). It rides along: the calculation itself stays in floating point,
 * and an operation that cannot keep the form exact (π, sin, an integral, a sum of different roots) drops it.
 * Shown on request as "49/9 ≐ 5,444" (docs/03-jazyk.md, exact results).
 */

export interface Exact {
  readonly num: bigint;
  /** Always positive; the fraction is in lowest terms. */
  readonly den: bigint;
  /** Square-free, at least 1: the value is num/den·√root. */
  readonly root: bigint;
}

/** Fractions with a denominator or numerator past this are not kept: no one reads 123456789/987654321. */
const LIMIT = 10n ** 30n;

const abs = (a: bigint) => (a < 0n ? -a : a);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** The fraction in lowest terms with a positive denominator; undefined past the limit or for 0 in the denominator. */
export function exact(num: bigint, den = 1n, root = 1n): Exact | undefined {
  if (den === 0n) return undefined;
  if (den < 0n) [num, den] = [-num, -den];
  const g = gcd(num, den) || 1n;
  num /= g;
  den /= g;
  if (abs(num) > LIMIT || den > LIMIT) return undefined;
  const value = { num, den, root: num === 0n ? 1n : root };
  // Values go into fingerprints and messages as JSON, which has no bigint: there it is written as text.
  Object.defineProperty(value, 'toJSON', { value: () => `${value.num}/${value.den}√${value.root}` });
  return value;
}

/** A number as written in decimals ("0.1", "1e-9", "273.15") as an exact fraction; undefined for others. */
export function fromDecimal(text: string): Exact | undefined {
  const m = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text.trim());
  if (!m) return undefined;
  const digits = BigInt(`${m[2]}${m[3] ?? ''}`);
  const scale = (m[3]?.length ?? 0) - Number(m[4] ?? 0);
  if (Math.abs(scale) > 40) return undefined;
  const signed = m[1] === '-' ? -digits : digits;
  return scale >= 0 ? exact(signed, 10n ** BigInt(scale)) : exact(signed * 10n ** BigInt(-scale));
}

/**
 * A floating-point number as the fraction its shortest decimal writing means (0.1 is 1/10, not the binary
 * neighbour of it); undefined for a number that needs more than 15 significant digits (it was computed, not written).
 */
export function fromNumber(value: number): Exact | undefined {
  if (!Number.isFinite(value)) return undefined;
  const text = String(value);
  const significant = text.replace(/^-/, '').replace(/e.*$/i, '').replace('.', '').replace(/^0+/, '');
  return significant.length > 15 ? undefined : fromDecimal(text);
}

export function toNumber(e: Exact): number {
  const value = Number(e.num) / Number(e.den);
  return e.root === 1n ? value : value * Math.sqrt(Number(e.root));
}

export function negate(a: Exact): Exact {
  return exact(-a.num, a.den, a.root)!;
}

export function multiply(a: Exact, b: Exact): Exact | undefined {
  // √a·√b = √(a·b): a square factor of the product comes out (√2·√6 = 2·√3).
  const [outside, inside] = squareFree(a.root * b.root);
  return outside === undefined ? undefined : exact(a.num * b.num * outside, a.den * b.den, inside);
}

export function divide(a: Exact, b: Exact): Exact | undefined {
  if (b.num === 0n) return undefined;
  // 1/√r = √r/r.
  return multiply(a, { num: b.den * (b.num < 0n ? -1n : 1n), den: abs(b.num) * b.root, root: b.root });
}

/** A sum stays exact only with the same root (2√3 + √3 = 3√3) or with a zero. */
export function add(a: Exact, b: Exact): Exact | undefined {
  if (a.num === 0n) return b;
  if (b.num === 0n) return a;
  if (a.root !== b.root) return undefined;
  return exact(a.num * b.den + b.num * a.den, a.den * b.den, a.root);
}

export function subtract(a: Exact, b: Exact): Exact | undefined {
  return add(a, negate(b));
}

/**
 * A·x = b solved in fractions (Gauss–Jordan with a nonzero pivot), for the exact form of a linear
 * system's solution (96/83); undefined when a coefficient has a root, the matrix is singular or a fraction grows past the limit.
 */
export function solveLinear(a: readonly (readonly Exact[])[], b: readonly Exact[]): Exact[] | undefined {
  const n = b.length;
  if (a.some((row) => row.some((v) => v.root !== 1n)) || b.some((v) => v.root !== 1n)) return undefined;
  const m: Exact[][] = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    const p = m.findIndex((row, i) => i >= c && row[c]!.num !== 0n);
    if (p === -1) return undefined;
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let i = 0; i < n; i++) {
      if (i === c || m[i]![c]!.num === 0n) continue;
      const f = divide(m[i]![c]!, m[c]![c]!);
      if (!f) return undefined;
      for (let k = c; k <= n; k++) {
        const product = multiply(f, m[c]![k]!);
        const next = product && subtract(m[i]![k]!, product);
        if (!next) return undefined;
        m[i]![k] = next;
      }
    }
  }
  const x = m.map((row, i) => divide(row[n]!, row[i]!));
  return x.every((v): v is Exact => v !== undefined) ? x : undefined;
}

/** A whole power; negative ones too. */
export function power(a: Exact, n: number): Exact | undefined {
  if (!Number.isInteger(n) || Math.abs(n) > 64) return undefined;
  if (n < 0) {
    const p = power(a, -n);
    return p && divide(exact(1n)!, p);
  }
  let result: Exact | undefined = exact(1n);
  for (let i = 0; i < n && result; i++) result = multiply(result, a);
  return result;
}

/** The square root of a fraction without a root: √(169/4) = 13/2, √(1/2) = √2/2; undefined otherwise or below zero. */
export function squareRoot(a: Exact): Exact | undefined {
  if (a.root !== 1n || a.num < 0n) return undefined;
  // √(p/q) = √(p·q)/q.
  const [outside, inside] = squareFree(a.num * a.den);
  return outside === undefined ? undefined : exact(outside, a.den, inside);
}

/** n = outside²·inside with inside square-free; undefined when n is too large to take apart quickly. */
function squareFree(n: bigint): [bigint | undefined, bigint] {
  if (n === 0n) return [0n, 1n];
  if (n > 10n ** 12n) return [undefined, 1n];
  let outside = 1n;
  let inside = 1n;
  let rest = n;
  for (let p = 2n; p * p <= rest; p++) {
    let count = 0;
    while (rest % p === 0n) {
      rest /= p;
      count++;
    }
    outside *= p ** BigInt(Math.floor(count / 2));
    if (count % 2) inside *= p;
  }
  return [outside, inside * rest];
}

/**
 * Whether the exact form says more than the number: a root, or a fraction whose decimals never end (49/9, 1/3).
 * One whose decimals end (75/2 = 37,5) says no more than the number written out.
 */
export function worthShowing(e: Exact): boolean {
  if (e.root !== 1n) return true;
  let den = e.den;
  while (den % 2n === 0n) den /= 2n;
  while (den % 5n === 0n) den /= 5n;
  return den !== 1n;
}
