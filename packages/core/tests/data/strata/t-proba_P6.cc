# Sonda P6 — hledání v range, kde některý skenovaný bod je singularita
# Funkce Rv(h) = obsah(h)/obvod(h) je v h = 0 podíl 0/0.
D := 0.5 m
phi(h) := acos(1 - 2·h / D)
obsah(h) := D^2 / 8 · (2·phi(h) - sin(2·phi(h)))
obvod(h) := D · phi(h)
Rv(h) := obsah(h) / obvod(h)
b1 := first(Rv(x) > 0.05 m, x: 0 cm .. 49 cm)
b2 := first(Rv(x) > 0.05 m, x: 1 cm .. 49 cm)
b3 := minimize((Rv(x) - 0.1 m)^2, x: 0 cm .. 49 cm)
b4 := minimize((Rv(x) - 0.1 m)^2, x: 1 cm .. 49 cm)
b5 := maximize(Rv(x), x: 0 cm .. 49 cm)
b6 := first(Rv(x) > 0.05 m, x: 0.0 m .. 0.49 m)
b7 := Rv(0 cm)
