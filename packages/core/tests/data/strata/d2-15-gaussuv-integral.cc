# Nekonečná mez – Gausův integrál

"Integrační horní mez je nekonečno, integrál má známý uzavřený tvar."
I := integral(exp(-x²), x: 0 .. ∞)
I_ana := sqrt(π)/2
check "Gaussův integrál": abs(I - I_ana) < 1e-8
"Dohra integrováno na konečné mezi 8: chybí člen menší než 7e-29."
I_konec := integral(exp(-x²), x: 0 .. 8)
check "Meza 8 stačí": abs(I_konec - I_ana) < 1e-12
