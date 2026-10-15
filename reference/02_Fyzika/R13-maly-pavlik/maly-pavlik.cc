# Malý Pavlík
"Podle úlohy 112 Sbírky řešených úloh z fyziky (reseneulohy.cz/112; původně Mandíková, Rojko: Soubor úloh z mechaniky, MFF UK 1994). Malý Pavlík se rozjel na kole po přímé cestě. Závislost jeho zrychlení na čase udává tabulka. Narýsujte graf, určete tvar funkce a(t) a odtud průběh rychlosti a polohy. V čase 0 s byl Pavlík v klidu v počátku. Časy jsou převedené do sekund (sbírka je má v desetinách sekundy). Obrázek je vlastní."

## Zápis
table Pavlik:
    | t [s] {0.0} | a [m/s²] {0.0} |
    | 0           | 4.0            |
    | 0.1         | 3.7            |
    | 0.2         | 3.3            |
    | 0.3         | 3.0            |
    | 0.4         | 2.6            |
    | 0.5         | 2.3            |
    | 0.6         | 1.9            |
    | 0.7         | 1.6            |
    | 0.8         | 1.2            |
    | 0.9         | 0.8            |
    | 1.0         | 0.4            |
![Pavlík na kole na přímé cestě: poloha x od počátku, rychlost v a zrychlení a ve směru jízdy](images/pavlik.svg){width=75%}

## Zrychlení
"Body v grafu leží na přímce, zrychlení klesá s časem rovnoměrně. Přímka a(t) = q − k·t: q je zrychlení v čase 0, směrnici k určíme z prvního a posledního bodu:"
q := Pavlik.a[1]
k := (Pavlik.a[1] - Pavlik.a[11])/(Pavlik.t[11] - Pavlik.t[1])
a(t) := q - k·t {eq}
"Přesněji vede přímku všemi body metoda nejmenších čtverců: hledáme přímku b_0 + b_1·t, pro kterou je součet čtverců odchylek bodů od ní Σ(a − b_0 − b_1·t)² nejmenší. Derivace podle b_0 a b_1 položené rovny nule dávají vzorce pro směrnici a úsek; program je spočte ze součtů přes body tabulky:"
a_fit := fit(Pavlik.a, x: Pavlik.t, steps: true)
"Přímka ze sbírky (krajní body) a přímka nejmenších čtverců se liší jen málo, R² blízko 1 říká, že body na přímce opravdu leží."
plot(Pavlik.a, a(t), a_fit(t), t: Pavlik.t, title: "Zrychlení Pavlíka: změřené body a přímky") | m/s^2

## Rychlost a poloha
"Rychlost je integrál zrychlení. Integrační konstanta je nula, protože v čase 0 byl Pavlík v klidu, proto integrujeme od 0 s:"
v(t) := integral(a(τ), τ: 0 s .. t) == q·t - k/2·t^2 {eq}
"Poloha je integrál rychlosti, konstanta je opět nula, protože Pavlík vyjel z počátku (ve sbírce s, zde x, protože s je sekunda):"
x(t) := integral(v(τ), τ: 0 s .. t) == q/2·t^2 - k/6·t^3 {eq}
plot(v(t), t: 0 s .. 1 s, title: "Rychlost Pavlíka") | m/s
plot(x(t), t: 0 s .. 1 s, title: "Poloha Pavlíka") | m
"Za 1 s od rozjezdu:"
v_1 := v(1 s) | m/s
x_1 := x(1 s) | m
"Rychlost by rostla, dokud zrychlení neklesne na nulu. Podle přímky by to bylo v čase t_0, kousek za koncem měření (1 s), takže jde jen o odhad:"
solve t_0: a(t_0) == 0 m/s^2
v_max := v(t_0) | m/s
