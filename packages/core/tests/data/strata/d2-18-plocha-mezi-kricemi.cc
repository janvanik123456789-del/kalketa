# Plocha mezi křivkami y = x a y = x²

"Obě křivky mají rozměr délky: x je délka v metrech, proto se x² dělí metrům, aby zůstaly metry."
S := integral(x - x·x/(1 m), x: 0 m .. 1 m) | m²
"Uzavřený tvar: ∫₀¹ (x − x²) dx = 1/2 − 1/3 = 1/6."
S_ana := (1/2 - 1/3) m² | m²
check "Plocha mezi křivkami": abs(S - S_ana) < 1e-9 m²
"Plocha stejným výpočtem bez jednotek, pro porovnání číslice."
S_bez := integral(u - u², u: 0 .. 1)
check "Rozměrově i bez jednotek": abs(S_bez - 1/6) < 1e-9
