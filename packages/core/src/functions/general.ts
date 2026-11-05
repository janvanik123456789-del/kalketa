/**
 * Linear algebra beyond real symmetric matrices: complex numbers as pairs, LU of a complex matrix, the eigenvalues of
 * any square matrix (Hessenberg form and shifted QR with Givens rotations) and the singular values (one-sided Jacobi).
 * Plain numbers only: units are the business of linear.ts.
 */

export type C = readonly [number, number];

export const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const size = (a: C): number => Math.hypot(a[0], a[1]);
export function div(a: C, b: C): C {
  // Smith's way, safe from overflow of the squares.
  if (Math.abs(b[0]) >= Math.abs(b[1])) {
    const r = b[1] / b[0];
    const d = b[0] + b[1] * r;
    return [(a[0] + a[1] * r) / d, (a[1] - a[0] * r) / d];
  }
  const r = b[0] / b[1];
  const d = b[0] * r + b[1];
  return [(a[0] * r + a[1]) / d, (a[1] * r - a[0]) / d];
}
export const conj = (a: C): C => [a[0], -a[1]];
function root(a: C): C {
  const r = size(a);
  if (r === 0) return [0, 0];
  const re = Math.sqrt((r + Math.abs(a[0])) / 2);
  const im = a[1] / (2 * re);
  return a[0] >= 0 ? [re, im] : [Math.abs(im), a[1] >= 0 ? re : -re];
}

export interface ComplexLu {
  readonly lu: C[][];
  readonly perm: number[];
  readonly sign: number;
}

/** LU with partial pivoting; undefined for a singular matrix. */
export function complexLu(given: readonly (readonly C[])[], smallest = 1e-14): ComplexLu | undefined {
  const n = given.length;
  const m = given.map((row) => [...row]);
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign = 1;
  let scale = Number.MIN_VALUE;
  for (const row of m) for (const x of row) scale = Math.max(scale, size(x));
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (size(m[i]![k]!) > size(m[p]![k]!)) p = i;
    if (size(m[p]![k]!) <= smallest * scale) return undefined;
    if (p !== k) {
      [m[p], m[k]] = [m[k]!, m[p]!];
      [perm[p], perm[k]] = [perm[k]!, perm[p]!];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      const f = div(m[i]![k]!, m[k]![k]!);
      m[i]![k] = f;
      for (let j = k + 1; j < n; j++) m[i]![j] = sub(m[i]![j]!, mul(f, m[k]![j]!));
    }
  }
  return { lu: m, perm, sign };
}

export function complexSolve(d: ComplexLu, b: readonly C[]): C[] {
  const n = b.length;
  const y = d.perm.map((p) => b[p]!);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) y[i] = sub(y[i]!, mul(d.lu[i]![j]!, y[j]!));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) y[i] = sub(y[i]!, mul(d.lu[i]![j]!, y[j]!));
    y[i] = div(y[i]!, d.lu[i]![i]!);
  }
  return y;
}

export function complexDet(d: ComplexLu): C {
  let det: C = [d.sign, 0];
  d.lu.forEach((row, i) => (det = mul(det, row[i]!)));
  return det;
}

/** The eigenvalues of a square matrix; undefined where the iteration does not settle. */
export function eigenvalues(given: readonly (readonly C[])[]): C[] | undefined {
  const n = given.length;
  const h = given.map((row) => [...row]);
  // Hessenberg form by Householder reflections: the same eigenvalues, and QR steps of n² instead of n³.
  for (let k = 0; k < n - 2; k++) {
    let norm = 0;
    for (let i = k + 1; i < n; i++) norm = Math.hypot(norm, size(h[i]![k]!));
    if (norm === 0) continue;
    const head = h[k + 1]![k]!;
    const phase: C = size(head) === 0 ? [1, 0] : [head[0] / size(head), head[1] / size(head)];
    const v: C[] = Array.from({ length: n }, (_, i) => (i <= k ? [0, 0] : h[i]![k]!));
    v[k + 1] = add(head, [phase[0] * norm, phase[1] * norm]);
    let vNorm = 0;
    for (const x of v) vNorm += x[0] * x[0] + x[1] * x[1];
    if (vNorm === 0) continue;
    // H = I − 2·v·v*/|v|², from the left and from the right.
    for (let j = 0; j < n; j++) {
      let s: C = [0, 0];
      for (let i = k + 1; i < n; i++) s = add(s, mul(conj(v[i]!), h[i]![j]!));
      const f: C = [(2 * s[0]) / vNorm, (2 * s[1]) / vNorm];
      for (let i = k + 1; i < n; i++) h[i]![j] = sub(h[i]![j]!, mul(v[i]!, f));
    }
    for (let i = 0; i < n; i++) {
      let s: C = [0, 0];
      for (let j = k + 1; j < n; j++) s = add(s, mul(h[i]![j]!, v[j]!));
      const f: C = [(2 * s[0]) / vNorm, (2 * s[1]) / vNorm];
      for (let j = k + 1; j < n; j++) h[i]![j] = sub(h[i]![j]!, mul(f, conj(v[j]!)));
    }
    for (let i = k + 2; i < n; i++) h[i]![k] = [0, 0];
  }
  // Shifted QR by Givens rotations, working down from the bottom right.
  const values: C[] = new Array<C>(n);
  let top = n - 1;
  let iterations = 0;
  let sinceLast = 0;
  while (top >= 0) {
    if (top === 0) {
      values[0] = h[0]![0]!;
      break;
    }
    let scale = 0;
    for (let i = 0; i <= top; i++) for (let j = Math.max(0, i - 1); j <= top; j++) scale = Math.max(scale, size(h[i]![j]!));
    let low = top;
    while (low > 0 && size(h[low]![low - 1]!) > 1e-15 * (size(h[low]![low]!) + size(h[low - 1]![low - 1]!) || scale)) low--;
    if (low === top) {
      values[top] = h[top]![top]!;
      top--;
      sinceLast = 0;
      continue;
    }
    if (low > 0) h[low]![low - 1] = [0, 0];
    if (++iterations > 300 * n) return undefined;
    // The Wilkinson shift: the eigenvalue of the corner 2×2 nearer its last item; now and then an exceptional one.
    const [a, b, c, d] = [h[top - 1]![top - 1]!, h[top - 1]![top]!, h[top]![top - 1]!, h[top]![top]!];
    const half: C = [(a[0] - d[0]) / 2, (a[1] - d[1]) / 2];
    const disc = root(add(mul(half, half), mul(b, c)));
    const denominators = [add(half, disc), sub(half, disc)];
    const larger = size(denominators[0]!) >= size(denominators[1]!) ? denominators[0]! : denominators[1]!;
    const wilkinson: C = size(larger) === 0 ? d : sub(d, div(mul(b, c), larger));
    sinceLast++;
    const shift: C = sinceLast % 11 === 10 ? [wilkinson[0] + scale * 0.75, wilkinson[1] + scale * 0.25] : wilkinson;
    for (let i = low; i <= top; i++) h[i]![i] = sub(h[i]![i]!, shift);
    const rotations: { c: number; s: C }[] = [];
    for (let k = low; k < top; k++) {
      const x = h[k]![k]!;
      const y = h[k + 1]![k]!;
      const r = Math.hypot(size(x), size(y));
      if (r === 0) {
        rotations.push({ c: 1, s: [0, 0] });
        continue;
      }
      // A rotation that leaves a real c: Q = [c, s*; −s, c], with the phase of x taken into s.
      const ax = size(x);
      const cs = ax / r;
      const phase: C = ax === 0 ? [1, 0] : [x[0] / ax, x[1] / ax];
      const sn: C = div(mul(conj(y), phase), [r, 0]);
      rotations.push({ c: cs, s: sn });
      for (let j = k; j <= top; j++) {
        const [p, q] = [h[k]![j]!, h[k + 1]![j]!];
        h[k]![j] = add([cs * p[0], cs * p[1]], mul(sn, q));
        h[k + 1]![j] = sub([cs * q[0], cs * q[1]], mul(conj(sn), p));
      }
    }
    rotations.forEach(({ c: cs, s: sn }, index) => {
      const k = low + index;
      for (let i = low; i <= Math.min(k + 1, top); i++) {
        const [p, q] = [h[i]![k]!, h[i]![k + 1]!];
        h[i]![k] = add([cs * p[0], cs * p[1]], mul(q, conj(sn)));
        h[i]![k + 1] = sub([cs * q[0], cs * q[1]], mul(p, sn));
      }
    });
    for (let i = low; i <= top; i++) h[i]![i] = add(h[i]![i]!, shift);
  }
  return values;
}

/** An eigenvector by inverse iteration, its largest item 1. */
export function eigenvector(a: readonly (readonly C[])[], value: C): C[] {
  const n = a.length;
  let scale = Number.MIN_VALUE;
  for (const row of a) for (const x of row) scale = Math.max(scale, size(x));
  // A little beside the value, or the matrix is singular exactly where the vector is wanted.
  const shifted = a.map((row, i) => row.map((x, j) => (i === j ? sub(x, add(value, [scale * 1e-10, scale * 1e-11])) : x)));
  const d = complexLu(shifted, 0);
  let v: C[] = Array.from({ length: n }, (_, i) => [1, 0.1 * i] as C);
  if (!d) return v;
  for (let round = 0; round < 4; round++) {
    v = complexSolve(d, v);
    const big = v.reduce((best, x) => (size(x) > size(best) ? x : best), [0, 0] as C);
    if (size(big) === 0) break;
    v = v.map((x) => div(x, big));
  }
  return v;
}

/** The singular values, the greatest first, with the right singular vectors (columns), by one-sided Jacobi. */
export function singularValues(given: readonly (readonly number[])[]): { values: number[]; v: number[][] } {
  const rows = given.length;
  const cols = given[0]?.length ?? 0;
  const u = given.map((row) => [...row]);
  const v = Array.from({ length: cols }, (_, i) => Array.from({ length: cols }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let changed = false;
    for (let p = 0; p < cols - 1; p++) {
      for (let q = p + 1; q < cols; q++) {
        let [alpha, beta, gamma] = [0, 0, 0];
        for (let i = 0; i < rows; i++) {
          alpha += u[i]![p]! ** 2;
          beta += u[i]![q]! ** 2;
          gamma += u[i]![p]! * u[i]![q]!;
        }
        if (Math.abs(gamma) <= 1e-16 * Math.sqrt(alpha * beta) || gamma === 0) continue;
        changed = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (const m of [u, v]) {
          for (const row of m) {
            const [x, y] = [row[p]!, row[q]!];
            row[p] = c * x - s * y;
            row[q] = s * x + c * y;
          }
        }
      }
    }
    if (!changed) break;
  }
  const norms = Array.from({ length: cols }, (_, j) => Math.hypot(...u.map((row) => row[j]!)));
  const order = norms.map((_, j) => j).sort((a, b) => norms[b]! - norms[a]!);
  return { values: order.map((j) => norms[j]!), v: v.map((row) => order.map((j) => row[j]!)) };
}

/** A fraction near x with a small denominator, by continued fractions; undefined when none is near enough. */
export function fractionOf(x: number, largest = 10000): [number, number] | undefined {
  if (!Number.isFinite(x)) return undefined;
  if (Number.isInteger(x)) return [x, 1];
  const sign = x < 0 ? -1 : 1;
  let rest = Math.abs(x);
  let [p0, q0, p1, q1] = [0, 1, 1, 0];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(rest);
    const [p2, q2] = [a * p1 + p0, a * q1 + q0];
    if (q2 > largest) return undefined;
    [p0, q0, p1, q1] = [p1, q1, p2, q2];
    if (Math.abs(p1 / q1 - Math.abs(x)) <= 1e-10 * Math.max(1, Math.abs(x))) return [sign * p1, q1];
    const part = rest - a;
    if (part < 1e-14) break;
    rest = 1 / part;
  }
  return undefined;
}

/** Standard atomic weights, abridged (IUPAC 2021); for those with no stable isotope, the longest-lived one. */
const ATOMIC_WEIGHT: Readonly<Record<string, number>> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.18,
  Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078,
  Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224,
  Nb: 92.906, Mo: 95.95, Tc: 97, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71,
  Sb: 121.76, Te: 127.6, I: 126.9, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
  Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.5, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05,
  Lu: 174.97, Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59,
  Tl: 204.38, Pb: 207.2, Bi: 208.98, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04, Pa: 231.04, U: 238.03,
  Np: 237, Pu: 244, Am: 243, Cm: 247,
};

/** g/mol of a formula with brackets and a hydrate: Ca3(PO4)2, CuSO4·5H2O. Undefined for what it does not read. */
export function molarMass(formula: string): number | undefined {
  const parts = formula.replace(/\s/g, '').split(/[·.*]/);
  let total = 0;
  for (const part of parts) {
    const lead = /^\d+/.exec(part);
    const value = groupMass(part.slice(lead?.[0].length ?? 0));
    if (value === undefined) return undefined;
    total += (lead ? Number(lead[0]) : 1) * value;
  }
  return total > 0 ? total : undefined;
}

function groupMass(text: string): number | undefined {
  let pos = 0;
  const count = (): number => {
    const m = /^\d+(?:\.\d+)?/.exec(text.slice(pos));
    if (!m) return 1;
    pos += m[0].length;
    return Number(m[0]);
  };
  const group = (closing: string | undefined): number | undefined => {
    let sum = 0;
    while (pos < text.length) {
      const c = text[pos]!;
      if (c === closing) {
        pos++;
        return sum;
      }
      if (c === '(' || c === '[') {
        pos++;
        const inner = group(c === '(' ? ')' : ']');
        if (inner === undefined) return undefined;
        sum += inner * count();
        continue;
      }
      const m = /^[A-Z][a-z]?/.exec(text.slice(pos));
      if (!m) return undefined;
      // Two letters where they name an element, one otherwise: Co is cobalt, CO carbon and oxygen.
      const name = ATOMIC_WEIGHT[m[0]] !== undefined ? m[0] : m[0][0]!;
      const weight = ATOMIC_WEIGHT[name];
      if (weight === undefined) return undefined;
      pos += name.length;
      sum += weight * count();
    }
    return closing ? undefined : sum;
  };
  return group(undefined);
}
