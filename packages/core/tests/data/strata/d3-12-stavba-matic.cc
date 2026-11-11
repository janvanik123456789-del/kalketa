# 12 — stavba matic: indexované konstrukce, výřezy, spojování, čtení
# Reference: NumPy — hodnoty počítám z definičních vzorců (Hilbert, Pascal, VANDERMONDE).

hilbert := matrix(1 / (i + j - 1), i: 1 .. 4, j: 1 .. 4)
pascal := matrix(if(i == 1 or j == 1, 1, 0), i: 1 .. 3, j: 1 .. 3)
kol := vector(2·i - 1, i: 1 .. 5)

rozmery := [rows(hilbert), cols(hilbert)]
prvni_radek := row(hilbert, 1)
druhy_sloupec := col(hilbert, 2)
prvek := hilbert[3, 2]
vyrez := submatrix(hilbert, 2, 4, 1, 3)

A := [4, 1 | 1, 3]
B := [2, 0 | 1, 2]
spojene := augment(A, B)
zasute := stack(A, B)
soucin_AB := A·B
trans := transpose(A)
stopa := trace(A)
ident := identity(4)
diagonal := diag([5, 6])
bodovy := dot([1, 2, 3], [4, 5, 6])
vekctorovy := cross([1, 0, 0], [0, 1, 0])
delka_vektoru := norm([3, 4])
po_elementech := hprod([1, 2, 3], [10, 20, 30])
kronecker := kprod([1, 2], [3, 4])
nejmensi := argmin([9, 1 | 5, 7])

check "Hilbertova matice 4x4": hilbert[4, 4] == 1 / 7
check "rozmery sedí": sum(rozmery) == 8
check "výřez 3x3 z Hilbertovy": vyrez[1, 1] == 1 / 2 and vyrez[3, 3] == 1 / 6
check "násobení matic": soucin_AB[1, 1] == 9 and soucin_AB[2, 2] == 6
check "transpose": trans[1, 2] == 1
check "stopa": stopa == 7
check "vektor lichých čísel": sum(kol) == 25
check "skalární součin": bodovy == 32
check "vektorový součin": sum(vekctorovy) == 1 and vekctorovy[1] == 0
check "argmin matice dá [řádek, sloupec]": sum(nejmensi) == 3 and nejmensi[1] == 1
