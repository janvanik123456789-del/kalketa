# Farmakokinetika: jednokompartmentový model po nitrožilní dávce
"Podle Case Study 5 předmětu PHA 5127 (University of Florida, College of Pharmacy, 2006, s řešením). Po jednorázové nitrožilní dávce 300 mg a v jiném pokusu 750 mg se v krevní plazmě změřily koncentrace léčiva ve 2., 13. a 24. hodině. Určíme eliminační konstantu, biologický poločas, distribuční objem, clearance a plochu pod křivkou AUC. Pak ověříme, že se léčivo v tomto rozsahu dávek chová lineárně. Obrázek je vlastní."

## Zadání
table Mereni:
    | t [h] | c_300 [mg/L] | c_750 [mg/L] |
    | 2     | 30.72        | 76.8         |
    | 13    | 7.68         | 19.2         |
    | 24    | 1.92         | 4.8          |
D := 300 mg
D_2 := 750 mg
![Jednokompartmentový model: dávka D do kompartmentu o objemu V_d, eliminace s konstantou k_e](images/kompartment.svg){width=60%}

## Eliminace
"V jednokompartmentovém modelu klesá koncentrace exponenciálně, c = c_0·e^(−k_e·t). V semilogaritmickém grafu leží body na přímce; její sklon je eliminační konstanta:"
k_e := ln(Mereni.c_300[1]/Mereni.c_300[3])/(Mereni.t[3] - Mereni.t[1]) | h^-1 {eq}
t_12 := ln(2)/k_e | h {eq}
"Koncentrace v čase 0, protažením přímky zpět:"
c_0 := Mereni.c_300[1]·exp(k_e·Mereni.t[1]) | mg/L
c(x) := c_0·exp(-k_e·x)
plot(Mereni.c_300, c(x), x: Mereni.t, title: "Koncentrace v plazmě po dávce 300 mg") | mg/L

## Distribuční objem a clearance
V_d := D/c_0 | L {eq}
CL := k_e·V_d | L/h {eq}
AUC := D/CL | mg·h/L {eq}
"Zdroj: k_e = 0,126 h⁻¹, V_d = 7,59 L, CL = 0,96 L/h, AUC = 312,5 mg·h/L (z CL zaokrouhlené na 0,96)."
"Lichoběžníkovým pravidlem z naměřených bodů, s koncem křivky c(24 h)/k_e, vyjde AUC větší:"
AUC_l := (c_0 + Mereni.c_300[1])/2·Mereni.t[1] + (Mereni.c_300[1] + Mereni.c_300[2])/2·(Mereni.t[2] - Mereni.t[1]) + (Mereni.c_300[2] + Mereni.c_300[3])/2·(Mereni.t[3] - Mereni.t[2]) + Mereni.c_300[3]/k_e | mg·h/L
"Zdroj: 349,48 mg·h/L. Body jsou od sebe 11 hodin a exponenciála je mezi nimi prohnutá, proto lichoběžníky plochu přeceňují o 11 %."

## Druhá dávka: linearita
k_e2 := ln(Mereni.c_750[1]/Mereni.c_750[3])/(Mereni.t[3] - Mereni.t[1]) | h^-1
c_02 := Mereni.c_750[1]·exp(k_e2·Mereni.t[1]) | mg/L
V_d2 := D_2/c_02 | L
CL_2 := k_e2·V_d2 | L/h
AUC_2 := D_2/CL_2 | mg·h/L
check "Eliminační konstanta nezávisí na dávce": abs(k_e2 - k_e) ≤ 0.0001 h^-1
check "Clearance nezávisí na dávce": abs(CL_2 - CL) ≤ 0.001 L/h
check "AUC roste úměrně dávce (2,5×)": abs(AUC_2/AUC - D_2/D) ≤ 0.001
"Konstanty k_e, t_1/2, V_d a CL nezávisí na dávce a AUC roste s dávkou úměrně: farmakokinetika je v rozsahu 300 až 750 mg lineární."
