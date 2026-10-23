# Police na knihy: unese je a neprohne se?
"Průvodce Kalketou na jednom výpočtu. Prkno police leží na dvou konzolách a nese řadu knih. Spočítáme, jestli ho knihy nezlomí a jestli se viditelně neprohne, a najdeme nejtenčí prkno, které stačí. Každý oddíl začíná poznámkou, co v něm Kalketa ukazuje; v tisku zůstanou, aby se list dal číst i jako návod."

## Zadání: čísla s jednotkami
"Tip: hodnotu zadáte jako jméno, „:=“ a číslo s jednotkou. Jednotky se přepočítávají samy, milimetry a metry jde míchat. Za apostrofem je komentář, v tisku stojí vedle hodnoty."
L := 0.8 m {slider=0.4..1.6..0.05}    ' vzdálenost konzol (rozpětí)
b := 250 mm                           ' šířka (hloubka) prkna
t := 18 mm                            ' tloušťka prkna
m_k := 30 kg/m                        ' knihy na metr police, plná řada
![Prkno na dvou konzolách nese řadu knih jako rovnoměrné zatížení q; vpravo průřez prkna b × t](images/police.svg){width=85%}
"Tip: posuvník pod rozpětím L mění hodnotu tažením myší a celý list se hned přepočítá. Zkuste polici prodloužit a sledujte posudky."

## Materiál z tabulky
"Tip: dřeviny jsou v tabulce listu (vrstva Databáze, panel Tabulky). Řádek se vybere podle třídy funkcí pick a jeho sloupce se čtou s tečkou: material.E_0. Jinou dřevinu zvolíte přepsáním třídy, například na „D30“ pro dub."
material := pick(Dreviny, "C24")
"Pevnost pro výpočet: charakteristická pevnost se zmenší součinitelem pro trvalé zatížení v suchém interiéru a dílčím součinitelem materiálu."
k_mod := 0.6                          ' trvalé zatížení, třída provozu 1
γ_M := 1.3                            ' rostlé dřevo
f_md := k_mod·material.f_mk/γ_M | MPa

## Zatížení a vnitřní síly: vzorce s dosazením
"Tip: vzorec se v tisku vypíše obecně, pak s dosazenými čísly a nakonec s výsledkem, jako na papíře. Jednotku výsledku určíte svislou čarou: | N/m."
g := 9.81 m/s^2
q_k := (m_k + material.ρ·b·t)·g | N/m
q_d := 1.35·q_k | N/m
M_d := q_d·L^2/8 | N·m

## Ohyb
W := b·t^2/6 | mm^3
σ_m := M_d/W | MPa
check "Ohyb prkna": σ_m ≤ f_md   source "ČSN EN 1995-1-1, čl. 6.1.6"

## Průhyb
"Dřevo pod trvalým zatížením časem dotvaruje: průhyb vzroste o součinitel k_def. Mez L/300 je obvyklá pro viditelné prvky; menší průhyb oko na polici nepozná."
E := material.E_0
I := b·t^3/12 | mm^4
k_def := 0.6                          ' rostlé dřevo, třída provozu 1
w := (1 + k_def)·5·q_k·L^4/(384·E·I) | mm
w_lim := L/300 | mm
check "Průhyb police": w ≤ w_lim   source "ČSN EN 1995-1-1, čl. 7.2"
"Tip: graf je řádek plot(…). Pravým tlačítkem na grafu přidáte popisky, extrémy nebo šrafování; graf jde roztáhnout za okraj."
w_x(x) := (1 + k_def)·q_k·x·(L^3 - 2·L·x^2 + x^3)/(24·E·I)
plot(-w_x(x), x: 0 m .. L, extremes: true, title: "Průhyb prkna po délce") | mm

## Nejtenčí prkno, které stačí
"Tip: řešič solve najde neznámou z rovnice. Tady tloušťku, při které je průhyb právě na mezi; Kalketa rovnici upraví na vzorec a ten vypíše. Interval za „in“ říká, kde kořen hledat, a výsledek dostane jeho jednotku."
solve t_min: (1 + k_def)·5·q_k·L^4/(384·E·b·t_min^3/12) == w_lim in 5 mm .. 50 mm
"Prkno se vyrábí v řadě tlouštěk 18, 22, 25 a 28 mm; volíme nejbližší vyšší. Vlastní tíha prkna se s tloušťkou změní jen málo, výpočet ji bere z prkna 18 mm."

## Co dál
"Výsledek: prkno 18 mm ze smrku C24 knihy na 80 cm unese s velkou rezervou, rozhoduje průhyb. Přehled posudků je na začátku tisku, v editoru ve stavovém řádku dole. Teorie k výpočtu (odkud jsou vzorce pro moment a průhyb, co znamenají součinitele) je ve vrstvě Podklady pod listem, i s kontrolou v Pythonu. Oddíly čísluje Kalketa sama (Soubor → Vlastnosti výpočtu → Číslování oddílů), tam se nastavuje i styl a jazyk tisku. Soubor → Vzorové příklady nabízí další výpočty podle oborů."
