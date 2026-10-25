# Tlakové ztráty v potrubí: příkon čerpadla a průtok paralelní větví
"Podle cvičení 11 předmětu Mechanika tekutin I (ZČU v Plzni, Katedra konstruování strojů, Ing. M. Klimko), příklady 4 a 1. Nejdřív příkon čerpadla zahradního rozprašovače: voda se nasává sacím košem z nádrže, vede hladkým potrubím přes koleno a vystřikuje dvanácti dírkami trysky 3 m nad hladinou. Pak dvě paralelní větve vodovodu: jakým průtokem teče delší větev, když kratší teče 0,4 m³/s. Součinitel tření se počítá Blasiovým vztahem jako ve cvičení i Colebrookovou rovnicí, kterou Kalketa řeší jako rovnici. Teorie je ve vrstvě Podklady."
"Zdroj: http://home.zcu.cz/~kovarikp/MT/cviceni/cviceni_MT_11.pdf"

## Příkon čerpadla rozprašovače
D := 30 mm                  ' světlost potrubí
L_1 := 1 m                  ' sání
L_2 := 10 m                 ' výtlak
L_3 := 1 m                  ' přívod k trysce
h := 3 m                    ' výška trysky nad hladinou
Q := 1.2 l/s                ' průtok
n_d := 12                   ' počet dírek trysky
d_d := 2.5 mm               ' průměr dírky
ρ := 1000 kg/m^3
η := 0.001 Pa·s             ' dynamická viskozita vody
η_č := 0.49                 ' účinnost čerpadla
ξ_SK := 0.5                 ' sací koš
ξ_KO := 0.33                ' koleno
ξ_T := 0.8                  ' tryska
g := 9.81 m/s^2
![Zahradní rozprašovač: nádrž se sacím košem, čerpadlo, potrubí s kolenem a tryska ve výšce h nad hladinou](images/rozprasovac.svg){width=75%}
"Rychlost v potrubí a Reynoldsovo číslo; proudění je turbulentní (Re > 2 300):"
w := Q/(π·D^2/4) | m/s
Re := ρ·w·D/η
"Hydraulicky hladké potrubí: součinitel tření z Blasiova vztahu (platí do Re ≐ 10⁵):"
λ := 0.3164/Re^(1/4)
"Pro srovnání Colebrookova rovnice pro hladké potrubí (drsnost 0), řešená pro λ:"
solve λ_C: 1/sqrt(λ_C) == -2·log10(2.51/(Re·sqrt(λ_C))) in 0.005 .. 0.1
"Ztrátová energie na kilogram vody: místní ztráty koše, kolena a trysky a tření po celé délce. (Ve cvičení je ve výčtu součinitelů u trysky omylem 0,5 místo zadaných 0,8; číselný výsledek 14,52 J/kg odpovídá 0,8 a rychlosti zaokrouhlené na 1,7 m/s.)"
e_z := w^2/2·(ξ_SK + ξ_KO + ξ_T + λ·(L_1 + L_2 + L_3)/D) | J/kg
"Voda opouští trysku rychlostí danou průtokem a plochou všech dírek:"
w_t := Q/(n_d·π·d_d^2/4) | m/s
"Bernoulliho rovnice mezi hladinou a výstupem z trysky: měrná práce čerpadla kryje ztráty, kinetickou energii výtoku a výšku."
e_č := e_z + w_t^2/2 + g·h | J/kg
P := ρ·Q·e_č | W
P_p := P/η_č | W
"Kinetická energie výtoku převládá: tryska s dvanácti dírkami 2,5 mm škrtí proud na více než dvacet metrů za sekundu."

## Průtok druhou paralelní větví
D_2 := 0.3 m                ' obě větve
L_A := 1 km
L_B := 3 km
Q_A := 0.4 m^3/s
η_v := 1.138e-3 Pa·s         ' voda 15 °C
ε := 0.26 mm                 ' drsnost potrubí
"Obě větve mají společný začátek i konec, takže tlaková ztráta třením je v nich stejná:"
relation λ_A·L_A/D_2·ρ·w_A^2/2 == λ_B·L_B/D_2·ρ·w_B^2/2 {eq}
w_A := Q_A/(π·D_2^2/4) | m/s
"Cvičení předpokládá λ_A = λ_B (proudění plně turbulentní, λ nezávisí na Re):"
w_B_0 := w_A·sqrt(L_A/L_B) | m/s
Q_B_0 := w_B_0·π·D_2^2/4 | m^3/s
"Ověření předpokladu: Reynoldsova čísla obou větví a relativní drsnost."
Re_A := ρ·w_A·D_2/η_v
Re_B_0 := ρ·w_B_0·D_2/η_v
ε_r := ε/D_2
"Ve zcela drsné oblasti (Re → ∞) by bylo:"
λ_drsne := (-2·log10(ε_r/3.7))^(-2)
"Colebrookova rovnice pro kratší větev, kde známe rychlost:"
solve λ_A: 1/sqrt(λ_A) == -2·log10(ε_r/3.7 + 2.51/(Re_A·sqrt(λ_A))) in 0.005 .. 0.1
"Delší větev: rychlost a součinitel tření závisí jeden na druhém, proto obě rovnice najednou:"
solve (w_B, λ_B): λ_B·L_B·w_B^2 == λ_A·L_A·w_A^2, 1/sqrt(λ_B) == -2·log10(ε_r/3.7 + 2.51·η_v/(ρ·w_B·D_2·sqrt(λ_B))) guess w_B = 3 m/s, λ_B = 0.02
Q_B := w_B·π·D_2^2/4 | m^3/s
Δp := λ_A·L_A/D_2·ρ·w_A^2/2 | kPa
"Předpoklad λ_A = λ_B dává průtok o necelé půl procenta větší: Reynoldsova čísla jsou vysoká, λ se k hodnotě pro zcela drsné potrubí jen blíží."
