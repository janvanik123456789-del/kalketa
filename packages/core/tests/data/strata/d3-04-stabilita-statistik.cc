# 04 — stabilita statistickych vzorcu pri velkych hodnotach
# Reference: presny vypoct ve zlomcích (fractions). Naivni jednoprechodovy vzorec
# Sum(x^2) - (Sum x)^2/n by zde prisel o vsechny platne cislice.

velke := [1e9 + 1, 1e9 + 2, 1e9 + 3, 1e9 + 4]
v_var := var(velke)
v_sd := stdev(velke)
v_prumer := mean(velke)

male := [1e-9 + 3, 1e-9 + 7, 1e-9 + 5]
m_var := var(male)

smes := [1e16, 1, -1e16, 1]
s_sum := sum(smes)

skoro_stale2 := [1, 1 + 1e-13, 1 - 1e-13, 1 + 2e-13]
s_odchylka := stdev(skoro_stale2)
korelace_male := corr([1, 2, 3], [1e-12, 2e-12, 3e-12])

meritka := [1e-4, 1e-2, 1, 100, 10000]
rozptyl_meritek := var(meritka)
pomer_sd := stdev(meritka) / sqrt(rozptyl_meritek)

check "rozptyl dat kolem 1e9 je 5/3": abs(v_var / (5 / 3) - 1) < 1e-9
check "prumer dat kolem 1e9": abs(v_prumer / (1e9 + 2.5) - 1) < 1e-15
check "scitani s klesajici velikosti": s_sum == 2
check "korelace nemeni meritko": abs(korelace_male - 1) < 1e-12
check "stdev a odmocnina varu sedi": abs(pomer_sd - 1) < 1e-13
