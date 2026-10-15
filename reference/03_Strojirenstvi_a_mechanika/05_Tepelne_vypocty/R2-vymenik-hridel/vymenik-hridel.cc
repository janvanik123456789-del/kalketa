# Tepelná bilance výměníku a hřídel na krut
"Referenční výpočet R2: tepelná bilance deskového výměníku voda–voda a hřídel oběhového čerpadla."

## Tepelná bilance výměníku
m_1 := 2.5 kg/s                          ' otopná voda
θ_1in := 90 °C
θ_1out := 60 °C
m_2 := 3 kg/s                            ' ohřívaná voda
θ_2in := 15 °C
c_p := 4.18 kJ/(kg·K)
Q := m_1·c_p·(θ_1in - θ_1out) | kW
θ_2out := θ_2in + Q/(m_2·c_p)
ΔT_1 := θ_1in - θ_2out
ΔT_2 := θ_1out - θ_2in
ΔT_ln := (ΔT_1 - ΔT_2)/ln(ΔT_1/ΔT_2) | K
k := 1200 W/(m²·K)                       ' součinitel prostupu tepla
A := Q/(k·ΔT_ln) | m²

## Hřídel čerpadla (krut)
P := 15 kW
n := 1450 rpm
M_k := P/(2·π·n) | N·m
material := pick(Materialy, "11 600")
τ_krut(M, d) := 16·M/(π·d³)
solve d_min: τ_krut(M_k, d_min) == material.τ_dov in 5 mm .. 100 mm
d := 30 mm
τ := τ_krut(M_k, d) | MPa

## Posouzení
check "Výstupní teplota ohřívané vody": θ_2out ≤ 45 °C     source "zadání"
check "Krut hřídele": τ ≤ material.τ_dov                  source "ČSN 01 4903"
check "Průměr hřídele": d_min ≤ d                          source "ČSN 01 4903"
