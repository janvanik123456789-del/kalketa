# 07 — interp1: presnost v uzlích, volby, hranice rozsahu
# Reference: lomenáára cára je presna ulomkova linearizace — pocitám ve zlomcích.

x := [0, 1, 2, 4, 7, 11]
y := [0, 10, 40, 35, 60, 20]

uzel1 := interp1(x, y, 2)
uzel2 := interp1(x, y, 11)
prostred := interp1(x, y, 0.5)
drive := interp1(x, y, 5)
tesne := interp1(x, y, 3.999999)

razeno := interp1([7, 0, 2, 1, 11, 4], [60, 0, 40, 10, 20, 35], 5)
nejblizsi := interp1(x, y, 2.4, "nearest")
nejblizsi2 := interp1(x, y, 2.6, "nearest")
mimorozsah := interp1(x, y, 13, "linear", "extrap")
mimo := interp1(x, y, 13)
duplicitni := interp1([0, 1, 1, 2], [0, 1, 2, 4], 0.5)
jeden := interp1([0], [5], 0)
prazdne := interp1([], [], 0)

s_meritky := interp1([0, 10] mm, [0, 100] °C, 3 mm)
s_zpet := interp1([0, 10] mm, [0, 100] °C, 10 mm)

check "v uzlu vraci presne y": uzel1 == 40
check "na konci intervalu": abs(uzel2 - 20) < 1e-13
check "polovina usecky": abs(prostred - 5) < 1e-13
check "neserazene x se radi": abs(drive - razeno) < 1e-13
check "extrapolace ma hodnotu": abs(mimorozsah - 0) < 1e-12
check "meritka se prenesou": abs(s_zpet / K - 373.15) < 1e-9
