# Vybíjení kondenzátoru RC

R := 1 kΩ                     ' odpor
C := 1000 μF                  ' kapacita
U_0 := 5 V                    ' počáteční napětí
τ := R·C | s
"Diferenciální rovnice vybíjení: du/dt = −u/(R·C), počáteční podmínka u(0) = U_0."
solve u(t): u′ == -u/(R·C) in 0 s .. 5 s
    u(0 s) == U_0
"Pět bodů proti analytickému průběhu U_0·e^(−t/τ)."
u_1 := u(1 s) | V
u_1a := U_0·exp(-1 s/τ) | V
u_2 := u(2 s) | V
u_2a := U_0·exp(-2 s/τ) | V
u_3 := u(3 s) | V
u_3a := U_0·exp(-3 s/τ) | V
u_4 := u(4 s) | V
u_4a := U_0·exp(-4 s/τ) | V
u_5 := u(5 s) | V
u_5a := U_0·exp(-5 s/τ) | V
check "Bod 1 s": abs(u_1 - u_1a) < 1e-6 V
check "Bod 2 s": abs(u_2 - u_2a) < 1e-6 V
check "Bod 3 s": abs(u_3 - u_3a) < 1e-6 V
check "Bod 4 s": abs(u_4 - u_4a) < 1e-6 V
check "Bod 5 s": abs(u_5 - u_5a) < 1e-6 V
"Po pěti časových konstantách zbývá méně než jedno procento napětí."
check "Pokles pod 1 %": u_5 < 0.01·U_0
