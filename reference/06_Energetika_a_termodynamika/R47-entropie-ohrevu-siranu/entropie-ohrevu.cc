# Změna entropie při vratném ohřevu síranu draselného
"Podle úlohy 3, 2. věta termodynamiky – příklady k procvičení (FC1, PřF UP Olomouc): 1 kg bezvodého síranu draselného K₂SO₄ se vratně ohřeje z 25 °C na 427 °C při tlaku 101,3 kPa. Molární tepelná kapacita závisí na teplotě (T v kelvinech). Zjistíme, o kolik vzroste entropie látky, a pro lepší představu i dodané teplo a střední teplotu ohřevu. Zdroj uvádí výsledek 820 J/K."
"Zdroj: https://www.kfc.upol.cz/wp-content/uploads/2022/02/FC1-PR9-2022.pdf"

## Zadání
m := 1 kg
M := 174.26 g/mol          ' molární hmotnost K₂SO₄
t_1 := 25 °C
t_2 := 427 °C
T_1 := t_1 | K
T_2 := t_2 | K
p := 101.3 kPa             ' tlak je stálý, do výpočtu přímo nevstupuje
"Molární tepelná kapacita při stálém tlaku se mění s teplotou podle polynomu (T v K). Zdroj má v textu exponenty rozházené; čteme je jako −17,8·10⁻⁶ pro třetí člen. S obvyklým zápisem c = −17,8·10⁵ by vyšlo asi 773 J/K, tedy ne zdrojových 820 J/K."
a := 120.4 J/(mol·K)
b := 99.6e-3 J/(mol·K^2)
c := -17.8e-6 J·K/mol
c_p(T) := a + b·T + c/T^2
![Molární tepelná kapacita c_p síranu draselného v závislosti na teplotě. Proužek šířky dT u teploty T je teplo dQ = n·c_p·dT a přináší entropii dS = dQ/T. Plocha pod křivkou od T_1 do T_2 je teplo na mol, entropie je plocha pod c_p/T v grafu níže](images/ohrev.svg){width=80%}

## Látkové množství
n := m/M | mol

## Změna entropie
"Při vratném ohřevu za stálého tlaku přijme látka v každém okamžiku teplo dQ = n·c_p·dT, a to při teplotě T, takže dS = n·c_p·dT/T. Celková změna je součet přes všechny malé kroky:"
ΔS := n·integral(c_p(T)/T, T: T_1 .. T_2) | J/K
"Totéž po členech, jak se integruje na papíře (T₁, T₂ v kelvinech):"
ΔS_ruc := n·(a·ln(T_2/T_1) + b·(T_2 - T_1) - c/2·(1/T_2^2 - 1/T_1^2)) | J/K
"Plocha pod křivkou c_p(T)/T mezi T₁ a T₂ je entropie připadající na jeden mol:"
plot(c_p(T)/T, T: T_1 .. T_2, area: T_1 .. T_2, title: "c_p/T; plocha je ΔS/n") | J/(mol·K^2)

## Dodané teplo a střední teplota
"Teplo dodané při ohřevu za stálého tlaku (zdroj se na něj neptá):"
Q := n·integral(c_p(T), T: T_1 .. T_2) | kJ
"Střední termodynamická teplota ohřevu je teplota, při které by se stejné teplo dodalo stejnou změnou entropie, Q = T_s·ΔS:"
T_s := Q/ΔS | K
T_arit := (T_1 + T_2)/2 | K

## Posudky
check "Integrál a výpočet po členech se shodují": abs(ΔS - ΔS_ruc) ≤ 0.001 J/K
check "Shoda se zdrojem (820 J/K, zaokrouhleno)": abs(ΔS - 820 J/K) ≤ 0.5 J/K
check "Střední teplota leží mezi T_1 a T_2": T_1 < T_s and T_s < T_2
check "Entropie roste (ohřev je vratný, ΔS > 0)": ΔS > 0 J/K
"Entropie 1 kg síranu vzroste při ohřevu asi o 820 J/K. Třetí člen tepelné kapacity (s c) je při těchto teplotách zanedbatelný. Střední teplota ohřevu vychází o něco nižší než aritmetický průměr mezí, protože při nižších teplotách přijde stejné teplo na větší přírůstek entropie."
