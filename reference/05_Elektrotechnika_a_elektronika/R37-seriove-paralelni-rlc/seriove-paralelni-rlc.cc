# Proudy a napětí sériově-paralelního obvodu RLC
"Podle oddílu 5.4 Series-parallel R, L, and C z knihy Lessons In Electric Circuits, Vol. II – AC (T. R. Kuphaldt, Design Science License, využita čísla a zadání, text a obrázky jsou naše): ze zdroje střídavého napětí 120 V, 60 Hz je napájen kondenzátor C_1 v sérii s paralelní kombinací rezistoru R a větve cívka L – kondenzátor C_2. Určíme impedanci obvodu, proudy a napětí na všech prvcích a výkon. Zdroj počítá s ideálními prvky a zadává fázory v efektivních hodnotách; zdroj napětí bereme s nulovou fází."
"Zdroj: T. R. Kuphaldt, Lessons In Electric Circuits, Vol. II – AC, oddíl 5.4, https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC.pdf"

## Zadání
E := 120 V            ' efektivní hodnota napětí zdroje, fáze 0
f := 60 Hz
C_1 := 4.7 μF
L := 650 mH
R := 470 Ω
C_2 := 1.5 μF
![Schéma obvodu: zdroj E, kondenzátor C_1 v sérii, za uzlem A paralelně rezistor R a větev L – C_2, zpět uzlem B](images/schema.svg){width=80%}

## Impedance prvků
"Úhlová frekvence zdroje:"
ω := 2·π·f | rad/s
"Impedance kondenzátoru je záporná imaginární (proud předbíhá napětí), impedance cívky kladná imaginární, rezistoru reálná:"
Z_C1 := -1j/(ω·C_1) | Ω
Z_L := 1j·ω·L | Ω
Z_C2 := -1j/(ω·C_2) | Ω
Z_R := R

## Celková impedance
"Větev L – C_2 je sériová, proto se impedance sčítají:"
Z_LC2 := Z_L + Z_C2 | Ω
"Rezistor a větev L – C_2 jsou paralelně, sčítají se převrácené hodnoty:"
Z_p := 1/(1/Z_R + 1/Z_LC2) | Ω
"Celková impedance je kondenzátor C_1 v sérii s paralelní částí:"
Z := Z_C1 + Z_p | Ω {polar}
Z_abs := abs(Z) | Ω
φ_Z := arg(Z) | °

## Proudy a napětí
"Proud ze zdroje a napětí na C_1 a na paralelní části:"
I := E/Z | mA {polar}
E_C1 := I·Z_C1 | V {polar}
E_p := I·Z_p | V {polar}
"Proud rezistorem a větví L – C_2 z napětí na paralelní části:"
I_R := E_p/Z_R | mA {polar}
I_LC2 := E_p/Z_LC2 | mA {polar}
"Napětí na cívce a na kondenzátoru C_2:"
E_L := I_LC2·Z_L | V {polar}
E_C2 := I_LC2·Z_C2 | V {polar}
I_abs := abs(I) | mA
E_C1_abs := abs(E_C1) | V
E_p_abs := abs(E_p) | V
I_R_abs := abs(I_R) | mA
I_LC2_abs := abs(I_LC2) | mA
E_L_abs := abs(E_L) | V
E_C2_abs := abs(E_C2) | V
check "Kirchhoffův zákon pro napětí": abs(E_C1 + E_p - E) ≤ 1e-9 V
check "Kirchhoffův zákon pro proudy": abs(I_R + I_LC2 - I) ≤ 1e-9 mA

## Výkon
"Obvod je kapacitní, úhel impedance je záporný a proud předbíhá napětí; účiník:"
cos_φ := cos(arg(Z))
"Komplexní výkon zdroje S = E·I*, jeho reálná část je činný výkon:"
S := E·conj(I) | VA
P := re(S) | W
"Činný výkon se mění v teplo jen v rezistoru:"
P_R := abs(I_R)^2·R | W
check "Činný výkon zdroje = výkon na rezistoru": abs(P - P_R) ≤ 1e-9 W

"Obvod s celkovou impedancí asi 818 Ω odebírá ze zdroje proud asi 147 mA, který předbíhá napětí o 58,4°. Většina napětí zdroje je na C_1 (82,8 V) a na paralelní části (65,9 V); součet fázorů dá přesně 120 V. Činný výkon 9,23 W vzniká jen v rezistoru. Čísla se shodují se zdrojem na všechny uváděné platné číslice; zdroj úhel cívky uvádí jako 221,22°, což je tentýž úhel jako −138,78°."
