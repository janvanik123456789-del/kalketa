# Výtok vody z nádrže a doba jejího vyprázdnění
"Podle úlohy 1154 Sbírky řešených úloh z fyziky (reseneulohy.cz/1154; původně Halpern: Schaum's 3000 Solved Problems in Physics). Válcová nádrž o poloměru 0,9 m stojí na podstavci vysokém 6 m a je do výšky 3 m naplněna vodou. U dna je otvor se zátkou o ploše 6,3 cm². Jakou rychlostí dopadne proud vody na zem, když zátku vyndáme, a za jak dlouho se nádrž vyprázdní? Teorie (Bernoulliho rovnice, rovnice kontinuity, Torricelliho vzorec) je ve vrstvě Podklady. Obrázek a grafy jsou vlastní."
"Zdroj: https://reseneulohy.cz/1154"

## Zápis
r := 0.9 m            ' poloměr nádrže
h_1 := 3 m            ' výška vody v nádrži
h_2 := 6 m            ' výška podstavce
S_2 := 6.3 cm^2       ' plocha otvoru po zátce
g := 9.81 m/s^2       ' tíhové zrychlení
![Nádrž na podstavci: voda do výšky h₁ nad dnem, dno ve výšce h₂ nad zemí, otvor u dna, proud dopadá na zem v bodě A](images/nadrz.svg){width=80%}

## Rychlost dopadu na zem
"Bernoulliho rovnice (viz Podklady) pro hladinu (index 1) a bod A, kde proud dopadá na zem (index 3):"
relation p_1 + y_1·ρ·g + ρ·v_1^2/2 == p_3 + y_3·ρ·g + ρ·v_3^2/2 {eq}
"Na hladině i u země působí jen atmosférický tlak, zem je nulová výška, hladina je h_1 + h_2 nad zemí a v okamžiku vyndání zátky stojí:"
relation p_1 == p_a {eq}
relation p_3 == p_a {eq}
relation y_3 == 0 m {eq}
relation y_1 == h_1 + h_2 {eq}
relation v_1 == 0 m/s {eq}
derive v_3 == sqrt(2·g·(h_1 + h_2))
"Rychlost dopadu proudu na zem:"
v_A := sqrt(2·g·(h_1 + h_2)) | m/s

## Doba vyprázdnění
"Rychlost výtoku v_v otvorem z Bernoulliho rovnice pro hladinu ve výšce h nad otvorem a pro otvor (Torricelliho vzorec, viz Podklady):"
relation p_a + (h_2 + h)·ρ·g == p_a + h_2·ρ·g + ρ·v_v^2/2 {eq}
derive v_v == sqrt(2·g·h) {eq}
"Za každou chvíli ubude v nádrži tolik vody, kolik vyteče otvorem (rovnice kontinuity). Rychlost poklesu hladiny v_p i rychlost výtoku se ale mění s výškou hladiny h, proto počítáme s poklesem o dh za čas dt (dh je záporné, hladina klesá):"
S_1 := π·r^2 | m^2
relation S_1·v_p == S_2·v_v {eq}
relation v_p == -dh/dt {eq}
"Dosazením vznikne diferenciální rovnice, jejíž proměnné jdou oddělit:"
derive -S_1·dh/dt == S_2·sqrt(2·g·h) {eq}
derive -dh/sqrt(h) == sqrt(2·g)·S_2/S_1·dt
"Integrací od plné nádrže (výška h_1) po prázdnou (0) a od času 0 do t dostaneme dobu vyprázdnění:"
t_v := S_1/(S_2·sqrt(2·g))·integral(1/sqrt(h), h: 0 m .. h_1) == S_1/(S_2·sqrt(2·g))·2·sqrt(h_1) == S_1/S_2·sqrt(2·h_1/g) | min {eq}

## Průběh vyprazdňování
"Výška hladiny v čase t, řešení té diferenciální rovnice s h(0) = h_1:"
h_t(t) := (sqrt(h_1) - S_2/S_1·sqrt(g/2)·t)^2
v_t(t) := sqrt(2·g·h_t(t))
plot(h_t(t), t: 0 s .. t_v, title: "Výška hladiny v nádrži") | m
plot(v_t(t), t: 0 s .. t_v, title: "Rychlost výtoku otvorem") | m/s
"Polovina vody vyteče rychleji než druhá polovina: hladina klesne na h_1/2 za"
solve t_pol: h_t(t_pol) == h_1/2 in 0 s .. t_v
t_pol_min := t_pol | min
