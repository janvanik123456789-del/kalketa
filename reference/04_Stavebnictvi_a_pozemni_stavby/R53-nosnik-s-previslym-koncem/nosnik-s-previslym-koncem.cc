# Ohybový moment a napětí dřevěného nosníku s převislým koncem
"Vlastní úloha Kalkety: dřevěný nosník leží na kloubové podpoře A a posuvné podpoře B, za podporou B pokračuje převislým koncem. Po celé délce ho zatěžuje spojité zatížení, na konci převislého konce působí svislá osamělá síla. Průřez je obdélníkový z rostlého dřeva. Spočítáme reakce, průběh posouvající síly a ohybového momentu, největší momenty a posoudíme nosník na ohyb. Teorie je ve vrstvě Podklady."
"Zdroj: vlastní úloha Kalkety bez vnějšího zdroje; výsledky ověřeny nezávisle v Pythonu (vrstva Kontrola v Pythonu) a funkcí beam."

## Zadání
L := 5 m              ' rozpětí mezi podporami A a B
a := 1.5 m            ' délka převislého konce za podporou B
q := 8 kN/m           ' spojité zatížení po celé délce (vlastní tíha je v něm)
F := 12 kN            ' svislá síla na konci převislého konce
b := 140 mm           ' šířka průřezu
h := 300 mm           ' výška průřezu
f_m_d := 14 MPa       ' návrhová pevnost dřeva v ohybu
"Zatížení i pevnost jsou návrhové hodnoty, počítá se s nimi bez dalších součinitelů. Nosník je zajištěn proti klopení a posuzuje se jen ohyb; posouvající sílu a průhyb úloha nežádá."
![Schéma nosníku: vodorovný nosník na kloubové podpoře A vlevo a posuvné podpoře B, za podporou B pokračuje převislý konec. Po celé délce působí spojité zatížení q, na konci převislého konce svislá síla F směrem dolů. Kóty: L mezi podporami a délka převislého konce a.](images/schema.svg){width=75%}

## Úkol
"a) Spočítejte reakce v podporách A a B."
"b) Určete průběh posouvající síly a ohybového momentu, největší kladný moment v poli a moment nad podporou B."
"c) Spočítejte průřezový modul obdélníkového průřezu."
"d) Spočítejte největší normálové napětí za ohybu a posuďte nosník na ohyb."

## a) Reakce v podporách A a B
"Nosník na dvou podporách je staticky určitý, obě reakce určíme ze dvou podmínek rovnováhy." [T2]
"Součet svislých sil musí být nulový: reakce nesou celé zatížení q po délce (L + a) a sílu F na konci převisu." [T2]
relation R_A + R_B == q·(L + a) + F {eq=Rovn_sily}
"Momentovou podmínku napíšeme k podpoře A, aby v ní zůstala jen neznámá reakce R_B (rameno R_A je nulové). Výslednice spojitého zatížení q·(L + a) působí v polovině zatížené délky, síla F na konci převisu ve vzdálenosti (L + a) od A." [T2]
relation R_B·L == q·(L + a)^2/2 + F·(L + a) {eq=Rovn_momenty}
"Z momentové podmínky vyjádříme reakci v podpoře B:"
derive R_B == (q·(L + a)^2/2 + F·(L + a))/L {eq}
R_B := (q·(L + a)^2/2 + F·(L + a))/L | kN
"Reakci v podpoře A doplníme z podmínky součtu sil (#Rovn_sily):"
derive R_A == q·(L + a) + F - R_B {eq}
R_A := q·(L + a) + F - R_B | kN
"Zkouška: momentová podmínka k podpoře B, kterou jsme nepoužili, musí vyjít také. Reakce R_A s ramenem L otáčí na jednu stranu, zatížení pole (q·L v polovině rozpětí) na druhou, zatížení převisu q·a a síla F na stranu první."
check "Rovnováha momentů k podpoře B": abs(R_A·L - (q·L^2/2 - q·a^2/2 - F·a)) ≤ 0.001 kN·m
check "R_A > 0": R_A ≥ 0 kN
check "R_B > 0": R_B ≥ 0 kN
"Obě reakce vyšly kladné, podpory nosník jen podpírají a schéma souhlasí se směry na obrázku. Podpora B nese víc než A, protože ji zatěžuje i převis." [T2]

## b) Posouvající síla a ohybový moment
"Posouvající síla V(x) je součet svislých sil vlevo od řezu (nahoru kladně). Ohybový moment M(x) je součet momentů sil po jedné straně řezu. V poli počítáme zleva od podpory A, na převisu zprava od volného konce, kde zbývají jen síly na převisu." [T3]
"V poli mezi A a B reakce R_A dá kladný moment (tah dole), spojité zatížení na délce x moment odečte." [T3]
V_pole(x) := R_A - q·x | kN
M_pole(x) := R_A·x - q·x^2/2 | kN·m
"Na převisu ohýbají síly nosník nahoru vypouklý, moment je tedy záporný (tah nahoře)." [T3]
V_previs(x) := F + q·(L + a - x) | kN
M_previs(x) := -(q·(L + a - x)^2/2 + F·(L + a - x)) | kN·m
"Obě části spojíme do jedné funkce podle polohy řezu:"
V(x) := if(x ≤ L, V_pole(x), V_previs(x)) | kN
M(x) := if(x ≤ L, M_pole(x), M_previs(x)) | kN·m
"Posouvající síla nad podporou B skokem naroste o reakci R_B. Hodnoty těsně vlevo a vpravo od podpory a největší posouvající síla:"
V_B_vlevo := V_pole(L) | kN
V_B_vpravo := V_previs(L) | kN
V_max := max(abs(V_B_vlevo), abs(V_B_vpravo)) | kN
check "Skok posouvající síly v B je R_B": abs(V_B_vpravo - V_B_vlevo - R_B) ≤ 0.001 kN
"Extrém momentu v poli je tam, kde je posouvající síla nulová, V = dM/dx = 0; odtud x = R_A/q." [T3]
solve x_0: derivative(M_pole(x), x: x_0) == 0 in 0 m .. L
check "V = 0 v místě extrému": abs(V_pole(x_0)) ≤ 0.001 kN
check "x_0 = R_A/q": abs(x_0 - R_A/q) ≤ 0.001 m
"Největší kladný moment v poli dostaneme dosazením polohy extrému:"
M_max := M_pole(x_0) | kN·m
"Moment v poli je parabola, která začíná v nule; její druhý nulový bod je dvakrát dál než vrchol. Za ním je v poli moment záporný a tah se přesouvá z dolních vláken do horních."
x_n := 2·R_A/q | m
check "M = 0 v druhém nulovém bodě": abs(M_pole(x_n)) ≤ 0.001 kN·m
"Nad podporou B (x = L) vezmeme moment z převisu a porovnáme ho s momentem z pole. Oba musí dát totéž, protože moment se po délce nosníku nemění skokem." [T3]
M_B := M_previs(L) | kN·m
check "M_B ze vztahu pro převis": abs(M_B + (q·a^2/2 + F·a)) ≤ 0.001 kN·m
check "Moment je v B spojitý": abs(M_pole(L) - M_previs(L)) ≤ 0.001 kN·m
check "Moment na volném konci je nulový": abs(M(L + a)) ≤ 0.001 kN·m
"Zkouška funkcí beam, která nosník řeší deformační metodou. Ohybová tuhost EI na reakce a momenty staticky určitého nosníku nemá vliv, zvolíme proto libovolnou."
nosnik := beam(L: L + a, EI: 1 MN·m^2, pins: [0 m, L], q: q, at: [L + a], F: [F])
check "Reakce funkcí beam": abs(nosnik.R[1] - R_A) ≤ 0.001 kN and abs(nosnik.R[2] - R_B) ≤ 0.001 kN
check "Momenty funkcí beam": abs(nosnik.M_max - M_max) ≤ 0.01 kN·m and abs(nosnik.M_min - M_B) ≤ 0.001 kN·m
"Obrázek ukazuje tvar průběhu momentu; kladný moment je v něm vynesen dolů, na stranu tažených vláken. Graf pod ním má kladný moment nahoru."
![Průběh ohybového momentu po délce nosníku s převislým koncem. Kladný moment je vynesen dolů, na stranu tažených vláken: v poli mezi podporami A a B je kladný s maximem M_max zhruba ve třetině rozpětí, před podporou B prochází nulou a nad podporou B má záporné maximum M_B, které k volnému konci klesá na nulu.](images/moment.svg){width=75%}
plot(V(x), x: 0 m .. L + a, title: "Posouvající síla V") | kN
plot(M(x), x: 0 m .. L + a, points: [x_0, M_max | L, M_B], title: "Ohybový moment M") | kN·m
"Moment nad podporou B má opačné znaménko než moment v poli a je větší. Převis zatěžuje nosník hůř než pole; poměr velikostí obou momentů:"
pomer_momentu := abs(M_B)/M_max

## c) Průřezový modul obdélníkového průřezu
"Průřezový modul obdélníku šířky b a výšky h je moment setrvačnosti b·h^3/12 dělený vzdáleností krajního vlákna od neutrální osy h/2. Udává, jak účinně je materiál rozmístěn od neutrální osy." [T4]
relation W == b·h^2/6 {eq}
W := b·h^2/6 | cm³
![Obdélníkový průřez dřevěného nosníku s naznačenými letokruhy. Šířka průřezu je označena b, výška h. Vodorovná osa y prochází těžištěm v polovině výšky, svislá osa z směřuje nahoru.](images/prurez.svg){width=60%}

## d) Největší normálové napětí a posudek na ohyb
"Normálové napětí roste lineárně se vzdáleností od neutrální osy, největší je na okrajích průřezu." [T4]
relation σ_max == abs(M)/W {eq}
"Záleží na velikosti momentu, ne na znaménku, proto porovnáme absolutní hodnoty: rozhoduje moment nad podporou B." [T4]
M_rozh := max(abs(M_max), abs(M_B)) | kN·m
σ_max := M_rozh/W | MPa
"Pro srovnání napětí v místě největšího momentu v poli:"
σ_pole := M_max/W | MPa
"Obrázek ukazuje rozdělení napětí pro kladný moment (tlak nahoře, tah dole). Nad podporou B je moment záporný, tažená jsou horní vlákna a tlačená dolní, znaménka jsou obrácená; velikost napětí je stejná."
![Rozložení normálového napětí po výšce obdélníkového průřezu při ohybu. Napětí se mění lineárně, na neutrální ose v polovině výšky je nulové, na jednom okraji je tlak σ_c a na druhém tah σ_t stejné velikosti.](images/napeti.svg){width=75%}
"Posudek porovnává největší napětí s návrhovou pevností dřeva v ohybu." [T4]
check "Ohyb": σ_max ≤ f_m_d  source "Podklady, T4"
vyuziti := σ_max/f_m_d
W_pot := M_rozh/f_m_d | cm³
"Nosník na ohyb vyhoví: největší napětí je nad podporou B, kde je horní hrana tažená, a zůstává pod návrhovou pevností. Využití nosníku udává poměr napětí k pevnosti, potřebný průřezový modul je jen o málo menší než skutečný, rezerva tedy není velká. Napětí v poli je zhruba poloviční."
