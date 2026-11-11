# 17 — diskrétní rozdělení: binomické, Poissonovo, hypergeometrické
# Reference: přesné součty kombinačních čísel ve zlomcích (fractions) — nula tolerance.

b_3_10 := binopdf(3, 10, 0.5)
b_10 := binopdf(10, 10, 0.5)
b_kumul := binocdf(3, 10, 0.5)
b_okrajek := binocdf(10, 10, 0.5)
b_nula := binocdf(-1, 10, 0.5)
b_stred := binopdf(5, 100, 0.01)
b_mimo := binopdf(11, 10, 0.5)

p_2 := poisspdf(2, 1.5)
p_kumul := poisscdf(2, 1.5)
p_velke := poisspdf(50, 1.5)
p_nula := poisscdf(0, 1.5)

h_2 := hygepdf(2, 20, 7, 12)
h_kumul := hygecdf(2, 20, 7, 12)
h_okrajek := hygepdf(7, 20, 7, 12)
h_nemozne := hygepdf(15, 20, 7, 12)

k := nchoosek(52, 5)
k2 := nchoosek(100, 50)
k0 := nchoosek(7, 0)
k_mimo := nchoosek(5, 7)
f5 := factorial(5)
f20 := factorial(20)
f_nula := factorial(0)

check "binopdf(3,10,0.5) = 120/1024": b_3_10 == 120 / 1024
check "binocdf(3,10,0.5) = 176/1024": b_kumul == 176 / 1024
check "binocdf na horním kraji je 1": b_okrajek == 1
check "poisspdf(2,1.5) = e^-1.5·1.125": abs(p_2 / (exp(-1.5)·1.125) - 1) < 1e-12
check "hypergeometrické pravděpodobnosti": abs(h_2 / (6006 / 125970) - 1) < 1e-12
check "kombinační číslo 52 nad 5": k == 2598960
check "faktoriál 20 je přesný": f20 == 2432902008176640000
check "nchoosek(7,0) je 1": k0 == 1
