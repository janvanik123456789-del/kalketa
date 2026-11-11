# Vlastní čísla tuhostní matice řetězce pružin

"Řetěz pěti hmot na pružinách, oba konce vetknuté: K je trojúhelníková matice 2 na diagonále a −1 mimo ni."
k := 1000 N/m                 ' tuhost pružiny
m := 2 kg                     ' hmotnost každého tělesa
K := [2, -1, 0, 0, 0 | -1, 2, -1, 0, 0 | 0, -1, 2, -1, 0 | 0, 0, -1, 2, -1 | 0, 0, 0, -1, 2]·k | N/m
M := identity(5)·m | kg
lam := eigenvals(K, M)
"Uzavřený tvar: λ_j = (k/m)·(2 − 2·cos(j·π/6)), j = 1 … 5, seřazeno vzestupně."
lam_a(j) := (k/m)·(2 - 2·cos(j·π/6)) | 1/s²
"a₁ je vlastní číslo, a₍konec₎ poslední."
a1 := lam[1]
a5 := lam[5]
a1_a := lam_a(1)
a5_a := lam_a(5)
check "První vlastní číslo": abs(a1 - a1_a)/a1_a < 1e-9
check "Poslední vlastní číslo": abs(a5 - a5_a)/a5_a < 1e-9
"Součet vlastních čísel se rovná stopě matice M⁻¹·K."
stopa := trace(inverse(M)·K) | 1/s²
check "Součet vlastních čísel": abs(sum(lam) - stopa)/stopa < 1e-9
