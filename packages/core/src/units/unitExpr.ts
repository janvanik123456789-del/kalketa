/**
 * Resolves a parsed unit expression ("kN/m", "J/(kg·K)") to a factor and a
 * dimension, and formats it back to a canonical symbol.
 *
 * Temperature rule (postgresql-unit, Calcpad): only a lone °C/°F after a
 * number is an absolute temperature with a zero-point shift. Inside a compound
 * unit (J/(kg·°C)) or standalone it means a temperature difference.
 */

import { fail } from '../diagnostics.js';
import type { UnitExpr } from '../lang/ast.js';
import { DIMENSIONLESS, divideDims, isDimensionless, multiplyDims, powerDim, superscript, type Dimension } from './dimension.js';
import { canonicalUnitSymbol, type UnitDef, type UnitRegistry } from './registry.js';

export interface ResolvedUnit {
  readonly symbol: string;
  readonly factor: number;
  readonly dim: Dimension;
  /** Set only for a lone absolute temperature unit (°C, °F). */
  readonly offset?: number;
  /** Difference unit matching an absolute one (°C -> Δ°C). */
  readonly delta?: string;
  /**
   * A power of one unit (mm, mm², cm³): products and quotients of powers of
   * the same unit keep it (mm² · mm = mm³).
   */
  readonly power?: { readonly symbol: string; readonly exponent: number; readonly factor: number; readonly dim: Dimension };
}

export function resolveUnit(expr: UnitExpr, registry: UnitRegistry): ResolvedUnit {
  if (expr.kind === 'unit-name') {
    const def = lookup(expr.name, expr, registry);
    return {
      symbol: def.symbol,
      factor: def.factor,
      dim: def.dim,
      ...(def.offset !== undefined ? { offset: def.offset } : {}),
      ...(def.delta !== undefined ? { delta: def.delta } : {}),
      ...(def.offset === undefined && !isDimensionless(def.dim) ? { power: { symbol: def.symbol, exponent: 1, factor: def.factor, dim: def.dim } } : {}),
    };
  }
  const { factor, dim } = scaleOf(expr, registry);
  // mm², cm³: remember the unit and its power.
  if (expr.kind === 'unit-pow' && expr.base.kind === 'unit-name') {
    const unit = resolveUnit(expr.base, registry);
    if (unit.power) return { symbol: formatUnit(expr), factor, dim, power: { ...unit.power, exponent: expr.exponent } };
  }
  return { symbol: formatUnit(expr), factor, dim };
}

function scaleOf(expr: UnitExpr, registry: UnitRegistry): { factor: number; dim: Dimension } {
  switch (expr.kind) {
    case 'unit-one':
      return { factor: 1, dim: DIMENSIONLESS };
    case 'unit-name': {
      const def = lookup(expr.name, expr, registry);
      return { factor: def.factor, dim: def.dim };
    }
    case 'unit-mul':
    case 'unit-div': {
      const a = scaleOf(expr.left, registry);
      const b = scaleOf(expr.right, registry);
      return expr.kind === 'unit-mul'
        ? { factor: a.factor * b.factor, dim: multiplyDims(a.dim, b.dim) }
        : { factor: a.factor / b.factor, dim: divideDims(a.dim, b.dim) };
    }
    case 'unit-pow': {
      const base = scaleOf(expr.base, registry);
      return { factor: base.factor ** expr.exponent, dim: powerDim(base.dim, expr.exponent) };
    }
  }
}

function lookup(name: string, expr: UnitExpr, registry: UnitRegistry): UnitDef {
  return registry.resolve(name) ?? fail('E-UNKNOWN-UNIT', expr.span, { unit: name });
}

/** Canonical symbol: "kN/m", "J/(kg·K)", "m/s²". */
export function formatUnit(expr: UnitExpr): string {
  switch (expr.kind) {
    case 'unit-one':
      return '1';
    case 'unit-name':
      return canonicalUnitSymbol(expr.name);
    case 'unit-mul':
      return `${formatUnit(expr.left)}·${formatUnit(expr.right)}`;
    case 'unit-div': {
      const right = formatUnit(expr.right);
      const wrap = expr.right.kind === 'unit-mul' || expr.right.kind === 'unit-div';
      return `${formatUnit(expr.left)}/${wrap ? `(${right})` : right}`;
    }
    case 'unit-pow': {
      const base = formatUnit(expr.base);
      const wrap = expr.base.kind !== 'unit-name';
      return `${wrap ? `(${base})` : base}${superscript(expr.exponent)}`;
    }
  }
}
