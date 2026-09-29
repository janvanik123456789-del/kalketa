/**
 * Identifier normalization: ASCII spellings map to their Unicode form, so
 * "sigma_x" and "σ_x" are the same variable and "degC" is "°C".
 */

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  degC: '°C',
  degF: '°F',
  delta_degC: 'Δ°C',
  delta_degF: 'Δ°F',
  deg: '°',
  ohm: 'Ω',
  kohm: 'kΩ',
  Mohm: 'MΩ',
  mohm: 'mΩ',
};

const GREEK: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

const COMBINING_DOT_ABOVE = '̇';

export function normalizeIdentifier(raw: string): string {
  const alias = UNIT_ALIASES[raw];
  if (alias) return alias;

  const segments = raw.split('_');
  const out: string[] = [];
  for (const segment of segments) {
    // "m_dot" -> "ṁ": a dot above the previous segment's last letter.
    if (segment === 'dot' && out.length > 0) {
      out[out.length - 1] += COMBINING_DOT_ABOVE;
      continue;
    }
    out.push(GREEK[segment] ?? segment);
  }
  return out.join('_').normalize('NFC');
}
