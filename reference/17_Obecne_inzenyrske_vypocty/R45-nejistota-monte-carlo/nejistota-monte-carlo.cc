# Nejistota výkonu na rezistoru metodou Monte Carlo
"Vlastní zadání: na rezistor je přiloženo napětí 230 V se standardní nejistotou 3 V (normální rozdělení). Odpor rezistoru je 52 Ω s tolerancí ±2 Ω, uvnitř tolerance bereme každou hodnotu za stejně pravděpodobnou. Hledáme výkon P = U²/R a jeho nejistotu. Počítáme třemi způsoby: lineárním šířením podle GUM, simulací Monte Carlo a přesně z momentů rozdělení."
"Zdroj: vlastní zadání podle postupu JCGM 100 (GUM) a JCGM 101 (doplněk 1, Monte Carlo), ověřeno přesnými momenty (oddíl 4 listu) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
U_0 := 230 V             ' napětí
u_U := 3 V               ' jeho standardní nejistota
R_0 := 52 Ω              ' jmenovitý odpor
a_R := 2 Ω               ' polovina tolerance odporu
n := 5000                ' počet pokusů simulace

## Lineární šíření nejistoty (GUM)
"Rovnoměrné rozdělení o pološířce a má standardní nejistotu a/√3. Citlivosti jsou parciální derivace výkonu podle napětí a podle odporu v jmenovitém bodě."
P_0 := U_0^2/R_0 | W
u_R := a_R/sqrt(3) | Ω
c_U := 2·U_0/R_0 | W/V
c_R := -U_0^2/R_0^2 | W/Ω
u_P := sqrt((c_U·u_U)^2 + (c_R·u_R)^2) | W

## Simulace Monte Carlo
"Pro každý pokus se vylosuje napětí a odpor a spočte výkon. Semínka 1 a 2 dělají simulaci opakovatelnou, takže list při každém otevření ukáže stejná čísla a dá se zkontrolovat. Interval 95 % je mezi kvantily 2,5 % a 97,5 %."
U_s := rndn(n, 1, U_0, u_U)
R_s := rnd(n, 2, R_0 - a_R, R_0 + a_R)
P_s := U_s^2/R_s
P_mc := mean(P_s) | W
u_mc := stdev(P_s) | W
P_lo := quantile(P_s, 0.025) | W
P_hi := quantile(P_s, 0.975) | W
plot(P_s, kind: "hist", bins: 40, title: "Rozdělení výkonu ze simulace") | W

## Přesné momenty
"U a R jsou nezávislé, proto je střední hodnota součinu součinem středních hodnot: E[P] = E[U²]·E[1/R]. Obě střední hodnoty se dají spočítat přesně, u rovnoměrného rozdělení integrálem 1/R přes interval tolerance."
E_U2 := U_0^2 + u_U^2 | V^2
E_U4 := U_0^4 + 6·U_0^2·u_U^2 + 3·u_U^4 | V^4
E_R1 := ln((R_0 + a_R)/(R_0 - a_R))/(2·a_R) | 1/Ω
E_R2 := (1/(R_0 - a_R) - 1/(R_0 + a_R))/(2·a_R) | 1/Ω^2
P_e := E_U2·E_R1 | W
u_e := sqrt(E_U4·E_R2 - P_e^2) | W

## Posudky
check "Střední hodnota ze simulace jako přesná, v rozptylu simulace": abs(P_mc - P_e) ≤ 3·u_e/sqrt(n)
check "Nejistota ze simulace jako přesná, do 2 %": abs(u_mc - u_e) ≤ 0.02·u_e
check "Lineární odhad GUM jako přesná nejistota, do 1 %": abs(u_P - u_e) ≤ 0.01·u_e
check "Interval 95 % ze simulace jako P_0 ± 2·u_P, do 1 %": abs(P_lo - (P_0 - 2·u_P)) ≤ 0.01·P_0 and abs(P_hi - (P_0 + 2·u_P)) ≤ 0.01·P_0
"Výkon je 1 017 W se standardní nejistotou 35 W. Všechny tři postupy se tu shodují, protože nejistoty jsou malé proti hodnotám a model je v jejich rozsahu téměř lineární. Střední hodnota výkonu je jen o necelý watt větší než výkon v jmenovitém bodě. Simulace se vyplatí, až model zakřiví víc: pak lineární odhad zkreslí interval a simulace ne."
