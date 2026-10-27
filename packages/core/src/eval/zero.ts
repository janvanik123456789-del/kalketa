/**
 * A zero written without a unit is a zero of any unit, as on paper: the ground is y = 0, a body at rest
 * has v = 0, p_a + ρ·g·0 is p_a. Only a zero as written counts (0, −0, a product with 0, 0 over
 * something, a power of 0), never a value that happens to be zero, so a forgotten unit elsewhere is still caught.
 */

import type { Expr } from '../lang/ast.js';
import { exact } from '../values/exact.js';
import { quantity, type Quantity } from '../values/value.js';

export function isBareZero(e: Expr): boolean {
  switch (e.kind) {
    case 'number':
      return e.value === 0 && !e.unit && !e.imaginary;
    case 'unary':
      return (e.operator === '-' || e.operator === '+') && isBareZero(e.operand);
    case 'binary':
      // A power of zero (the speed at the surface squared, ρ·0²/2) is zero too.
      return e.operator === '*' ? isBareZero(e.left) || isBareZero(e.right) : e.operator === '/' || e.operator === '^' ? isBareZero(e.left) : false;
    default:
      return false;
  }
}

/** The zero in the unit of what it stands beside (a zero difference of an absolute temperature); it is exactly zero. */
export function zeroLike(other: Quantity): Quantity {
  return quantity(0, other.dim, { ...(other.hint && !other.absolute ? { hint: other.hint } : {}), exact: exact(0n)! });
}

/** Operands of a sum or a comparison with a bare zero taken in the unit of the other side. */
export function withBareZero(a: Quantity, b: Quantity, aExpr: Expr, bExpr: Expr): [Quantity, Quantity] {
  if (a.si === 0 && !a.im && isBareZero(aExpr) && !isBareZero(bExpr)) return [zeroLike(b), b];
  if (b.si === 0 && !b.im && isBareZero(bExpr) && !isBareZero(aExpr)) return [a, zeroLike(a)];
  return [a, b];
}
