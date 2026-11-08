# Napájecí zdroj pro LED osvětlení {#T1}

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje. Číslování oddílů odpovídá citacím v listu.

## LED zátěž a předřadný odpor {#T2}

LED se chová jako dioda s téměř stálým propustným napětím, proud ale na napětí roste velmi strmě. Proto se LED napájí proudem a každý řetězec dostane předřadný odpor, který zbytek napětí zdroje převezme a nastaví proud. Napětí řetězce je součet napětí všech LED v sérii, proudy paralelních řetězců se sčítají.

```kalk
relation U_s == N_s·U_f
relation I == n_s·I_s
relation R_s == (U_dc - U_s)/I_s
relation P_R == I_s^2·R_s
relation P_out == U_dc·I
```

Výkon mařený na odporech je cenou za stabilitu proudu: čím menší je rozdíl mezi napětím zdroje a napětím řetězce, tím je zdroj účinnější. Podíl výkonu LED na výkonu výstupu je přesně poměr napětí řetězce k napětí zdroje, protože proud je v obou stejný. Ověření na číslech:

```kalk
N_s := 7
U_f := 3 V
I_s := 0.2 A
n_s := 8
U_dc := 24 V
U_s := N_s·U_f
R_s := (U_dc - U_s)/I_s
P_LED := n_s·N_s·U_f·I_s
P_out := U_dc·n_s·I_s
check "Podíl výkonu LED je poměr napětí": abs(P_LED/P_out - U_s/U_dc) ≤ 0.000001
check "Odpor je kladný": R_s > 0 Ω
```

## Transformátor {#T3}

Transformátor přenáší výkon střídavým magnetickým tokem v železném jádru. Napětí vinutí je úměrné počtu závitů, takže převod je poměr počtů závitů i poměr napětí. Napětí sekundáru musí stačit na špičkové napětí kondenzátoru plus úbytky na dvou diodách můstku a pod zátěží je o něco nižší než naprázdno.

Střední napětí na kondenzátoru leží o polovinu zvlnění pod špičkou. Aby střední napětí bylo U_z, musí být špička kondenzátoru U_z + ΔU/2 a špička sekundáru o dva úbytky diod výše. Efektivní hodnota sinusovky je špička dělená odmocninou ze dvou.

```kalk
relation U_2m == U_z + ΔU/2 + 2·U_F
relation U_2 == U_2m/sqrt(2)
relation U_20 == U_2/(1 - d_u)
relation n == U_1/U_20
relation I_2 == k_I·I_z
relation S == U_2·I_2
relation I_1 == S/U_1
relation U == 4.44·f·N·B_m·A_Fe
```

Vztah mezi napětím a počtem závitů plyne z Faradayova zákona: pro sinusový tok s amplitudou Φ_m = B_m·A_Fe je efektivní napětí vinutí 2π/√2·f·N·Φ_m, tedy asi 4,44·f·N·B_m·A_Fe, protože 2π/√2 ≈ 4,443. Ověření:

```kalk
f := 50 Hz
N := 100
B_m := 1.2 T
A_Fe := 9 cm^2
U_e := 2·π/sqrt(2)·f·N·B_m·A_Fe | V
U_k := 4.44·f·N·B_m·A_Fe | V
check "Konstanta 4,44 je 2π/√2 s přesností na tisícinu": abs(U_e - U_k)/U_e ≤ 0.001
```

- Kondenzátor za usměrňovačem odebírá proud jen v krátkých špičkách, proto je efektivní proud vinutí větší než stejnosměrný proud zátěže, běžně asi 1,8krát.
- Zdánlivý výkon S určuje velikost transformátoru, na wattech zátěže závisí jen zčásti.
- Počet závitů se zaokrouhluje nahoru: víc závitů znamená při stejném napětí menší indukci, takže jádro nesytí. Poměr zaokrouhlených počtů se od převodu odchýlí nejvýš o jeden závit z menšího vinutí, tedy o 1/N_2.

## Usměrnění a filtrace {#T4}

Graetzův můstek ze čtyř diod propouští v obou půlvlnách proud stejným směrem. V každé půlvlně vedou dvě diody v sérii se zátěží, takže se špičkové napětí zmenší o dva úbytky. Kondenzátor se dobíjí na špičku a mezi špičkami se vybíjí do zátěže téměř stálým proudem, proto napětí mezi špičkami klesá přibližně lineárně. Rozkmit zvlnění je úměrný proudu a nepřímo úměrný kapacitě a kmitočtu usměrněného napětí, který je dvojnásobkem kmitočtu sítě.

```kalk
relation U_m == sqrt(2)·U_2 - 2·U_F
relation ΔU == I_z/(2·f·C)
relation U_min == U_m - ΔU
relation U_str == U_m - ΔU/2
relation I_D == I_z/2
relation U_RRM == k_u·U_m
relation U_C == k_c·U_m
```

Rozkmit vychází z náboje, který zátěž odebere za polovinu periody sítě: Q = I_z·T/2 = C·ΔU. Výpočet je záměrně prostý. Ve skutečnosti se kondenzátor vybíjí o něco kratší dobu, protože ho další oblouk začne dobíjet dřív, než sinusovka dosáhne špičky, takže skutečné zvlnění je o něco menší než ze vzorce. Vzorec je tedy odhad na bezpečné straně. Střední napětí pilovitého průběhu je v polovině rozkmitu, proto U_str = U_m − ΔU/2; jako jediné z nich odpovídá tomu, na co se navrhuje sekundár. Ověření:

```kalk
I_z := 1.6 A
f := 50 Hz
C := 15000 μF
Q := I_z/(2·f)
ΔU := Q/C | V
U_m := 24.75 V
check "Náboj za půl periody dá stejný rozkmit": abs(ΔU - I_z/(2·f·C)) ≤ 0.000000001 V
check "Střední napětí leží v polovině rozkmitu": abs(U_m - ΔU/2 - (U_m + (U_m - ΔU))/2) ≤ 0.000000001 V
```

Diodami teče střední proud poloviční proti zátěži, protože se v proudu střídají dvojice diod. Závěrné napětí diody je asi špičkové napětí a kondenzátor se vybírá s rezervou na kolísání sítě.

## Ztráty, účinnost a chlazení {#T5}

Ztráty vznikají v transformátoru (v železe a ve vinutí), na diodách můstku a na předřadných odporech. Příkon ze sítě je výstupní výkon plus ztráty před výstupem a účinnost je podíl užitečného výkonu LED a příkonu. Ztrátové teplo diod odvádí chladič a teplota čipu se počítá z tepelných odporů v řetězci čip, pouzdro, chladič, okolí, podobně jako úbytek napětí v sériovém zapojení rezistorů.

```kalk
relation P_D == 2·U_F·I_z
relation P_in == P_out + P_D + P_Fe + P_Cu
relation η == P_LED/P_in
relation T_c == T_a + P_D·(R_cs + R_sa)
relation T_j == T_c + P_D·R_jc
relation R_sa_max == (T_jmax - T_a)/P_D - R_jc - R_cs
```

- Tepelný odpor v K/W říká, o kolik kelvinů stoupne teplota na jeho dvou koncích při tepelném výkonu 1 W.
- Největší dovolený odpor chladiče plyne z podmínky, aby teplota čipu právě dosáhla T_jmax. S tímto odporem musí vyjít z řetězce přesně T_jmax, což se dá ověřit:

```kalk
P_D := 2.88 W
T_a := 50 °C
T_jmax := 100 °C
R_jc := 3 K/W
R_cs := 0.5 K/W
R_sa_max := (T_jmax - T_a)/P_D - R_jc - R_cs | K/W
T_j := T_a + P_D·(R_jc + R_cs + R_sa_max) | °C
check "S největším odporem chladiče vyjde právě T_jmax": abs(T_j - T_jmax) ≤ 0.000001 K
```
