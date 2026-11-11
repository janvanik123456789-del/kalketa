# Úloha 05 — vodorovný válcový tank: objem podle výšky hladiny, zpětný výpočet, náplň
# Zadání: válec D = 2,4 m (R = 1,2 m), délka L = 6 m, plnicí průtok 3,5 l/s.
# V(h) = L [ R² acos(1 - h/R) - (R - h) sqrt(2Rh - h²) ]; hladina pro 12 m³; čas na 60 %.
# Očekávané hodnoty: uloha05-nadrz.ref.py (mpmath, 40 číslic).
R := 1.2 m
L := 6 m
D := 2 · R
Q := 3.5 l / s
V(h) := L · (R^2 · acos(1 - h / R) - (R - h) · sqrt(2·R·h - h^2))
A(h) := 2 · L · sqrt(2·R·h - h^2)
V_total := pi · R^2 · L
V_nula := V(0 m)
V_plny := V(D)
V_polovina := V(R)
V_1 := V(1 m)
V_07 := V(0.7 m)
V_17 := V(1.7 m)
metamorfie := V_07 + V_17
rad := vector(V(i · 20 cm), i: 1..11)
prirustek := min(diff(rad))
A_numeric := derivative(V(h), h: 1.2 m)
A_analyticka := A(1.2 m)
sklon_A := derivative(A(h), h: 1.2 m)
druha := derivative(x^3, x: 2, order: 2)
h_12 := minimize((V(x) - 12 m^3)^2, x: 0.1 m .. 1.1 m)
kontrola := V(h_12)
cas60 := 0.6 · V_total / Q
cas60_h := cas60 / (3600 s)
check "prázdný tank": abs(V_nula) < 1e-12 m^3
check "plný tank na uzavřený vzorec": abs(V_plny / (27.14336052701581358 m^3) - 1) < 1e-12
check "polovina výšky je půlka objemu": abs(V_polovina / (0.5 · V_total) - 1) < 1e-12
check "V_1": abs(V_1 / (10.705069711105883124 m^3) - 1) < 1e-12
check "metamorfie V(h) + V(D-h) = V celkem": abs(metamorfie / V_total - 1) < 1e-12
check "nejmenší přírůstek objemu po 20 cm": abs(prirustek / (1.8932094498640167206 m^3) - 1) < 1e-12
check "objem roste": prirustek > 0 m^3
check "plocha hladiny z derivace": abs(A_numeric / (14.4 m^2) - 1) < 1e-6
check "plocha hladiny ze vzorce": abs(A_analyticka / (14.4 m^2) - 1) < 1e-12
check "derivace plochy je v půlce nula": abs(sklon_A) < 1e-4 m
check "druhá derivace x³ v 2": abs(druha / 12 - 1) < 1e-9
check "hladina pro 12 m³": abs(h_12 / (1.0907042376131339041 m) - 1) < 1e-6
check "objem při nalezené hladině": abs(kontrola / (12 m^3) - 1) < 1e-8
check "čas náplně na 60 %": abs(cas60 / (4653.1475189169966138 s) - 1) < 1e-12
check "čas náplně v hodinách": abs(cas60_h / 1.2925409774769435038 - 1) < 1e-12
