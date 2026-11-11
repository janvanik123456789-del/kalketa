# Hilbertova matice 6×6

"Hilbertova matice: H[i, j] = 1/(i + j − 1), klasikou obtížně podmíněná úloha."
H := matrix(1/(i + j - 1), i: 1 .. 6, j: 1 .. 6)
Hi := inverse(H)
"Součin H·H⁻¹ se musí vrátit k jednotkové matici."
P := H·Hi
Rozdil := P - identity(6)
E_Frob := sqrt(trace(transpose(Rozdil)·Rozdil))
check "H·H⁻¹ je jednotková matice": E_Frob < 1e-6
"Číslo podmíněnosti udává, kolik platných číslic se ztratí."
podm := cond(H)
"Determinant Hilbertovy matice 6×6 je přesně 1/186 313 420 339 200 000 ≈ 5.3673e-18."
dH := det(H)
check "Determinant odpovídá přesnému zlomku": abs(dH - 1/186313420339200000) < 1e-27
"První řádek inverzní matice je celočíselný: 36, −630, 3360, −7560, 7560, −2772."
r1 := row(Hi, 1)
