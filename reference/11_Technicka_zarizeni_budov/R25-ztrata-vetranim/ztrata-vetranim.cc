# Tepelná ztráta větráním rodinného domu s rekuperací podle ČSN EN 12831-1
"Podle příkladu z článku V. Zmrhal, J. Boháč: Tepelná ztráta větráním podle ČSN EN 12831-1 (Vytápění, větrání, instalace 2/2021, ČVUT v Praze). Přízemní rodinný dům na okraji Prahy, čtyřčlenná rodina, nucené rovnotlaké větrání jednotkou se zpětným získáváním tepla (ZZT). Spočítáme tepelnou ztrátu větráním každé místnosti univerzálním postupem normy: větráním obálkou budovy (infiltrace), nuceným větráním (vzduch za rekuperací je chladnější než místnost) a převodem vzduchu (koupelna vytápěná na 24 °C nasává vzduch z okolních místností). Schéma je vlastní, teorie je ve vrstvě Podklady."

## Zadání
t_e := -15 °C                 ' venkovní výpočtová teplota, Praha (ČSN EN 12831-1, NA.1)
t_i := 20 °C                  ' převažující vnitřní teplota
t_k := 24 °C                  ' koupelna
V_b := 298 m^3                ' vnitřní objem vzduchu v domě (součet místností)
A_env := 359.9 m^2            ' plocha obálky domu z vnitřních rozměrů (ČSN EN ISO 9972)
n_50 := 1.5 h^-1               ' intenzita výměny při 50 Pa (zvoleno, nucené větrání podle ČSN 73 0540-2)
V_sup := 135 m^3/h            ' přívod venkovního vzduchu jednotkou
V_exh := 135 m^3/h            ' odvod vzduchu jednotkou
η_rec := 0.8                  ' teplotní faktor ZZT (výrobce)
![Rovnotlaké větrání se zpětným získáváním tepla: přívod do obytných místností, odvod z kuchyně, WC a koupelny, vzduch převáděný chodbou, infiltrace obálkou](images/vetrani.svg){width=90%}
"Součinitele podle normy (příloha B): orientace zóny, objemového průtoku a nerovnotlakého větrání; vzduch při 20 °C."
f_dir := 2
f_qv := 0.03
f_e := 1                      ' rovnotlaké větrání
ρc := 1.2 kg/m^3·0.28 W·h/(kg·K) | W·h/(m^3·K)

## Dům jako zóna: infiltrace a vzduch za rekuperací
"Měrná průvzdušnost obálky při 50 Pa ze zvolené intenzity n_50. Zdroj uvádí 1,33 m³/(h·m²); z objemu místností 298 m³ vychází 1,24, zdroj zřejmě počítal s větším vnitřním objemem (i s příčkami). Dál počítáme s hodnotou zdroje, aby šlo výsledky porovnat."
V_50 := n_50·V_b/A_env | m^3/(h·m^2)
V_50z := 1.33 m^3/(h·m^2)     ' hodnota zdroje
"Dodatečná infiltrace a vzduch, který proniká obálkou do domu (jednotka přivádí i odvádí stejně, podtlak nevzniká):"
V_inf := V_50z·A_env·f_qv·f_e | m^3/h {eq}
V_env := max(V_exh - V_sup, 0 m^3/h) + V_inf | m^3/h {eq}
"Teplota vzduchu za výměníkem ZZT (odváděný vzduch má 20 °C):"
t_rec := t_e + η_rec·(t_i - t_e) | °C {eq}

## Obývací pokoj podrobně
"Postup pro jednu místnost, jak ho ukazuje zdroj: minimální průtok, vzduch obálkou úměrně ploše obálky místnosti, vzduch pro technické systémy, a z nich tři části ztráty."
V_1 := 97.2 m^3
a_1 := 120.7 m^2              ' obálka místnosti včetně podlahy
V_min1 := 0.5 h^-1·V_1 | m^3/h
V_leak1 := V_inf·a_1/A_env | m^3/h
V_env1 := min(V_env, f_dir·V_leak1) | m^3/h
V_tech1 := max(55 m^3/h + 0 m^3/h, 40 m^3/h) | m^3/h
Q_env1 := max(V_env1, V_min1 - V_tech1)·ρc·(t_i - t_e) | W {eq}
Q_sup1 := 55 m^3/h·ρc·(t_i - t_rec) | W {eq}
Q_V1 := Q_env1 + Q_sup1 | W
"Nucené větrání pokrývá víc než minimální průtok (55 > 48,6 m³/h), proto obálkou počítáme jen skutečnou infiltraci; přiváděný vzduch má 13 °C a místnost ho musí dohřát."

## Všechny místnosti
"Plochy obálek místností zdroj neuvádí (kromě obývacího pokoje); jsou dopočtené z jeho tabulky průtoků. Jejich součet 360,1 m² souhlasí s plochou obálky domu. Vzduch převáděný z okolních místností má 20 °C, ztrátu dává jen v koupelně vytápěné na 24 °C."
t_tr := 20 °C
"Ztráta obálkou jedné místnosti jako funkce jejích údajů, ať je vzorec v záhlaví tabulky krátký: vyšší z infiltrace a z chybějícího minimálního větrání."
q_env(V, t, n, p, o, r, a) := max(min(V_env, f_dir·V_inf·a/A_env), n·V - max(p + r, o))·ρc·(t - t_e)
table Mistnosti:
    | mistnost       | V [m³] | t [°C] | n [h⁻¹] | p [m³/h] | o [m³/h] | r [m³/h] | a [m²] | Q_env [W] {0} = q_env(V, t, n, p, o, r, a) | Q_sup [W] {0} = p·ρc·(t - t_rec) | Q_tr [W] {0} = r·ρc·(t - t_tr) | Q [W] {0} = Q_env + Q_sup + Q_tr |
    | obývací + KK   | 97.2   | 20     | 0.5     | 55       | 40       | 0        | 120.7  |   |   |   |   |
    | WC             | 5.7    | 20     | 0       | 0        | 25       | 25       | 5.0    |   |   |   |   |
    | zádveří        | 22.7   | 20     | 0.5     | 0        | 10       | 10       | 26.3   |   |   |   |   |
    | ložnice        | 32.4   | 20     | 0.5     | 40       | 0        | 0        | 35.1   |   |   |   |   |
    | pokoj 1        | 34.6   | 20     | 0.5     | 20       | 0        | 0        | 51.4   |   |   |   |   |
    | pokoj 2        | 34.0   | 20     | 0.5     | 20       | 0        | 0        | 43.9   |   |   |   |   |
    | koupelna, WC   | 24.8   | 24     | 0.5     | 0        | 50       | 50       | 28.8   |   |   |   |   |
    | technická m.   | 13.2   | 20     | 0.5     | 0        | 10       | 10       | 16.3   |   |   |   |   |
    | spíž           | 8.4    | 20     | 0       | 0        | 0        | 0        | 11.3   |   |   |   |   |
    | chodba         | 25.4   | 20     | 0       | 0        | 0        | 0        | 21.3   |   |   |   |   |
    | Celkem         |        |        |         | Σ        | Σ        |          | Σ      | Σ | Σ | Σ | Σ |
"Sloupce: V objem, t vnitřní teplota, n minimální intenzita větrání, p přívod, o odvod, r vzduch převáděný z okolí, a plocha obálky místnosti."

## Výsledek
Q_env := sum(Mistnosti.Q_env) | W
Q_sup := sum(Mistnosti.Q_sup) | W
Q_tr := sum(Mistnosti.Q_tr) | W
Q_V := sum(Mistnosti.Q) | W
check "Souhlas se zdrojem (725 W)": abs(Q_V - 725 W) ≤ 5 W   source "VVI 2/2021, tab. 5"
check "Rovnotlaké větrání": abs(sum(Mistnosti.p) - sum(Mistnosti.o)) ≤ 1 m^3/h
"Bez rekuperace by se přiváděný vzduch ohříval z −15 °C a ztráta nuceným větráním by byla:"
Q_sup0 := V_sup·ρc·(t_i - t_e) | W
ΔQ := Q_sup0 - Q_sup | W
