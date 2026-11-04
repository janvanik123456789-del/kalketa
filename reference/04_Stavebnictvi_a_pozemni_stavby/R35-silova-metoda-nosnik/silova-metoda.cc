# Reakce a vnitřní síly staticky neurčitého nosníku silovou metodou
"Podle příkladu č. 8 z předmětu BD03 (VUT FAST Brno, L. Brdečko). Nosník a–b–c–d má kloubovou podporu a, svislou podporu b a posuvnou podporu d, která drží i vodorovně. Pole a–b nese osové spojité zatížení, v bodě c působí osamělý moment. Nosník je dvakrát staticky neurčitý: základní soustava vznikne odebráním vodorovné vazby v d (neznámá X_1) a podpory b (neznámá X_2). Neznámé určíme z podmínek, že se v místech odebraných vazeb nosník nepřemístí. Práce posouvajících sil se zanedbává. Obrázek je vlastní."
"Zdroj: https://www.fce.vutbr.cz/stm/zidek.r/files/_priklad_8_BD03.pdf"

## Zadání
L_ab := 5 m
L_bc := 3 m
L_cd := 3 m
L := L_ab + L_bc + L_cd
q_x := 20 kN/m           ' osové zatížení pole a–b
M_c := 50 kN·m           ' osamělý moment v bodě c
"Průřez zdroj v textu neuvádí (zřejmě jen na obrázku). Neznámé X_1, X_2 na něm nezávisí, protože se EA i EI v kanonických rovnicích zkrátí. Předpokládáme IPE 200:"
E := 210 GPa
A := 28.5 cm^2
I := 1943 cm^4
![Nosník a–b–c–d: model se zatížením a základní soustava s neznámými X_1 a X_2](images/nosnik.svg){width=80%}

## Stav 0: původní zatížení na základní soustavě
A_x0 := -q_x·L_ab | kN
A_z0 := -M_c/L | kN
D_z0 := M_c/L | kN
N_0(x) := if(x ≤ L_ab, q_x·(L_ab - x), 0 kN)
M_0(x) := if(x ≤ L_ab + L_bc, A_z0·x, D_z0·(L - x))

## Stav 1 a 2: jednotkové síly ve směru X_1 a X_2
"Jednotková vodorovná síla v d táhne celý nosník; jednotková svislá síla v b se rozdělí na podpory a a d."
N_1(x) := 1
M_2(x) := if(x ≤ L_ab, (L - L_ab)/L·x, L_ab/L·(L - x))

## Přemístění
δ_10 := integral(N_1(x)·N_0(x), x: 0 m .. L)/(E·A) | mm
δ_11 := integral(N_1(x)^2, x: 0 m .. L)/(E·A) | mm/kN
δ_20 := integral(M_2(x)·M_0(x), x: 0 m .. L)/(E·I) | mm
δ_22 := integral(M_2(x)^2, x: 0 m .. L)/(E·I) | mm/kN

## Kanonické rovnice
solve (X_1, X_2): δ_10 + δ_11·X_1 == 0, δ_20 + δ_22·X_2 == 0 guess X_1 = 1 kN, X_2 = 1 kN
"Ve zdroji je v rovnici pro X_2 překlep: jednou 261236, jinde 261326. Správná hodnota je asi 261 364 (bez zaokrouhlení mezivýsledků). Zdroj dále počítá se zaokrouhleným 2,727, a proto mu vychází X_2 = 9,584 kN místo našich 9,583 kN."

## Výsledné reakce a vnitřní síly
A_x := A_x0 - X_1 | kN
A_z := A_z0 + X_2·(L - L_ab)/L | kN
D_z := D_z0 + X_2·L_ab/L | kN
N_a := -A_x | kN
N_d := X_1 | kN
M_b := L_ab·A_z | kN·m
M_cL := (L_ab + L_bc)·A_z - L_bc·X_2 | kN·m
M_cP := L_cd·D_z | kN·m

## Průběh ohybového momentu
M(x) := M_0(x) + X_2·M_2(x) | kN·m
plot(M(x), x: 0 m .. L, title: "Ohybový moment po délce nosníku") | kN·m

## Posudky
check "Svislá rovnováha": abs(A_z + D_z - X_2) ≤ 0.001 kN
check "Momentová rovnováha k bodu a": abs(L·D_z - M_c - L_ab·X_2) ≤ 0.001 kN·m
check "Neznámé a reakce jako ve zdroji (−22,727; 9,584; −77,273; 0,682; 8,902 kN)": abs(X_1 + 22.727 kN) ≤ 0.005 kN and abs(X_2 - 9.584 kN) ≤ 0.005 kN and abs(A_x + 77.273 kN) ≤ 0.005 kN and abs(A_z - 0.682 kN) ≤ 0.005 kN and abs(D_z - 8.902 kN) ≤ 0.005 kN
check "Momenty jako ve zdroji (3,41; −23,296; 26,706 kN·m)": abs(M_b - 3.41 kN·m) ≤ 0.005 kN·m and abs(M_cL + 23.296 kN·m) ≤ 0.005 kN·m and abs(M_cP - 26.706 kN·m) ≤ 0.005 kN·m
"Největší ohybový moment je v bodě c: −23,3 kN·m těsně vlevo a 26,7 kN·m těsně vpravo od něj. Vodorovná vazba v d převezme 22,7 kN osového zatížení, takže v bodě a zbývá vodorovná reakce 77,3 kN."
