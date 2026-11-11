# 13 — singulární hodnoty, vlastní čísla, podmíněnost, hodnost
# Reference: NumPy svd/eigh/cond. Kontroluji identity: det = Πλ, stopa = Σλ,
# cond = σmax/σmin, A·v = λ·v, v·v = 1.

A := [4, 1, 0 | 1, 3, -1 | 0, -1, 2]
sigmy := singvals(A)
vlastni := eigenvals(A)
vektory := eigenvecs(A)
podminka := cond(A)
det_A := det(A)
det_soucin := prod(vlastni)
stopa := trace(A)
stopa_soucet := sum(vlastni)

v1 := col(vektory, 1)
rezidual := A·v1 - vlastni[1]·v1
velikost := norm(v1)

H5 := matrix(1 / (i + j - 1), i: 1 .. 5, j: 1 .. 5)
sigmy_H := singvals(H5)
podminka_H := cond(H5)

D := diag([5, -3, 2])
sigmy_D := singvals(D)

deficientni := [1, 2, 3 | 2, 4, 6 | 3, 6, 9]
hodnost := rank(deficientni)
hodnost_A := rank(A)
jadro := nullspace(deficientni)

R := [3, 1 | 0, 0 | 0, 0]
hodnost_R := rank(R)

check "det = součin vlastních čísel": abs(det_A / det_soucin - 1) < 1e-12
check "stopa = součet vlastních čísel": abs(stopa - stopa_soucet) < 1e-12
check "cond = podíl singulárních hodnot": abs(podminka / (sigmy[1] / sigmy[3]) - 1) < 1e-12
check "vlastní vektor je násobkem jednotkového": abs(velikost - 1.2679491924) < 1e-9
check "rezidual A·v − λ·v je nulový": norm(rezidual) < 1e-12
check "singulární hodnoty diagonální matice": sum(sigmy_D) == 10 and sigmy_D[1] == 5
check "Hilbert 5 je špatně podmíněná": podminka_H > 1e5
check "hodnost singulární matice je 1": hodnost == 1
check "hodnost matice s nulovými řádky": hodnost_R == 1
