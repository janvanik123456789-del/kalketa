# Úloha 02 — protiproudý tepelný výměník: effectiveness-NTU, LMTD, zásobník
# Zadání: teplá voda 0,5 kg/s z 90 °C, studená 0,8 kg/s z 15 °C, cp = 4186 J/(kg·K), UA = 3500 W/K.
# Očekávané hodnoty: uloha02-vymenik.ref.py (mpmath, 40 číslic).
mdot_h := 0.5 kg / s
mdot_c := 0.8 kg / s
cp := 4186 J / (kg · K)
T_h := 90 °C
T_c := 15 °C
UA := 3500 W / K
Ch := mdot_h · cp
Cc := mdot_c · cp
Cmin := min(Ch, Cc)
Cmax := max(Ch, Cc)
Cr := Cmin / Cmax
NTU := UA / Cmin
eps := (1 - exp(-NTU · (1 - Cr))) / (1 - Cr · exp(-NTU · (1 - Cr)))
vykon := eps · Cmin · (T_h - T_c)
T_h_out := T_h - vykon / Ch
T_c_out := T_c + vykon / Cc
dT1 := T_h - T_c_out
dT2 := T_h_out - T_c
LMTD := (dT1 - dT2) / ln(dT1 / dT2)
UA_zpet := vykon / LMTD
eps_Cr1 := NTU / (1 + NTU)
eps_Bl := (1 - exp(-NTU · (1 - 0.999999))) / (1 - 0.999999 · exp(-NTU · (1 - 0.999999)))
ztratena_presnost := abs(eps_Bl / 0.62578281519032264113 - 1)
rozdil_T := T_h - T_c
m := 400 kg
hA := 250 W / K
T_okoli := 20 °C
tau := m · cp / hA
cas := -tau · ln((40 °C - T_okoli) / (80 °C - T_okoli))
T_po_10h := T_okoli + (80 °C - T_okoli) · exp(-10 · 3600 s / tau)
check "teplospolná kapacita teplé strany": abs(Ch / (2093 W / K) - 1) < 1e-12
check "kritická kapacita": abs(Cmin / (2093 W / K) - 1) < 1e-12
check "poměr kapacit Cr": abs(Cr / 0.625 - 1) < 1e-12
check "NTU": abs(NTU / 1.6722408026755852843 - 1) < 1e-12
check "účinnost eps": abs(eps / 0.69931569982997852257 - 1) < 1e-12
check "tepelný tok": abs(vykon / (109775.08198081087858 W) - 1) < 1e-12
check "výstup teplé strany": abs(T_h_out - 37.551322512751610807 °C) < 1e-9 °C
check "výstup studené strany": abs(T_c_out - 47.780423429530243246 °C) < 1e-9 °C
check "LMTD": abs(LMTD / (31.364309137374536737 K) - 1) < 1e-12
check "zpětná kontrola UA z LMTD": abs(UA_zpet / UA - 1) < 1e-12
check "rozdíl teplot jako rozdíl": abs(rozdil_T / (75 K) - 1) < 1e-12
check "časová konstanta zásobníku": abs(tau / (6697.6 s) - 1) < 1e-12
check "čas vychladnutí na 40 °C": abs(cas / (7358.0656645835314691 s) - 1) < 1e-12
check "teplota po 10 hodinách": abs(T_po_10h - 20.277838530197671889 °C) < 1e-9 °C
check "u Cr -> 1 neztrácí více než 6 míst": ztratena_presnost < 1e-6

