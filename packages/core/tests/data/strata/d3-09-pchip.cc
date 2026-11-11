# 09 — pchip: kubika zachovávající tvar (nepřekmitne)
# Reference: vlastní implementace Fritsch–Carlson v NumPy; vlastnost: monotónní
# data nesmí výsledek překmout mimo rozsah sousedních uzlů.

x := [0, 1, 2, 3, 4, 5, 6, 7, 8]
y := [0, 1, 2, 3, 4, 5, 6, 7, 8]
lin_m := pchip(x, y, 3.5)
lin_extrapol := pchip(x, y, 9.5)

sch := [0, 1, 2, 3, 4, 5, 6, 7, 8]
rost := [0, 0.1, 0.9, 3.0, 5.1, 6.0, 6.9, 7.95, 8.0]
p_05 := pchip(sch, rost, 0.5)
p_15 := pchip(sch, rost, 1.5)
p_25 := pchip(sch, rost, 2.5)
p_35 := pchip(sch, rost, 3.5)
p_45 := pchip(sch, rost, 4.5)
p_55 := pchip(sch, rost, 5.5)
p_65 := pchip(sch, rost, 6.5)
p_75 := pchip(sch, rost, 7.5)
s_25 := spline(sch, rost, 2.5)
s_55 := spline(sch, rost, 5.5)

# Metamorfická vlastnost: rostoucí data -> hodnoty mezi sousedy, žádný překmit
ok_mezi := p_15 ≥ rost[2] and p_15 ≤ rost[3] and p_25 ≥ rost[3] and p_25 ≤ rost[4]
ok_mezi2 := p_45 ≥ rost[5] and p_45 ≤ rost[6] and p_55 ≥ rost[6] and p_55 ≤ rost[7]

pomer := [10, 20, 30, 40, 50]
teplota := [12, 18, 26, 31, 33] °C
p_teperatura := pchip(pomer, teplota, 25)

check "pchip na lineárních datech je přímka": abs(lin_m - 3.5) < 1e-13
check "pchip extrapoluje lineárně": abs(lin_extrapol - 9.5) < 1e-9
check "pchip nepřekmí rostoucí data": ok_mezi and ok_mezi2
check "pchip drží mezi sousedy i v kilometrech": p_25 ≥ rost[3] and p_25 ≤ rost[4]
