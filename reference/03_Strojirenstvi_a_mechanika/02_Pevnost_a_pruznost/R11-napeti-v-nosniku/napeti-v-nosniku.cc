# Napětí na průřezu nosníku
"Podle úlohy 2159 Sbírky řešených úloh z fyziky (reseneulohy.cz/2159). Ocelový nosník délky 5 m je v první čtvrtině délky zatížen svisle dolů silou 10 kN a ve dvou třetinách délky silou 20 kN, na koncích je podepřen. Při kterém z obdélníkových průřezů 0,1 × 0,2 m a 0,2 × 0,1 m se nosník prohne víc? Pro ten průřez určete průběh napětí v první třetině délky. Vlastní tíhu zanedbáváme. Obrázky a grafy jsou vlastní."
"Zdroj: https://reseneulohy.cz/2159"

## Zápis
l := 5 m              ' délka nosníku
F_1 := 10 kN          ' síla v první čtvrtině
F_2 := 20 kN          ' síla ve dvou třetinách
x_1 := l/4            ' působiště první síly
x_2 := 2·l/3          ' působiště druhé síly
a_1 := 0.1 m          ' šířka prvního průřezu
b_1 := 0.2 m          ' výška prvního průřezu
a_2 := 0.2 m          ' šířka druhého průřezu
b_2 := 0.1 m          ' výška druhého průřezu
E := 210 GPa          ' modul pružnosti oceli (jen pro průhyb)
![Nosník na dvou podporách se silami F₁ a F₂ a reakcemi V₁ a V₂; vyznačený řez v první třetině délky](images/nosnik.svg){width=90%}

## Reakce v podporách
"Rovnováha sil a rovnováha momentů k levé podpoře:"
relation V_1 + V_2 == F_1 + F_2 {eq}
relation l·V_2 == x_1·F_1 + x_2·F_2 {eq}
"Z (2) a dosazením do (1):"
derive V_2 == (x_1·F_1 + x_2·F_2)/l {eq}
derive V_1 == ((l - x_1)·F_1 + (l - x_2)·F_2)/l {eq}
V_2 := (x_1·F_1 + x_2·F_2)/l | kN
V_1 := ((l - x_1)·F_1 + (l - x_2)·F_2)/l | kN

## Ohybový moment
"Moment sil vlevo od místa x, se znaménkem jako ve sbírce (dole tah je záporný moment); mezi silami x_1 < x < x_2 je to M(x) = −V_1·x + F_1·(x − x_1):"
M(x) := -V_1·x + if(x > x_1, F_1·(x - x_1), 0 kN·m) + if(x > x_2, F_2·(x - x_2), 0 kN·m) {eq}
plot(M(x), x: 0 m .. l, extremes: true, title: "Průběh ohybového momentu") | kN·m

## Kvadratický moment průřezu
![Dva obdélníkové průřezy: první na výšku (0,1 × 0,2 m), druhý naležato (0,2 × 0,1 m); neutrální osa prochází těžištěm](images/prurezy.svg){width=70%}
"Pro obdélník šířky a a výšky b, osa y svisle od těžiště:"
I_1 := integral(integral(y^2, y: -b_1/2 .. b_1/2), z: -a_1/2 .. a_1/2) == a_1·b_1^3/12 | cm^4 {eq}
I_2 := integral(integral(y^2, y: -b_2/2 .. b_2/2), z: -a_2/2 .. a_2/2) == a_2·b_2^3/12 | cm^4
"Zakřivení nosníku je M/(E·I): čím menší I, tím větší ohyb. Poměr ohybů:"
n_ohyb := I_1/I_2
"Průhyb w(x), svislý posun osy nosníku, z rovnice ohybové čáry w″ = −M(x)/(E·I), u podpor nulový (ve sbírce rovnice (7), kde je průhyb psaný y′ s čárkami, aby se nepletl se souřadnicí y v průřezu):"
solve w_1(x): E·I_1·w_1″ == -M(x) in 0 m .. l
    w_1(0 m) == 0 m
    w_1(l) == 0 m
solve w_2(x): E·I_2·w_2″ == -M(x) in 0 m .. l
    w_2(0 m) == 0 m
    w_2(l) == 0 m
plot(w_1(x), w_2(x), x: 0 m .. l, title: "Ohybová čára obou průřezů") | mm
x_w := minimize(w_2(x), x: 0 m .. l)
w_1max := -w_1(x_w) | mm
w_2max := -w_2(x_w) | mm
"Druhý průřez se prohne tolikrát víc:"
n_w := w_2max/w_1max

## Napětí na průřezu v první třetině
"Druhý průřez se prohne víc; pro něj napětí v řezu x_σ = l/3. Tady y není průhyb, ale výška vlákna v průřezu nad těžištěm (neutrální osou): −b_2/2 ≤ y ≤ b_2/2."
x_σ := l/3
M_σ := M(x_σ) | kN·m
σ(y) := M_σ/I_2·y == 12·M_σ/(a_2·b_2^3)·y == -12/(a_2·b_2^3)·(V_1·x_σ - F_1·(x_σ - x_1))·y {eq}
"Napětí je lineární ve výšce y, o kolik se změní na metr výšky průřezu:"
k_σ := σ(1 m)/(1 m) | GPa/m
σ_h := σ(b_2/2) | MPa      ' horní okraj: tlak
σ_d := σ(-b_2/2) | MPa     ' dolní okraj: tah
plot(σ(y), y: -b_2/2 .. b_2/2, roots: true, title: "Napětí na průřezu v první třetině délky") | MPa
![Průběh normálového napětí po výšce průřezu: nahoře tlak, dole tah, v těžišti nula](images/napeti.svg){width=55%}
"Pozor: ve sbírce je ve vzorci (10) u členu F₁ znaménko + místo −; proto tam vychází sklon −5/3 GPa/m. Ze vzorců (5) a (9) vychází, jak spočteno výše, −7/6 GPa/m. Zapsaný tak, jak je ve sbírce, by tento krok Kalketa při ověření odvození odmítla."
