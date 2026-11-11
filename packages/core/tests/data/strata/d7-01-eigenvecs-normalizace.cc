# Dávka 7 – list 01: eigenvecs – normalizace, znaménko a násobná vlastní čísla
A := [4, 1, 0 | 1, 4, 0 | 0, 0, 5]
lam := eigenvals(A)
V := eigenvecs(A)
soucet_l := sum(lam)
soucin_l := prod(lam)
r1 := norm(A * col(V, 1) - lam[1] * col(V, 1))
r2 := norm(A * col(V, 2) - lam[2] * col(V, 2))
r3 := norm(A * col(V, 3) - lam[3] * col(V, 3))
I3 := identity(3)
lam2 := eigenvals(I3)
V2 := eigenvecs(I3)
