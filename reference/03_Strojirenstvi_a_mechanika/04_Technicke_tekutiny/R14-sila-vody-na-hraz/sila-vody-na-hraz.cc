# Síla a moment vody na svislou stěnu hráze
"Podle úlohy 1152 Sbírky řešených úloh z fyziky (reseneulohy.cz/1152; původně Halpern: Schaum's 3000 Solved Problems in Physics). Voda u hráze přehrady sahá do výšky h, hráz je dlouhá l. Určete výslednou sílu F, kterou voda tlačí hráz vodorovně, její moment M k bodu O na patě hráze a výšku H nad patou, v níž by síla F měla moment M. Úloha je obecná; pro představu dosazujeme hráz vysokou 30 m a dlouhou 100 m (předpoklad). Obrázek a grafy jsou vlastní."

## Zápis
h := 30 m             ' výška vody u hráze (předpoklad)
l := 100 m            ' délka hráze (předpoklad)
ρ := 1000 kg/m^3      ' hustota vody
g := 9.81 m/s^2       ' tíhové zrychlení
![Hráz z boku: voda do výšky h, vodorovný pruh dy v hloubce y pod hladinou, tlaková síla dF na něj a její rameno r k bodu O na patě hráze](images/hraz.svg){width=80%}

## Síla vody
"V hloubce y pod hladinou vyznačíme vodorovný pruh výšky dy; na vnitřní i vnější straně hráze má plochu"
relation dS == l·dy {eq}
"Zevnitř na něj tlačí voda a vzduch nad ní, zvenku jen vzduch:"
relation p == p_h + p_a {eq}
relation dF_1 == p·dS {eq}
relation dF_2 == p_a·dS {eq}
"Výsledná síla na pruh; atmosférický tlak se zevnitř a zvenku vyruší:"
relation dF == dF_1 - dF_2 {eq}
derive dF == p_h·dS
"Hydrostatický tlak v hloubce y:"
relation p_h == ρ·g·y {eq}
derive dF == ρ·g·y·l·dy {eq}
"Síla na celou stěnu je součet přes všechny pruhy od hladiny ke dnu:"
F := integral(ρ·g·y·l, y: 0 m .. h) == ρ·g·l·h^2/2 | MN {eq}

## Moment síly k patě hráze
"Pruh v hloubce y má k bodu O na patě hráze rameno, výšku nad patou:"
relation dM == r·dF {eq}
relation r == h - y {eq}
derive dM == (h - y)·ρ·g·y·l·dy {eq}
M := integral((h - y)·ρ·g·y·l, y: 0 m .. h) == ρ·g·l·h^3/6 | MN·m {eq}

## Působiště výsledné síly
"Síla F v jediném bodě by měla moment M ve výšce H nad patou:"
H := M/F == (ρ·g·l·h^3/6)/(ρ·g·l·h^2/2) == h/3 | m {eq}
"Výslednice tlaku vody tedy působí ve třetině výšky vody nad patou hráze."

## Průběh po výšce
"Tlak vody roste s hloubkou rovnoměrně, od nuly u hladiny:"
p_v(y) := ρ·g·y
plot(p_v(y), y: 0 m .. h, title: "Hydrostatický tlak v hloubce y") | kPa
"Zatížení hráze na metr výšky q(y) = ρ·g·y·l; plocha pod ním je výsledná síla F:"
q(y) := ρ·g·y·l
plot(q(y), y: 0 m .. h, area: 0 m .. h, title: "Zatížení hráze po výšce; plocha je síla F") | MN/m
