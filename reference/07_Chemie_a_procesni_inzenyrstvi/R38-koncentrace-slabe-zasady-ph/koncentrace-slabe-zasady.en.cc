# Concentrations of salts of weak acids for a given pH
"After example 4, seminar 3 of the Exercises in Analytical Chemistry (University of Chemistry and Technology Prague, in Czech): what concentrations of aqueous solutions of sodium acetate CH₃COONa and sodium cyanide NaCN, salts of weak acids, give the same pH = 8.5? A salt of a weak acid behaves as a weak base B; the conjugate acid HB has the dissociation constant K_a. Concentrations are in mol/dm³ (1 mol/dm³ = 1 mol/l). We compare the simplified relation with the exact one, which also accounts for the autoprotolysis of water, and add a test of what pH the cyanide of the simplified concentration really has."
"Source: Uhlíková T., Cvičení z analytické chemie, seminář 3 – řešení, VŠCHT Praha, https://web.vscht.cz/~uhlikovt/sem3_25_reseni.pdf"

## Input
pH := 8.5
K_a_oct := 1.76e-5 mol/dm^3    ' CH₃COOH (formerly mol/l)
K_a_HCN := 4.93e-10 mol/dm^3   ' HCN
K_w := 1e-14 mol^2/dm^6        ' ion product of water, 25 °C
c° := 1 mol/dm^3               ' standard concentration, for logarithms

## Hydronium ion concentration
H := 10^(-pH)·c°
pK_oct := -log10(K_a_oct/c°)
pK_HCN := -log10(K_a_HCN/c°)
pK_w := -log10(K_w/c°^2)

## Simplified relation for a weak base
"pH = ½·(pK_BH⁺ + pK_w + log c(B)), where pK_BH⁺ is the pK_a of the conjugate acid:"
c_oct0 := 10^(2·pH - pK_oct - pK_w)·c° | mol/dm^3
c_CN0 := 10^(2·pH - pK_HCN - pK_w)·c° | mol/dm^3
"The source gives 1.770·10⁻² mol/dm³ for acetate because it uses the rounded pK = 4.754; with the exact constant the result is 1.760·10⁻² mol/dm³. For cyanide, 4.93·10⁻⁷ mol/dm³, it agrees."

## With autoprotolysis of water
"From the quadratic equation c(B)·[H⁺]² − K_w·[H⁺] − K_a·K_w = 0 (for so dilute a cyanide solution the simplification does not hold):"
c_oct := (K_w·H + K_a_oct·K_w)/H^2 | mol/dm^3
c_CN := (K_w·H + K_a_HCN·K_w)/H^2 | mol/dm^3
chyba_CN := (c_CN - c_CN0)/c_CN | %
"The source gives c(NaCN) = 3.6552·10⁻⁶ mol/dm³, which agrees."

## Test: pH of the cyanide solution of the simplified concentration
"A solution of concentration c_CN0 would have a pH of only about 7.7, not 8.5. The source shows this only by comparing the two concentrations; we added the test:"
solve H_0 ∈ ℝ, H_0 > 0 mol/dm^3: c_CN0·H_0^2 - K_w·H_0 - K_a_HCN·K_w == 0
pH_CN0 := -log10(H_0/c°)
check "Acetate: the simplification is enough (within 1 %)": abs(c_oct - c_oct0)/c_oct ≤ 1 %
check "Cyanide: the simplification is not enough (error above 50 %)": chyba_CN > 50 %
check "Cyanide as in the source (3.6552·10⁻⁶ mol/dm³)": abs(c_CN - 3.6552e-6 mol/dm^3)/c_CN ≤ 0.1 %

"To reach pH 8.5, about 1.8·10⁻² mol/dm³ of acetate is needed but only 3.7·10⁻⁶ mol/dm³ of cyanide: hydrogen cyanide is a much weaker acid, so its salt is a stronger base. In so dilute a cyanide solution the water has to be accounted for."
