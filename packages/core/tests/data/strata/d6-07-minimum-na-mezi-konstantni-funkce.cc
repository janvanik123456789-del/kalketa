# Dávka 6 – list 07: minimum přesně na mezi intervalu; maximize konstantní funkce
g(x) := (x - 5)^2
h(x) := 3
m3 := min_of(g(x), x: 0 .. 5)
v3 := minimize(g(x), x: 0 .. 5)
m4 := max_of(h(x), x: 0 .. 10)
v4 := maximize(h(x), x: 0 .. 10)
