# Determinant matice 4×4 s jednotkami

"Matice má rozměrové prvky: determinant vyjde ve čtvrté mocnině metru."
A := [1 m, 2 m, 0 m, 0 m | 3 m, 4 m, 0 m, 0 m | 0 m, 0 m, 5 m, 6 m | 0 m, 0 m, 7 m, 9 m]
d := det(A) | m⁴
"Matice je blokově diagonální: determinant je součinem determinantů obou bloků."
B := [1 m, 2 m | 3 m, 4 m]
C := [5 m, 6 m | 7 m, 9 m]
dB := det(B) | m²
dC := det(C) | m²
check "Determinant jako součin bloků": d == dB·dC
"Ruční rozvoj: det B = 1·4 − 2·3 = −2, det C = 5·9 − 6·7 = 3, tedy d = −6 m⁴."
d_rucne := -6 m^4 | m⁴
check "Shoda s ručním rozvojem": d == d_rucne
check "Determinant je záporný": d < 0 m⁴
