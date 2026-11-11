# 05 — statistika prolozeni: smernice, usek, R2, chyba koeficientu
# Reference: presny vzorec nejmensich ctvercu ve zlomcích (fractions),
# směrodatna odchylka bodu od krivky s n-2 stupni volnosti.

xs := [1, 2, 3, 4, 5, 6]
ys := [2.3, 4.9, 6.8, 9.1, 11.2, 12.9]
F := fit(ys, x: xs, kind: "linear")
sm := F[1]
us := F[2]
r2 := fit_r2(F)
s_bodu := fit_s(F)
chyby := fit_se(F)

n := len(xs)
sx := sum(xs)
sy := sum(ys)
sxx := sum(xs·xs)
sxy := sum(xs·ys)
ssyy := sum(ys·ys)
sm_sour := (n·sxy - sx·sy) / (n·sxx - sx^2)
us_sour := (sy - sm_sour·sx) / n
rez := ys - (sm_sour·xs + us_sour)
sse := sum(rez·rez)
sst := sum((ys - mean(ys))^2)
s2 := sse / (n - 2)
s_sm := sqrt(s2·n / (n·sxx - sx^2))
s_us := sqrt(s2·sxx / (n·sxx - sx^2))
r2_sour := 1 - sse / sst

check "smernice presnou aritmetikou": abs(sm / sm_sour - 1) < 1e-12
check "usek presnou aritmetikou": abs(us / us_sour - 1) < 1e-12
check "R2 sedí": abs(r2 - r2_sour) < 1e-12
check "chyba smernice sedi": abs(chyby[1] / s_sm - 1) < 1e-10
check "chyba useku sedi": abs(chyby[2] / s_us - 1) < 1e-10
check "odchylka bodu od krivky": abs(s_bodu / sqrt(s2) - 1) < 1e-10
