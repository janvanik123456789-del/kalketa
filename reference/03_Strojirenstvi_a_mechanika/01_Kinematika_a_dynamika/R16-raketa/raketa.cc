# Raketa: největší spotřeba paliva při přetížení 7 g, doba hoření a konečná rychlost
"Podle úlohy 2311 Sbírky řešených úloh z fyziky (reseneulohy.cz/2311; původně Mandíková, Rojko: Soubor úloh z mechaniky, MFF UK 1994). Raketa o hmotnosti 2 t nese 12 t paliva, motor vypouští spaliny rychlostí 5000 km/h vzhledem k raketě. Posádka snese nejvýš zrychlení 7 g. Jaká je největší sekundová spotřeba paliva, jak dlouho při ní motor hoří a jakou rychlost raketa nakonec získá? Raketa startuje svisle, odpor vzduchu zanedbáváme a tíhové zrychlení bereme stálé. Teorie (Meščerského a Ciolkovského rovnice) je ve vrstvě Podklady. Obrázek a grafy jsou vlastní."

## Zápis
M_r := 2 t                ' hmotnost rakety bez paliva
M_p := 12 t               ' hmotnost paliva
v_R := 5000 km/h | m/s    ' výtoková rychlost spalin vzhledem k raketě
n := 7                    ' největší dovolené zrychlení jako násobek g
g := 9.81 m/s^2           ' tíhové zrychlení
![Raketa startující svisle vzhůru: tah motoru nahoru, tíha dolů, spaliny vytékají dolů výtokovou rychlostí v_R](images/raketa.svg){width=55%}

## Největší sekundová spotřeba paliva
"Meščerského rovnice (viz Podklady) pro raketu startující svisle vzhůru, kladný směr nahoru. Hmotnost m rakety s palivem ubývá, dm je záporné:"
relation m·dv/dt == -m·g - v_R·dm/dt {eq}
"Zrychlení rakety:"
derive dv/dt == -v_R·dm/(m·dt) - g {eq}
"Palivo hoří stálou sekundovou spotřebou q, takže hmotnost ubývá stejnoměrně. Zrychlení roste, jak raketa lehne, a největší je těsně před vyhořením paliva, kdy zbývá jen raketa (m = M_r). Tam smí dosáhnout n·g:"
relation dm/dt == -q {eq}
relation m == M_r {eq}
relation dv/dt == n·g {eq}
derive q == (n + 1)·g·M_r/v_R
q_max := (n + 1)·g·M_r/v_R | kg/s {eq}

## Doba hoření motoru
"Všechno palivo shoří za dobu"
τ := M_p/q_max | s {eq}

## Konečná rychlost rakety
"Hmotnost rakety a její zrychlení v čase t od startu:"
m_t(t) := M_r + M_p - q_max·t
a_t(t) := v_R·q_max/m_t(t) - g
"Konečná rychlost je součet všech přírůstků rychlosti za dobu hoření. Integrál dává Ciolkovského rovnici se ztrátou tíhou (viz Podklady):"
v_max := integral(a_t(t), t: 0 s .. τ) == v_R·ln((M_r + M_p)/M_r) - g·τ == v_R·ln((M_r + M_p)/M_r) - M_p·v_R/((n + 1)·M_r) | km/h {eq}

## Průběh letu
v_t(t) := v_R·ln((M_r + M_p)/m_t(t)) - g·t
plot(a_t(t)/g, t: 0 s .. τ, title: "Zrychlení posádky jako násobek g")
plot(v_t(t), t: 0 s .. τ, title: "Rychlost rakety") | km/h
"Na startu tah motoru jen o málo převyšuje tíhu plné rakety, raketa se zvedá pomalu:"
F_t := q_max·v_R | kN
G_0 := (M_r + M_p)·g | kN
check "tah zvedne plnou raketu": F_t > G_0
a_0 := a_t(0 s) | m/s^2
"Výška, ve které motor dohoří:"
h_k := integral(v_t(t), t: 0 s .. τ) | km
