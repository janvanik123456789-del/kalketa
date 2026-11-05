# Vyčíslení rovnice KMnO₄ + HCl a množství uvolněného chloru
"Vlastní zadání: manganistan draselný oxiduje kyselinu chlorovodíkovou na chlor, vzniká chlorid draselný, chlorid manganatý a voda. Koeficienty rovnice nehádáme zkoušením: pro každý prvek platí bilance atomů a koeficienty jsou řešením soustavy rovnic. Pak určíme, kolik chloru vznikne z 10 g manganistanu a kolik kyseliny se přitom spotřebuje."
"Zdroj: vlastní zadání; molární hmotnosti ze standardních atomových hmotností IUPAC (zkrácené hodnoty), ověřeno bilancí hmotnosti (oddíl 5 listu) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
"Rovnice: a KMnO₄ + b HCl → c KCl + d MnCl₂ + e Cl₂ + f H₂O. Kyselina je v přebytku, chlor bereme jako ideální plyn za normálních podmínek."
m_1 := 10 g              ' hmotnost manganistanu
T := 273.15 K
p := 101325 Pa
R_m := 8.314462618 J/(mol·K)

## Bilance prvků
"Řádky matice jsou prvky K, Mn, O, H a Cl, sloupce jsou látky v pořadí rovnice. Číslo udává počet atomů prvku v jedné molekule, u produktů se záporným znaménkem. Koeficienty tvoří vektor, který matice zobrazí na nulu."
A := [1, 0, -1, 0, 0, 0 | 1, 0, 0, -1, 0, 0 | 4, 0, 0, 0, 0, -1 | 0, 1, 0, 0, 0, -2 | 0, 1, -1, -2, -2, 0]
h := rank(A)
N := nullspace(A)
c := whole(N)
"Matice má hodnost 5 při šesti neznámých, a proto má soustava právě jeden směr řešení. whole z něj udělá nejmenší celá čísla."

## Molární hmotnosti a bilance hmotnosti
M_1 := molar_mass("KMnO4")
M_2 := molar_mass("HCl")
M_3 := molar_mass("KCl")
M_4 := molar_mass("MnCl2")
M_5 := molar_mass("Cl2")
M_6 := molar_mass("H2O")
m_l := c[1]·M_1 + c[2]·M_2 | g/mol
m_p := c[3]·M_3 + c[4]·M_4 + c[5]·M_5 + c[6]·M_6 | g/mol

## Stechiometrie
"Látková množství jsou v poměru koeficientů."
n_1 := m_1/M_1 | mol
n_2 := n_1·c[2]/c[1] | mol
n_5 := n_1·c[5]/c[1] | mol
m_2 := n_2·M_2 | g
m_5 := n_5·M_5 | g
V_5 := n_5·R_m·T/p | l

## Posudky
check "Počet atomů každého prvku je na obou stranách stejný": max(abs(A·c)) == 0
check "Koeficienty 2, 16, 2, 2, 5, 8": c[1] == 2 and c[2] == 16 and c[3] == 2 and c[4] == 2 and c[5] == 5 and c[6] == 8
check "Rovnice má jediné vyčíslení": h == 5
check "Hmotnost se zachovává": abs(m_l - m_p) ≤ 0.001 g/mol
"Rovnice je 2 KMnO₄ + 16 HCl → 2 KCl + 2 MnCl₂ + 5 Cl₂ + 8 H₂O. Z 10 g manganistanu vznikne 11,2 g chloru, za normálních podmínek asi 3,5 l, a spotřebuje se 18,5 g chlorovodíku. Z 16 molekul HCl se na chlor oxiduje jen 10, zbylých 6 se váže do chloridů."
