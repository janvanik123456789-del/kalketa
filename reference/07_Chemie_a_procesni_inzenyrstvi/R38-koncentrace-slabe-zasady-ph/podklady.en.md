# A salt of a weak acid as a weak base

Theory for the calculation, in our own words. Kalketa verifies the formulas in the boxes.

## Why a solution of the salt is basic

A salt of a weak acid HB (acetate, cyanide) dissociates in water. The anion B⁻ is the conjugate base and takes a proton from water:

B⁻ + H₂O ⇌ HB + OH⁻

The weaker the acid HB (the smaller K_a), the stronger the base the anion is and the higher the pH of the solution. Hydrogen cyanide (K_a = 4.93·10⁻¹⁰ mol/dm³) is a much weaker acid than acetic acid (1.76·10⁻⁵ mol/dm³), so the same pH needs a much smaller concentration of cyanide than of acetate.

## The simplified relation

If the autoprotolysis of water is neglected and the anion is assumed to react only slightly, then [HB] = [OH⁻] and c(B) is nearly constant. From the equilibria K_a = [H⁺]·[B⁻]/[HB] and K_w = [H⁺]·[OH⁻] we get [H⁺]² = K_a·K_w/c, and after taking logarithms pH = ½·(pK_a + pK_w + log c). Hence the concentration for a given pH (in units of mol/dm³):

```kalk
pH := 8.5
K_a := 4.93e-10
K_w := 1e-14
c := 10^(2·pH)·K_w/K_a
check "c comes out 4.93·10⁻⁷": abs(c - 4.93e-7) ≤ 1e-9
```

## The exact relation with autoprotolysis of water

In a very dilute solution the hydronium ions coming from water must not be neglected either. The solution is electrically neutral: [Na⁺] + [H⁺] = [B⁻] + [OH⁻]. Together with the mass balance c = [HB] + [B⁻] and the equilibrium K_a this leads to a quadratic equation for [H⁺], from which the concentration is

```kalk
H := 10^(-8.5)
K_a := 4.93e-10
K_w := 1e-14
c := (K_w·H + K_a·K_w)/H^2
check "c comes out 3.655·10⁻⁶": abs(c - 3.6553e-6) ≤ 1e-9
```

For acetate the two concentrations differ by 0.02 %, for cyanide by 87 %: for cyanide the simplification makes sense only for concentrations above about 10⁻⁵ mol/dm³.

## The test

Substituting the simplified cyanide concentration back into the quadratic equation c·[H⁺]² − K_w·[H⁺] − K_a·K_w = 0 gives pH = 7.68, not 8.5. The simplified relation would therefore not guarantee the given pH for cyanide.
