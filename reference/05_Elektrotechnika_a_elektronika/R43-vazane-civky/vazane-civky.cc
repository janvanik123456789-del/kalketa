# Proudy a výkon dvou magneticky vázaných cívek se zátěží
"Vlastní zadání: primární cívka je připojená na zdroj 230 V, 50 Hz. Na ni je magneticky vázaná sekundární cívka se zátěží R_z. Hledáme fázory obou proudů, činný výkon a účinnost přenosu. Vzájemná indukčnost provazuje obě rovnice, a proto vznikne soustava s komplexními koeficienty. Cívky jsou lineární, bez ztrát v železe. Obrázek je vlastní."
"Zdroj: vlastní zadání, ověřeno odraženou impedancí (oddíl 4 listu) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
U := 230 V               ' efektivní hodnota, fáze 0
f := 50 Hz
R_1 := 2 Ω               ' odpor primárního vinutí
L_1 := 40 mH             ' indukčnost primárního vinutí
R_2 := 1 Ω               ' odpor sekundárního vinutí
L_2 := 10 mH             ' indukčnost sekundárního vinutí
M := 15 mH               ' vzájemná indukčnost
R_z := 6 Ω               ' zátěž
![Schéma: zdroj U, primární vinutí R_1, L_1, vzájemná indukčnost M, sekundární vinutí L_2, R_2 a zátěž R_z](images/schema.svg){width=75%}

## Impedance
ω := 2·π·f | rad/s
k := M/sqrt(L_1·L_2)
Z_1 := R_1 + 1j·ω·L_1 | Ω
Z_2 := R_2 + R_z + 1j·ω·L_2 | Ω
Z_M := 1j·ω·M | Ω

## Rovnice smyček
"Pro každou smyčku platí druhý Kirchhoffův zákon. Člen s M je napětí indukované proudem druhé cívky; znaménko odpovídá tečkám vinutí podle obrázku. Matice je komplexní a lsolve ji řeší přímo."
Z_s := [Z_1, -Z_M | -Z_M, Z_2]
I := lsolve(Z_s, [U | 0 V])
I_1 := I[1] | A {polar}
I_2 := I[2] | A {polar}
I_1a := abs(I_1) | A
I_2a := abs(I_2) | A
φ_1 := arg(I_1) | rad

## Výkon
S := U·conj(I_1) | VA
P := re(S) | W
Q := im(S) | W
P_1 := R_1·I_1a^2 | W
P_2 := R_2·I_2a^2 | W
P_z := R_z·I_2a^2 | W
η := P_z/P | %

## Kontrola odraženou impedancí
"Ze druhé rovnice se vyjádří I_2 a dosadí do první. Sekundár se tak do primáru promítne jako impedance (ω·M)²/Z_2 a proud I_1 vyjde bez matice."
Z_v := Z_1 + (ω·M)^2/Z_2 | Ω
I_1v := U/Z_v | A {polar}

## Výkon v zátěži podle jejího odporu
"Stejné vyloučení I_2 dá výkon v zátěži jako funkci jejího odporu. Graf ukazuje, že se s rostoucím odporem výkon nejdřív zvětšuje a pak klesá."
P_zat(R_x) := R_x·(ω·M·U/abs(Z_1·(R_2 + R_x + 1j·ω·L_2) + (ω·M)^2))^2
plot(P_zat(R_x), R_x: 0.5 Ω .. 40 Ω, title: "Výkon v zátěži podle odporu zátěže", xlabel: "R_z", ylabel: "P_z") | W

## Posudky
check "Činný výkon zdroje se rovná ztrátám a výkonu v zátěži": abs(P - P_1 - P_2 - P_z) ≤ 0.001 W
check "Proud I_1 jako z odražené impedance": abs(I_1 - I_1v) ≤ 0.000001 A
check "Řešení splňuje rovnici první smyčky": abs(Z_1·I_1 - Z_M·I_2 - U) ≤ 0.000001 V
check "Funkce výkonu dá při R_z stejnou hodnotu": abs(P_zat(R_z) - P_z) ≤ 0.001 W
check "Činitel vazby nejvýše 1": k ≤ 1
"Primárem teče 18,7 A a sekundárem 11,5 A. Do zátěže jde 793 W z 1 625 W činného výkonu, účinnost je 48,8 %. Zbytek se ztrácí hlavně v odporu primárního vinutí, kterým teče velký magnetizační proud."
