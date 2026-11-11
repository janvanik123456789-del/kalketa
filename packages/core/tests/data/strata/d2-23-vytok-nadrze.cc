# Výtok z nádrže (Torricelli)

D_n := 1 m                    ' průměr nádrže
D_o := 20 mm                  ' průměr výpusti
g := 9.81 m/s^2
A_n := π·D_n²/4 | m²
A_o := π·D_o²/4 | m²
h_0 := 4 m                    ' počáteční výška hladiny
"Torricelliho rychlost výtoku je √(2·g·h); spojité řešení dává hladinu klesající."
dh(h) := -(A_o/A_n)·sqrt(2·g·h) | m/s
"Analytický čas vyprázdnění: t_v = 2·A_n·√h_0/(A_o·√(2g))."
t_v := 2·A_n·sqrt(h_0)/(A_o·sqrt(2·g)) | s
"Řeší se do devadesáti procent času vyprázdnění; v nule má pravá strana odmocninovou singularitu."
solve h(t): h′ == dh(h) in 0 s .. 0.9·t_v
    h(0 s) == h_0
"Analytický průběh hladiny: h(t) = (√h_0 − (A_o/A_n)·√(g/2)·t)²."
h_a(t) := (sqrt(h_0) - (A_o/A_n)·sqrt(g/2)·t)^2 | m
h_60 := h(60 s) | m
h_60a := h_a(60 s) | m
h_300 := h(300 s) | m
h_300a := h_a(300 s) | m
h_konec := h(0.9·t_v) | m
h_koneca := h_a(0.9·t_v) | m
check "Hladina v 60 s": abs(h_60 - h_60a) < 1e-6 m
check "Hladina ve 300 s": abs(h_300 - h_300a) < 1e-6 m
check "Hladina na konci intervalu": abs(h_konec - h_koneca) < 1e-6 m
"Hladina klesá monotóně."
check "Monotónní pokles": h(60 s) > h(300 s)
"Čas vyprázdnění z analytického průběhu: doba, kdy h_0 klesne na nulu."
t_v_ana := sqrt(h_0)/((A_o/A_n)·sqrt(g/2)) | s
check "Čas vyprázdnění ze dvou zápisů": t_v == t_v_ana
"Z časového průběhu hladiny obráceně: čas, kdy je hladina 0,4 m."
solve t_04: h_a(t_04) == 0.4 m in 1 s .. t_v
t_04_ana := (sqrt(h_0) - sqrt(0.4 m))/((A_o/A_n)·sqrt(g/2)) | s
check "Čas na hladinu 0,4 m": abs(t_04 - t_04_ana)/t_04_ana < 1e-6
