# Prodloužení drátu vlastní tíhou
"Podle úlohy 2091 Sbírky řešených úloh z fyziky (reseneulohy.cz/2091; původně Mandíková, Rojko: Soubor úloh z mechaniky, MFF UK 1994). Železný drát stálého průřezu dlouhý 200 m visí volně. O kolik se prodlouží vlastní tíhou? Deformace je pružná. Obrázek a grafy jsou vlastní."

## Zápis
l := 200 m            ' délka drátu
ρ := 7800 kg/m^3      ' hustota železa
E := 200 GPa          ' modul pružnosti železa v tahu
g := 9.81 m/s^2       ' tíhové zrychlení
"Průřez S je stálý a ze vztahů vypadne, jeho velikost není potřeba."
![Drát délky l visí z upevnění; element dx ve vzdálenosti x od volného konce táhne tíha části drátu pod ním; vpravo napětí rostoucí k upevnění](images/drat.svg){width=75%}

## Rozbor
"Drát táhne dolů vlastní tíha, nejvíc nahoře u upevnění, kde visí celý, nejméně u volného konce. Napětí se tedy po délce mění. Drát rozdělíme na tenké elementy dx, v nichž je napětí stálé, každý prodloužíme podle Hookova zákona a prodloužení sečteme integrálem."

## Řešení
"Na element ve vzdálenosti x od volného konce působí tíha části drátu pod ním; ta má hmotnost (S je průřez)"
relation m_x == ρ·S·x
"a tíhu:"
derive G_x := m_x·g == ρ·S·x·g {eq}
"Tahové napětí v elementu, podíl tíhy a průřezu:"
σ_x(x) := ρ·S·x·g/S == ρ·x·g {eq}
"Poměrné prodloužení elementu podle Hookova zákona, ε = Δdx/dx:"
ε_x(x) := σ_x(x)/E == ρ·x·g/E {eq}
"Element se tedy prodlouží o Δdx = ε_x(x)·dx a celý drát o součet všech:"
Δl := integral(ε_x(x), x: 0 m .. l) == integral(ρ·x·g/E, x: 0 m .. l) == ρ·g·l^2/(2·E) | mm {eq}

## Co výsledek znamená
"Napětí roste od volného konce k upevnění, největší je nahoře:"
σ_max := σ_x(l) | MPa
plot(σ_x(x), x: 0 m .. l, title: "Tahové napětí po délce drátu (x od volného konce)") | MPa
"Část drátu délky x od volného konce se prodlouží o ρ·g·x²/(2·E); celý drát o Δl:"
Δl_x(x) := ρ·g·x^2/(2·E)
plot(Δl_x(x), x: 0 m .. l, points: [l, Δl], title: "Prodloužení části drátu pod místem x") | mm
"Pro srovnání: stejně dlouhý drát napjatý všude největším napětím σ_max by se prodloužil dvakrát víc:"
Δl_stejne := σ_max/E·l | mm
n := Δl_stejne/Δl
