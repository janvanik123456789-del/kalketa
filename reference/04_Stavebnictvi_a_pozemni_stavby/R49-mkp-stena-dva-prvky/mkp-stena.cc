# Posunutí a napětí stěny ze dvou trojúhelníkových prvků (MKP)
"Podle příkladu 4.1 z textu Metoda konečných prvků ve stavební mechanice (VŠB-TU Ostrava, T. Brožovský, J. Konečný). Čtvercová stěna 1 m × 1 m o tloušťce 0,1 m je rozdělená úhlopříčkou na dva trojúhelníkové prvky s konstantní deformací (rovinná napjatost). Dolní uzly jsou pevně podepřené, v pravém horním uzlu působí vodorovná síla, v levém horním svislá. Hledáme posunutí volných uzlů, reakce a napětí v obou prvcích. Zdroj v matici tuhosti obou prvků chybuje (viz oddíl Srovnání se zdrojem); list počítá správné hodnoty."
"Zdroj: Brožovský, Konečný: Metoda konečných prvků ve stavební mechanice, VŠB-TU Ostrava, https://mi21.vsb.cz/sites/mi21.vsb.cz/files/unit/metoda_konecnych_prvku_stavebni_mechanika.pdf"

## Zadání
E := 20 GPa
ν := 0.2
t := 0.1 m
F_x3 := -10 kN               ' síla v uzlu 3 míří doleva
F_y4 := -20 kN               ' síla v uzlu 4 míří dolů
"Uzly 1 až 4 leží v rozích čtverce; souřadnice x doprava, y nahoru. Prvek 1 má uzly 1, 2, 4, prvek 2 uzly 2, 3, 4 (proti směru hodinových ručiček). Uzly 1 a 2 jsou pevně podepřené, jejich posunutí jsou nulová. Zdroj nic víc neuvádí; stav je rovinná napjatost, jak se u tenké stěny předpokládá."
x_u := [0, 1, 1, 0] m
y_u := [0, 0, 1, 1] m
uzly := [1, 2, 4 | 2, 3, 4]  ' řádek = prvek, sloupce = jeho uzly i, j, k
![Čtvercová stěna rozdělená úhlopříčkou na prvky 1 a 2, uzly 1 až 4, podpory v uzlech 1 a 2, síly v uzlech 3 a 4](images/stena.svg){width=55%}

## Materiál
"Matice pružnosti pro rovinnou napjatost spojuje napětí σ = (σ_x, σ_y, τ_xy) s deformací ε = (ε_x, ε_y, γ_xy):"
D := E/(1 - ν^2)·[1, ν, 0 | ν, 1, 0 | 0, 0, (1 - ν)/2] | GPa

## Prvek z čísla prvku
"Souřadnice a-tého uzlu prvku e a jeho plocha (tři uzly proti směru hodinových ručiček dají kladnou plochu):"
x_e(e, a) := x_u[uzly[e, a]]
y_e(e, a) := y_u[uzly[e, a]]
A_e(e) := ((x_e(e, 2) - x_e(e, 1))·(y_e(e, 3) - y_e(e, 1)) - (x_e(e, 3) - x_e(e, 1))·(y_e(e, 2) - y_e(e, 1)))/2
"Rozdíly souřadnic pro uzel a prvku: b_a = y_b − y_c, c_a = x_c − x_b, kde b, c jsou další dva uzly v pořadí."
b_e(e, a) := y_e(e, mod(a, 3) + 1) - y_e(e, mod(a + 1, 3) + 1)
c_e(e, a) := x_e(e, mod(a + 1, 3) + 1) - x_e(e, mod(a, 3) + 1)
"Matice B (3 × 6) dává deformaci prvku z jeho šesti posunutí (u_i, v_i, u_j, v_j, u_k, v_k). Sloupec j patří uzlu a = ⌈j/2⌉; lichý sloupec je posunutí u, sudý v."
B_e(e) := matrix(if(i == 1, if(mod(j, 2) == 1, b_e(e, floor((j + 1)/2)), 0 m), if(i == 2, if(mod(j, 2) == 1, 0 m, c_e(e, floor((j + 1)/2))), if(mod(j, 2) == 1, c_e(e, floor((j + 1)/2)), b_e(e, floor((j + 1)/2)))))/(2·A_e(e)), i: 1 .. 3, j: 1 .. 6)
"Matice tuhosti prvku (6 × 6): k = t·A·Bᵀ·D·B."
k_e(e) := t·A_e(e)·transpose(B_e(e))·D·B_e(e)

## Matice tuhosti prvků
A_1 := A_e(1) | m^2
A_2 := A_e(2) | m^2
"Násobitel t·E/(2·(1 − ν²)) je pro čtverec o straně 1 m u obou prvků stejný, 1,0417·10⁹ N/m; matice zdroje jsou zapsané v jeho násobcích:"
m_k := t·E/(2·(1 - ν^2)) | MN/m
k_1 := k_e(1) | MN/m
k_2 := k_e(2) | MN/m
"Pořadí řádků a sloupců: u a v uzlů prvku, prvek 1 má uzly 1, 2, 4, prvek 2 uzly 2, 3, 4."

## Sestavení soustavy
"Stupně volnosti: 1 = u_3, 2 = v_3, 3 = u_4, 4 = v_4. Podepřený uzel má místo 0 a jeho řádek se vynechá. Místa šesti posunutí prvku e:"
n_d := 4
dof(n, s) := if(n <= 2, 0, 2·(n - 3) + s)
misto(e) := vector(dof(uzly[e, floor((j + 1)/2)], 2 - mod(j, 2)), j: 1 .. 6)
"Tuhost celé stěny je součet matic prvků na jejich místech:"
K := sum(scatter(k_e(e), misto(e), n_d), e: 1 .. 2) | MN/m
F := [F_x3 | 0 kN | 0 kN | F_y4]
r := lsolve(K, F) | μm
u_3 := r[1] | μm
v_3 := r[2] | μm
u_4 := r[3] | μm
v_4 := r[4] | μm
![Původní tvar stěny plnou čarou a deformovaný tvar čárkovaně, posunutí zvětšená 5000krát](images/deformace.svg){width=55%}

## Reakce
"Totéž se všemi osmi stupni volnosti (1, 2 = uzel 1, … 7, 8 = uzel 4). Reakce dávají první čtyři řádky, tedy uzly 1 a 2, protože v nich nepůsobí vnější zatížení."
misto_8(e) := vector(2·uzly[e, floor((j + 1)/2)] - mod(j, 2), j: 1 .. 6)
K_8 := sum(scatter(k_e(e), misto_8(e), 8), e: 1 .. 2) | MN/m
r_8 := vector(if(i <= 4, 0 μm, r[i - 4]), i: 1 .. 8)
R := K_8·r_8 | kN
R_x1 := R[1] | kN
R_y1 := R[2] | kN
R_x2 := R[3] | kN
R_y2 := R[4] | kN

## Deformace a napětí prvků
"Deformace prvku je ε = B·u_e a napětí σ = D·ε, kde u_e jsou posunutí jeho šesti stupňů volnosti; v prvku jsou konstantní."
u_e(e) := vector(r_8[2·uzly[e, floor((i + 1)/2)] - mod(i, 2)], i: 1 .. 6)
ε_1 := B_e(1)·u_e(1)
σ_1 := D·B_e(1)·u_e(1) | kPa
ε_2 := B_e(2)·u_e(2)
σ_2 := D·B_e(2)·u_e(2) | kPa
σ_x1 := σ_1[1] | kPa
σ_y1 := σ_1[2] | kPa
τ_xy1 := σ_1[3] | kPa
σ_x2 := σ_2[1] | kPa
σ_y2 := σ_2[2] | kPa
τ_xy2 := σ_2[3] | kPa

## Srovnání se zdrojem
"Zdroj uvádí posunutí u_3, v_3, u_4, v_4 = −38,7; −3,9; −28,2; −19,1 μm a napětí v prvku 1 σ_y = −397,9 kPa, τ = −235 kPa. Nám vychází jiné hodnoty, protože zdroj má dvě chyby v maticích tuhosti prvků (s násobitelem 1,0417·10⁹ N/m): v prvku 1 má na místě mezi u_1 a u_2 hodnotu +1,0 místo −1,0 a v prvku 2 má na místě mezi u_3 a v_3 hodnotu 0,2 místo 0,6 (to je ν + (1 − ν)/2 v násobku násobitele). Že naše matice platí, vidíme ze součtu řádků: posunutí stěny jako tuhého celku nesmí vyvolat žádnou sílu."
p_x := vector(if(mod(i, 2) == 1, 1 μm, 0 μm), i: 1 .. 6)
p_y := vector(if(mod(i, 2) == 1, 0 μm, 1 μm), i: 1 .. 6)
f_tuhe_1 := norm(k_1·p_x) + norm(k_1·p_y) | N
f_tuhe_2 := norm(k_2·p_x) + norm(k_2·p_y) | N
k_1_uu := k_1[1, 3]/m_k
k_2_uv := k_2[3, 4]/m_k
"Hodnoty ve zdroji by tuto zkoušku nesplnily: součet prvků řádku 1 v sloupcích u (1,4 + 1,0 − 0,4) by dal 2,0 místo 0. S volnou částí sestavené matice tuhosti, tak jak ji zdroj vytiskl (i s jeho chybami), vyjdou posunutí, která nesouhlasí ani s jeho vlastním výsledkem:"
K_zdroj := 1.042·[1.4, 0.2, -1.0, -0.4 | 0.2, 1.4, -0.2, -0.4 | -1.0, -0.2, 1.4, 0 | -0.4, -0.4, 0, 1.4] GN/m
r_zdroj := lsolve(K_zdroj, F) | μm

## Posudky
S_asym := K - transpose(K)
check "Prvek 1 je při posunutí jako tuhé těleso bez sil": f_tuhe_1 ≤ 0.001 N
check "Prvek 2 je při posunutí jako tuhé těleso bez sil": f_tuhe_2 ≤ 0.001 N
check "Reakce vyvažují zatížení ve vodorovném směru": abs(R_x1 + R_x2 + F_x3) ≤ 1e-6 kN
check "Reakce vyvažují zatížení ve svislém směru": abs(R_y1 + R_y2 + F_y4) ≤ 1e-6 kN
check "Moment k uzlu 1 je v rovnováze": abs(R_y2·1 m - F_x3·1 m) ≤ 1e-6 kN·m
check "Sestavená tuhost K je symetrická": sqrt(trace(S_asym·transpose(S_asym))) ≤ 1e-9 MN/m
check "Chyba zdroje v prvku 1: K[u_1, u_2] je −1,0 násobitele, ne +1,0": abs(k_1_uu + 1.0) ≤ 1e-9
check "Chyba zdroje v prvku 2: K[u_3, v_3] je 0,6 násobitele, ne 0,2": abs(k_2_uv - 0.6) ≤ 1e-9
check "Zdrojová matice dá jiné posunutí než zdroj sám (u_3 ≈ −26,95 μm, ne −38,7 μm)": abs(r_zdroj[1] + 26.95 μm) ≤ 0.01 μm
"Stěna je zatížená tlakem a ohybem: prvek 1 u podpor je tlačený hlavně svisle (σ_y = −435 kPa), prvek 2 vodorovně (σ_x = −165 kPa) a svisle má malý tah (35 kPa). Uzel 2 se reakcí R_y2 = −10 kN táhne dolů, protože vodorovná síla nahoře stěnu převrací. Zdroj kvůli chybám v maticích prvků vychází s posunutími u_3 a u_4 asi o třetinu většími a s v_3 s opačným znaménkem."
