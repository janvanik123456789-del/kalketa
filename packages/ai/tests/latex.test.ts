import { describe, expect, it } from 'vitest';
import { latexLine, latexPaste, looksLikeLatex } from '../src/index.js';

describe('LaTeX read by KaTeX', () => {
  it('is written as the calculation writes it', () => {
    expect(latexLine('\\sigma_{max} = \\frac{M}{W_{y}} \\leq f_{y}')).toBe('σ_max = M/W_y ≤ f_y');
    expect(latexLine('A = \\frac{\\pi d^{2}}{4}')).toBe('A = π·d^2/4');
    expect(latexLine('2 \\pi r \\sin \\alpha')).toBe('2·π·r·sin(α)');
    expect(latexLine('\\operatorname{tg}(\\gamma) + \\mathrm{e}^{-x}')).toBe('tg(γ) + exp(-x)');
    expect(latexLine('\\left( a+b \\right)^{2} \\times 1{,}5')).toBe('(a + b)^2·1,5');
    expect(latexLine('W_{\\text{pl},y} \\cdot f_{y}')).toBe('W_pl_y·f_y');
    expect(latexLine('\\sqrt[3]{\\frac{16 M_k}{\\pi \\tau}} + \\sqrt[4]{x} + \\sqrt{a^{2}+b^{2}}')).toBe('cbrt(16·M_k/(π·τ)) + root(x, 4) + sqrt(a^2 + b^2)');
    expect(latexLine('|x - 1| \\cdot \\vec{F}')).toBe('abs(x - 1)·F⃗');
    expect(latexLine('F = 10\\,\\text{kN}')).toBe('F = 10 kN');
    expect(latexLine('x_{1,2} = \\frac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}')).toBe('x_1_2 = (-b ± sqrt(b^2 - 4·a·c))/(2·a)');
    expect(latexLine('(a+b)(c+d) + 2(x)')).toBe('(a + b)·(c + d) + 2·(x)');
    expect(latexLine('\\varepsilon = \\epsilon')).toBe('ε = ε');
    // A dot, two dots, a hat stay over the letter as the name writes them; a bar is left out.
    expect(latexLine('\\dot{x} + \\ddot{x}_{0} + \\hat{y} + \\bar{z}')).toBe('x\u0307 + x\u0308_0 + y\u0302 + z');
  });

  it('gives up where the calculation has no such form, or TeX cannot read it', () => {
    expect(latexLine('\\begin{pmatrix} 1 & 2 \\end{pmatrix}')).toBeUndefined();
    expect(latexLine('\\frac{a}{')).toBeUndefined();
  });

  it('pasted into a line becomes lines of the calculation', () => {
    expect(latexPaste('$$\\tau = \\frac{16 M_k}{\\pi d^{3}}$$')).toEqual(['τ := 16·M_k/(π·d^3)']);
    expect(latexPaste('\\begin{aligned} a &= 2 \\\\ b &= \\frac{a}{2} \\end{aligned}')).toEqual(['a := 2', 'b := a/2']);
    expect(latexPaste('M := F·a')).toBeUndefined();
    expect(looksLikeLatex('C:\\Users\\Admin\\obr.png')).toBe(false);
    expect(looksLikeLatex('x^{2}')).toBe(true);
  });
});
