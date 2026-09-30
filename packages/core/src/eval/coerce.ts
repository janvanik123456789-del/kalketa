/**
 * Type checks shared by the evaluator and built-in functions.
 */

import { fail, type Span } from '../diagnostics.js';
import { typeName, type Quantity, type Value } from '../values/value.js';

/** A real number (with a unit): a complex value is an error here. */
export function asQuantity(value: Value, span: Span): Quantity {
  const q = asComplex(value, span);
  if (q.im) fail('E-COMPLEX-ARG', span);
  return q;
}

/** A number that may be complex: arithmetic and the few functions that take one. */
export function asComplex(value: Value, span: Span): Quantity {
  if (value.type !== 'quantity') fail('E-TYPE', span, { expected: 'number', found: typeName(value) });
  return value;
}

export function asBoolean(value: Value, span: Span): boolean {
  if (value.type !== 'boolean') fail('E-TYPE', span, { expected: 'boolean', found: typeName(value) });
  return value.value;
}
