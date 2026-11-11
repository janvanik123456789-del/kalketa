# Úloha 04 — směování dvou odpadních vod, dávkování koagulantu, rozpad polutantu
# Zadání: Q1 = 12,5 l/s při 340 mg/L, Q2 = 8,2 l/s při 95 mg/L; limit na odtoku 35 mg/L.
# Účinnost koagulace z pilotního provozu: R(d) = -0,00025 d² + 0,0236 d + 0,31 (d v mg/L).
# Cena koagulantu 4,20 CZK/kg. Rozpad na odtoku: první řád, k = 0,35 /den.
# Očekávané hodnoty: uloha04-smes.ref.py (Fraction + mpmath, 40 číslic).
Q1 := 12.5 l / s
c1 := 340 mg / L
Q2 := 8.2 l / s
c2 := 95 mg / L
Q := Q1 + Q2
zatizeni := Q1 · c1 + Q2 · c2
c_smes := zatizeni / Q
kg_den := zatizeni · 86400 s
a := -0.00025 l^2 / mg^2
b := 0.0236 l / mg
c := 0.31
R(d) := a · d^2 + b · d + c
N := 35 mg / L
R_poz := 1 - N / c_smes
d_hvezda := maximize(R(x), x: 0 mg/L .. 100 mg/L)
R_max := R(d_hvezda)
d_davka := minimize((R(x) - R_poz)^2, x: 10 mg/L .. 47.2 mg/L)
R_overeni := R(d_davka)
m_koag := d_davka · Q · 1 d
cena := m_koag · (4.20 CZK / kg)
N2 := 20 mg / L
R_poz2 := 1 - N2 / c_smes
k_r := 0.35 / d
C0 := 35 mg / L
C_trsi := C0 · exp(-k_r · 3 d)
t_pol := ln(2) / k_r
dt := 0.05 d
table Euler60: {rows=1..60}
    | n | C = prev(C, C0) · (1 - k_r · dt) |
e60 := Euler60.C[60]
dt2 := 0.025 d
table Euler120: {rows=1..120}
    | n | C = prev(C, C0) · (1 - k_r · dt2) |
e120 := Euler120.C[120]
pomer := (C_trsi - e60) / (C_trsi - e120)
check "průtok směsi": abs(Q / (20.7 l / s) - 1) < 1e-12
check "zatížení směsi": abs(zatizeni / (5029 mg / s) - 1) < 1e-12
check "koncentrace směsi": abs(c_smes / (242.94685990338164251 mg / L) - 1) < 1e-12
check "zatížení za den": abs(kg_den / (434.5056 kg) - 1) < 1e-12
check "požadovaná účinnost": abs(R_poz / 0.85593557367269834957 - 1) < 1e-12
check "dávka s nejvyšší účinností (maximize má krok ~1e-8)": abs(d_hvezda / (47.2 mg / L) - 1) < 1e-6
check "nejvyšší možná účinnost": abs(R_max / 0.86696 - 1) < 1e-12
check "dávka pro limit 35 mg/L": abs(d_davka / (40.559389688499512494 mg / L) - 1) < 1e-6
check "účinnost v nalezené dávce": abs(R_overeni / R_poz - 1) < 1e-8
check "denní spotřeba koagulantu": abs((m_koag / (1 kg)) / 72.539657270087608105 - 1) < 1e-6
check "cena za den": abs(cena / (304.66656053436795404 CZK) - 1) < 1e-6
check "limit 20 mg/L je mimo rozsah účinnosti": R_poz2 > R_max
check "koncentrace po 3 dnech": abs(C_trsi / (12.247821218890437414 mg / L) - 1) < 1e-12
check "poločas rozpadu": abs(t_pol / (1.9804205158855580269 d) - 1) < 1e-12
check "Euler s krokem 0,05 dne": abs(e60 / (12.134491651077527312 mg / L) - 1) < 1e-12
check "Euler s krokem 0,025 dne": abs(e120 / (12.191357968819073051 mg / L) - 1) < 1e-12
check "Euler konverguje zespoda": e60 < C_trsi
check "řád konvergence je jedna": abs(pomer / 2.0071385842945975526 - 1) < 1e-6
