# Jeřáb v hale: teorie {#T1}

Teorie k výpočtu, vlastními slovy. Vzorce v rámečcích Kalketa ověřuje. Tíha břemene jde lanem, hlavním nosníkem mostu, dráhou a sloupem, každá část dostává zatížení od předchozí.

## Síla v laně kladkostroje {#T2}

Břemeno visí na n nosných průřezech lana, a proto se jeho tíha rozděluje mezi ně. Tření v ložiscích kladek se zahrnuje účinností kladkostroje: lano musí táhnout o to víc, čím horší účinnost je. Rovnost vyplývá i z energie: při zdvihu o výšku h se lano na buben navine o n·h, práce tahu S·n·h je o ztráty větší než práce proti tíze Q·h, tedy S·n·η = Q.

```kalk
m := 10 t
m_h := 250 kg
g := 9.81 m/s^2
n := 4
η_k := 0.95
Q := (m + m_h)·g | kN
S := Q/(n·η_k) | kN
check "Rovnováha hákového bloku": abs(S·n·η_k - Q) ≤ 1e-9 kN
check "Q je asi 100,55 kN": abs(Q - 100.55 kN) ≤ 0.01 kN
```

## Návrh průměru lana {#T3}

Lano nese jen kovová část průřezu, tedy součet ploch drátů. Dovolené napětí vznikne dělením pevnosti drátů v tahu požadovanou bezpečností. Kovová plocha je zlomek plochy kruhu o průměru lana, zlomek udává plnicí součinitel ψ_l. Z toho se průměr vyjádří: d = √(4A/(ψ_l·π)).

```kalk
S := 26.461 kN
R_m := 1770 MPa
k := 5.5
ψ_l := 0.5
σ_dov := R_m/k | MPa
A := S/σ_dov | mm²
d := sqrt(4·A/(ψ_l·π)) | mm
check "Kruhová plocha s plněním dá zpět A": abs(ψ_l·π·d^2/4 - A) ≤ 1e-9 mm²
check "Průměr lana je asi 14,5 mm": abs(d - 14.47 mm) ≤ 0.01 mm
```

## Zatížení hlavního nosníku kočkou {#T4}

Tíha břemene se při zvedání zvětšuje dynamickým součinitelem ψ_d, k ní se přičte tíha kočky. Zatížení se rozdělí na čtyři kola, protože kočka jede po dvou hlavních nosnících a každý má dvě kola.

```kalk
ψ_d := 1.2
F_Q := 100.5525 kN
m_k := 3.2 t
g := 9.81 m/s^2
P := (ψ_d·F_Q + m_k·g)/4 | kN
check "Čtyři kola nesou dohromady dynamické břemeno a kočku": abs(4·P - ψ_d·F_Q - m_k·g) ≤ 1e-9 kN
```

## Největší moment a reakce hlavního nosníku {#T5}

Dvě stejné síly P s rozchodem a na prostém nosníku rozpětí L. Je-li první kolo ve vzdálenosti x od levé podpory, je reakce vlevo R_A = P·(2L − 2x − a)/L a moment pod prvním kolem M(x) = R_A·x. Největší hodnota je tam, kde je derivace nulová, tedy 2L − 4x − a = 0 a x = L/2 − a/4. Střed rozpětí pak leží uprostřed mezi výslednicí (ve vzdálenosti a/2 od obou kol) a prvním kolem. Po dosazení M_P = 2P/L·(L/2 − a/4)².

Moment od vlastní tíhy q je v celém nosníku q·x·(L − x)/2, největší uprostřed rozpětí, q·L²/8. Oba největší momenty nenastávají přesně na témže místě; jejich součet je proto o trochu větší než skutečný největší moment, tedy na bezpečné straně. Rozdíl se dá spočítat tak, že se do celkového momentu pod kolem dosadí obě zatížení (viz kontrola). Největší reakce vznikne, když je kočka u kraje a první kolo má od podpory nejmenší možnou vzdálenost e_k.

```kalk
P := 38.01375 kN
L := 18 m
a_k := 1.6 m
q_g := 2 kN/m
e_k := 1.2 m
x_k := L/2 - a_k/4
M_P := 2·P/L·(L/2 - a_k/4)^2 | kN·m
M_pod_kolem := P·(2·L - 2·x_k - a_k)/L·x_k | kN·m
M_q := q_g·L^2/8 | kN·m
M := M_P + M_q | kN·m
R_max := P·(L - e_k)/L + P·(L - e_k - a_k)/L + q_g·L/2 | kN
check "Moment pod prvním kolem v poloze x_k je M_P": abs(M_pod_kolem - M_P) ≤ 1e-9 kN·m
check "M_P je asi 312,4 kN·m": abs(M_P - 312.39 kN·m) ≤ 0.01 kN·m
check "R_max je asi 85,58 kN": abs(R_max - 85.58 kN) ≤ 0.01 kN
```

## Napětí za ohybu v I průřezu {#T6}

Moment setrvačnosti I průřezu vznikne odečtením dvou mezer po stranách stojiny od obdélníku celé výšky a šířky pásnic. Průřezový modul je moment setrvačnosti dělený vzdáleností krajního vlákna od osy, u souměrného průřezu h/2. Návrhová pevnost vznikne dělením meze kluzu součinitelem spolehlivosti. Napětí za ohybu je moment dělený průřezovým modulem a v krajním vlákně je největší.

```kalk
h_g := 550 mm
b_g := 220 mm
t_g := 18 mm
s_g := 10 mm
f_y := 235 MPa
γ_M := 1.1
M := 393.39 kN·m
I_y := (b_g·h_g^3 - (b_g - s_g)·(h_g - 2·t_g)^3)/12 | cm^4
I_dil := 2·b_g·t_g^3/12 + 2·b_g·t_g·((h_g - t_g)/2)^2 + s_g·(h_g - 2·t_g)^3/12 | cm^4
W_y := 2·I_y/h_g | cm^3
f_d := f_y/γ_M | MPa
σ := M/W_y | MPa
check "Moment setrvačnosti z mezer a ze Steinerovy věty je týž": abs(I_y - I_dil) ≤ 0.001 cm^4
check "σ je asi 160,6 MPa": abs(σ - 160.56 MPa) ≤ 0.01 MPa
check "Nosník vyhoví": σ ≤ f_d
```

## Dráhový nosník a konzola {#T7}

Dráhový nosník je prostý nosník se dvěma koly mostu a vlastní tíhou. Největší moment se hledá stejně jako u hlavního nosníku, s rozchodem c a rozpětím l_d. Reakce na konzolu je největší, když jedno kolo stojí přímo nad podporou, druhé je ve vzdálenosti c a do podpory se přenese podíl (l_d − c)/l_d jeho síly.

```kalk
F_k := 85.58 kN
c := 2.4 m
l_d := 7.5 m
g_d := 1.8 kN/m
W_d := 1500 cm^3
M_d := 2·F_k/l_d·(l_d/2 - c/4)^2 + g_d·l_d^2/8 | kN·m
σ_d := M_d/W_d | MPa
R_d := F_k + F_k·(l_d - c)/l_d + g_d·l_d/2 | kN
R_dB := F_k·c/l_d + g_d·l_d/2 | kN
check "Rovnováha svislých sil": abs(R_d + R_dB - 2·F_k - g_d·l_d) ≤ 1e-9 kN
check "R_d je asi 150,5 kN": abs(R_d - 150.52 kN) ≤ 0.01 kN
```

## Vzpěr sloupu podle Eulera {#T8}

Osová síla ve sloupu je součet reakcí a zatížení nad průřezem. Štíhlý tlačený prut ztratí stabilitu dříve, než by se rozdrtil. Eulerova kritická síla závisí na tuhosti prutu a na vzpěrné délce, kterou určuje uložení konců. Vztah platí jen pro štíhlost větší než mezní, jinak vzpěr rozhoduje nepružné chování.

Vzpěr nastane kolem osy s menším momentem setrvačnosti, u I profilu je to osa z. Kloub na obou koncích dává vzpěrnou délku rovnou výšce, vetknutí v patě ji zkracuje. Pro vetknutí v patě a kloub na hlavě je přesná vzpěrná délka 0,699·H, součinitel μ = 0,7 je zaokrouhlený. Mezní štíhlost je štíhlost, při které by Eulerovo kritické napětí π²E/λ² dosáhlo meze kluzu.

```kalk
R_d := 150.5244 kN
g_d := 1.8 kN/m
l_d := 7.5 m
N_r := 60 kN
H := 8 m
μ := 0.7
E_s := 210 GPa
f_y := 235 MPa
h_s := 170 mm
b_s := 180 mm
t_s := 10 mm
s_s := 6.5 mm
N := R_d + g_d·l_d/2 + N_r | kN
A_s := 2·b_s·t_s + (h_s - 2·t_s)·s_s | cm^2
I_z := 2·t_s·b_s^3/12 + (h_s - 2·t_s)·s_s^3/12 | cm^4
i_z := sqrt(I_z/A_s) | mm
L_cr := μ·H | m
λ := L_cr/i_z
λ_p := π·sqrt(E_s/f_y)
N_cr := π^2·E_s·I_z/L_cr^2 | kN
n_s := N_cr/N
σ_cr := N_cr/A_s | MPa
check "Při mezní štíhlosti je Eulerovo napětí rovné mezi kluzu": abs(π^2·E_s/λ_p^2 - f_y) ≤ 1e-6 MPa
check "Eulerův vzorec platí": λ > λ_p
check "Kritické napětí je pod mezí kluzu": σ_cr < f_y
check "N_cr je asi 642,6 kN": abs(N_cr - 642.6 kN) ≤ 0.1 kN
```
