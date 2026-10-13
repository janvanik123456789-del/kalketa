# Kvadratická rovnice

"Řešíme rovnici **a·x² + b·x + c = 0** a vyšetříme parabolu y = a·x² + b·x + c: kořeny, vrchol, tečnu a plochu mezi křivkou a osou x. Koeficienty a, b, c lze v editoru měnit posuvníky; výpočet, kontroly i graf se přepočítají samy."

## Zadání

"Koeficienty rovnice:"
a := -2 {slider=-5..5}
b := 2 {slider=-10..10 beside}
c := 10 {slider=-20..20 beside}

"Parabola jako funkce listu. Z ní vychází řešení, vrchol, tečna, plocha i graf, takže stačí změnit koeficienty."
y(x) := a·x^2 + b·x + c

## Podmínka řešitelnosti

"Rovnice má reálné kořeny, když její diskriminant D = b² − 4·a·c není záporný. Při D < 0 parabola osu x neprotne: kontrola níže pak nevyhoví a řádky, které s kořeny počítají (zkoušky, plocha), se nespočítají. Zkuste to posuvníkem u a."
D := b^2 - 4·a·c
check "rovnice má reálné kořeny": D ≥ 0

## Kořeny

"Kořeny hledáme v reálných číslech. Program vypíše postup jako na papíře: diskriminant, vzorec pro kořeny s dosazenými čísly a oba kořeny; kořeny jsou pak jména x_1 a x_2 pro další výpočet. Ukáže také vrchol paraboly V = [−b/(2·a); −D/(4·a)]."
solve x ∈ ℝ: y(x) == 0

"Zkouška Vietovými vzorci: součet kořenů je −b/a, jejich součin c/a."
check "součet kořenů": x_1 + x_2 == -b/a
check "součin kořenů": x_1·x_2 == c/a

"Rozklad na kořenové činitele: parabola je totéž co a·(x − x₁)·(x − x₂). Ověříme to v jednom bodě, například x = 3:"
y_r(x) := a·(x - x_1)·(x - x_2)
check "rozklad na kořenové činitele": y_r(3) == y(3)

## Vrchol paraboly

"Vrchol leží tam, kde je první derivace nulová, y′(x) = 0. Program derivaci rozepíše a rovnici vyřeší."
solve x_v: y′(x_v) == 0
y_v := y(x_v)

"Kontrola vzorcem pro vrchol, y_v = c − b²/(4·a):"
check "vrchol podle vzorce": y_v == c - b^2/(4·a)
V := [x_v, y_v]

## Tečna

"Směrnice tečny v bodě x₀ je hodnota první derivace k = y′(x₀); úhel tečny od osy x je α = arctg k."
x_0 := -1
k := y′(x_0)
α := atan(k) | °

## Plocha pod křivkou

"Plocha mezi parabolou a osou x mezi kořeny. Integrál je záporný tam, kde křivka leží pod osou x; plocha je jeho absolutní hodnota."
S := abs(integral(y(x), x: x_1 .. x_2))

## Graf

"V grafu jsou kořeny na ose x, osa souměrnosti, vrchol V spočtený v listu, vyšrafovaná plocha S a tečna v bodě x₀. Bod tečny jde v editoru táhnout po křivce a popisky přetáhnout jinam."
plot(y(x), x: -4 .. 5, place: "ratio=0.7", ylim: -30 .. 20, roots: true, symmetry: true, points: V, area: S, tangent: -1, labels: "t=-72,-44 a0.0=0,8 p0.0=4,-6 s=0,10")
