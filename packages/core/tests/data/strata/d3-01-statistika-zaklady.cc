# 01 — statistika základy: výběr vs. populace, jednotky, posunuté stupnice
# Reference: numpy (mean, var ddof=0/1, cov, corr) + ruční výpočet ve zlomcích.

mereni := [10.2, 9.8, 10.5, 10.1, 9.9, 10.3, 10.0, 10.4, 9.7] mm
prumer := mean(mereni)
med := median(mereni)
vyp_var := var(mereni)
pop_var := varp(mereni)
vyp_sd := stdev(mereni)
pop_sd := stdevp(mereni)

x := [1, 2, 3, 4, 5]
y := [2.1, 3.9, 6.2, 7.8, 10.2]
kov := cov(x, y)
rho := corr(x, y)

teploty := [20, 25, 30] °C
prumer_teplot := mean(teploty)
sd_teplot := stdev(teploty)
rozdil_teplot := 30 °C - 20 °C

posun := [1002, 1005, 1001, 1007] g
prumer_posun := mean(posun)
sd_posun := stdev(posun)

check "prumer 90.9/9 mm": abs(prumer / ((90.9 / 9) mm) - 1) < 1e-13
check "stdev na druhou je var": abs(vyp_sd^2 / vyp_var - 1) < 1e-13
check "vypcetovy je n/(n-1) nasobek": abs(vyp_var / pop_var - 9 / 8) < 1e-13
check "smerkova odchylka teplot je 5": abs(sd_teplot / (5 K) - 1) < 1e-13
check "prumer teplot je teplota": abs(prumer_teplot / (298.15 K) - 1) < 1e-13
check "korelace mensi nebo rovna 1": abs(rho) <= 1
check "posun o 1000 nemeni rozptyl": abs(sd_posun / stdev([2, 5, 1, 7] g) - 1) < 1e-12
