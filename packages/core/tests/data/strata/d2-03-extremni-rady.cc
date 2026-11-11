# Extrémní řády – rok světla a Planckova délka

"Zdroj konstant: CODATA 2018, hodnoty jsou přesně definované nebo doporučené."
c := 299792458 m/s                ' rychlost světla ve vakuu, přesně
G := 6.6743e-11 m³/(kg·s²)        ' gravitační konstanta
h_P := 6.62607015e-34 J·s         ' Planckova konstanta, přesně
ħ := h_P/(2·π) | J·s
l_P := sqrt(ħ·G/c³) | m
"Rok světla je dráha světla za julianický rok, jednotka ly je v Kalkete přesná."
ly_m := 1 ly | m
ly_km := 1 ly | km
"Poměr obou délek v jednom výrazu přesahuje čtyřicet řádů."
Pomer := (1 ly)/l_P
radu := ln(Pomer)/ln(10)
check "Více než čtyřicet řádů": radu > 40
check "Planckova délka je kladná": l_P > 0 m
