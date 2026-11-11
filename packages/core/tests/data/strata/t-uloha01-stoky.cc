# Úloha 01 — kanalizační stoka: normální hloubka, kapacita profilu, kalibrační křivka
# Zadání: stoka DN 500, sklon 0,5 %, drsnost n = 0,013, průtok 80 l/s.
# Očekávané hodnoty pocházejí z uloha01-stoky.ref.py (mpmath, 40 číslic).
D := 0.5 m
S := 0.005
n := 0.013 s / m^(1/3)
g := 9.80665 m / s^2
Q := 0.08 m^3 / s
phi(h) := acos(1 - 2·h / D)
obsah(h) := D^2 / 8 · (2·phi(h) - sin(2·phi(h)))
obvod(h) := D · phi(h)
sirka(h) := D · sin(phi(h))
Rv(h) := obsah(h) / obvod(h)
prutok(h) := 1 / n · obsah(h) · Rv(h)^(2/3) · sqrt(S)
rychlost(h) := Q / obsah(h)
Fr(h) := rychlost(h) / sqrt(g · obsah(h) / sirka(h))
h_norm := 0.187648857998637 m
A_norm := obsah(h_norm)
P_norm := obvod(h_norm)
R_norm := Rv(h_norm)
V_norm := rychlost(h_norm)
Fr_norm := Fr(h_norm)
Q_zpet := prutok(h_norm)
A_identita := D^2 / 4 · phi(h_norm) - (D - 2·h_norm) / 2 · sqrt(h_norm · (D - h_norm))
h_rovnice := minimize((prutok(x) - Q)^2, x: 0.01 m .. 0.49 m)
h_hledana := first(prutok(x) > Q, x: 1 cm .. 49 cm)
h_max := maximize(prutok(x), x: 0.01 m .. 0.49 m)
Q_max := prutok(h_max)
Q_plny := prutok(D)
Q_polovina := prutok(D / 2)
h_krit := minimize((Fr(x) - 1)^2, x: 0.05 m .. 0.49 m)
h_mridzka := vector(i · 5 cm, i: 1..9)
Q_mridzka := vector(prutok(i · 5 cm), i: 1..9)
Q_110 := 0.11 m^3 / s
h_110 := minimize((prutok(x) - Q_110)^2, x: 0.01 m .. 0.49 m)
h_110_interp := interp1(Q_mridzka, h_mridzka, Q_110)
F_pow := fit(Q_mridzka, x: h_mridzka, kind: "power")
b_exponent := F_pow[2]
b_zaklad := F_pow[1]
r_pow := fit_r2(F_pow)
A_ref := 0.0673254845673955 m^2
P_ref := 0.659365491198377 m
R_ref := 0.102106472762221 m
V_ref := 1.18825732208309 m / s
Fr_ref := 1.01758962680197
Qpol_ref := 0.133500088286009 m^3 / s
Qmax_ref := 0.287213726489525 m^3 / s
hmax_ref := 0.469090608080304 m
hkr_ref := 0.189356987847705 m
h110_ref := 0.223608716575619 m
h110i_ref := 0.22300348210014 m
bexp_ref := 1.8149718343309975
check "obsah výseče A": abs(A_norm / A_ref - 1) < 1e-12
check "A z druhého vzorce (metamorfie)": abs(A_identita / A_ref - 1) < 1e-12
check "smáčený obvod": abs(P_norm / P_ref - 1) < 1e-12
check "hydrulický poloměr": abs(R_norm / R_ref - 1) < 1e-12
check "rychlost": abs((V_norm · 1 s^2 / m) / (V_ref · 1 s^2 / m) - 1) < 1e-12
check "Froude": abs(Fr_norm / Fr_ref - 1) < 1e-12
check "zpětný průtok z hloubky": abs(Q_zpet / Q - 1) < 1e-12
check "normální hloubka z minimalizace": abs(h_rovnice / h_norm - 1) < 1e-6
check "hloubka z celočíselného prohledávání (krok 1 cm)": abs(h_hledana - 19 cm) < 1e-9 m
check "umístění maxima průtoku": abs(h_max / hmax_ref - 1) < 1e-6
check "hodnota maximálního průtoku": abs(Q_max / Qmax_ref - 1) < 1e-12
check "poměr maximum na plný profil": abs(Q_max / Q_plny / 1.075706129400465 - 1) < 1e-12
check "průtok na poloviční hloubce": abs(Q_polovina / Qpol_ref - 1) < 1e-12
check "kritická hloubka (Fr = 1)": abs(h_krit / hkr_ref - 1) < 1e-4
check "hloubka pro 110 l/s": abs(h_110 / h110_ref - 1) < 1e-6
check "interpolační hloubka": abs((h_110_interp · 1 / m) / (h110i_ref · 1 / m) - 1) < 1e-9
check "mocninný exponent": abs(b_exponent / bexp_ref - 1) < 1e-9
