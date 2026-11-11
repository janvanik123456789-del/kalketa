# 18 — gama, beta, goniometrické funkce a Bessel
# Reference: mpmath na 30 číslic + identity: Γ(z+1)=zΓ(z), B(a,b)=ΓaΓb/Γ(a+b),
# Besselova diferenciální rovnice x²y″+xy′+(x²−n²)y = 0.

g5 := gamma(5)
g_half := gamma(0.5)
g_wiel := gamma(8.5)
lg_120 := lgamma(120)
g_pet := ln(gamma(5))
g_zaporna := gamma(-0.5)
g_pól := gamma(0)

b_2_3 := beta(2, 3)
b_big := beta(50, 50)
b_identity := gamma(2)·gamma(3) / gamma(5)
b_sym := beta(3, 2)

e1 := erf(1)
e0 := erf(0)
e_half := erf(0.5)
e_komplement := erf(1) + erfc(1)
e_velky := erf(6)

j0 := besselj(0, 1)
j1 := besselj(1, 1)
j_nula := besselj(2, 0)
j_wiel := besselj(5, 12)

x0 := 1.3
residual := x0^2·derivative(besselj(2, x), x: x0, order: 2) + x0·derivative(besselj(2, x), x: x0, order: 1) + (x0^2 - 4)·besselj(2, x0)
hodnota_residual := abs(residual)

check "gamma(5) je 24": abs(g5 - 24) < 1e-12
check "gamma(1/2) je odmocnina pí": abs(g_half / sqrt(π) - 1) < 1e-12
check "lgamma souhlasí s gamma": abs(lg_120 - ln(gamma(120))) < 1e-9
check "beta(2,3) je 1/12": abs(b_2_3 - 1 / 12) < 1e-14
check "beta je součin gama": abs(b_2_3 / b_identity - 1) < 1e-13
check "erf a erfc dávají 1": abs(e_komplement - 1) < 1e-14
check "besselj(2,0) je 0": abs(j_nula) < 1e-15
check "Besselova rovnice má nulový reziduum": hodnota_residual < 1e-6
