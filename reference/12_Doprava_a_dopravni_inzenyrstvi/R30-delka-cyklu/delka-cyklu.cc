# Optimální délka cyklu světelné signalizace (Webster)
"Podle příkladu Cycle Length Determination z NIATT Traffic Signal Timing Lab Manual (National Institute for Advanced Transportation Technology, University of Idaho). Křižovatka je řízená ve třech fázích. Pro každou fázi známe poměr kritické intenzity k saturovanému toku a mezičas. Délku cyklu určíme Websterovým vzorcem, který dává nejmenší zdržení vozidel. Rozdělení zelené na fáze je náš doplněk podle Websterovy zásady stejného stupně saturace. Obrázek je vlastní."
"Zdroj: https://www.webpages.uidaho.edu/niatt_labmanual/Chapters/signaltimingdesign/exampleproblems/CycleLengthDetermination.htm"

## Zadání
"Fáze: y je poměr kritické intenzity a saturovaného toku, I mezičas mezi koncem zelené jedné fáze a začátkem další."
table Faze:
    | faze | y     | I [s] |
    | 1    | 0.233 | 6     |
    | 2    | 0.13  | 4     |
    | 3    | 0.256 | 7     |
![Cyklus signalizace o třech fázích: efektivní zelené g_1 až g_3 oddělené mezičasy I_1 až I_3](images/cyklus.svg){width=85%}

## Délka cyklu
"Ztracený čas cyklu je součet mezičasů, Y součet kritických poměrů:"
L_z := sum(Faze.I) | s
Y := sum(Faze.y)
C_o := (1.5·L_z + 5 s)/(1 - Y) | s {eq}
"Délka cyklu se zaokrouhluje na celé pětisekundy:"
C_n := round(C_o/(5 s))·5 s | s
"Kdyby byly všechny kritické poměry blízko nule, jmenovatel by byl 1 a cyklus nejkratší:"
C_min := 1.5·L_z + 5 s | s
"Zdroj: 80 s, a pro nulové poměry 31 s."

## Rozdělení zelené
"Zelená se rozdělí úměrně kritickým poměrům fází, takže všechny fáze mají stejný stupeň saturace:"
g_e := Faze.y/Y·(C_n - L_z) | s
X := Y·C_n/(C_n - L_z)
check "Zelené a mezičasy vyplní cyklus": abs(sum(g_e) + L_z - C_n) ≤ 0.01 s
"Stupeň saturace 0,87 nechává rezervu 13 %. Při Y blízko 1 by cyklus rostl nade všechny meze:"
C_Y(x) := (1.5·L_z + 5 s)/(1 - x)
plot(C_Y(x), x: 0 .. 0.85, title: "Optimální délka cyklu podle součtu kritických poměrů Y") | s
