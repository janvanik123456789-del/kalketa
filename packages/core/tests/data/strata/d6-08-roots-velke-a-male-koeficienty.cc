# Dávka 6 – list 08: roots polynomu s koeficienty 1e-10 a 1e10 v jednom polynomu
p(x) := x^2 - 1e10*x + 1e-10
k1 := roots(p(x), x)
q(x) := 1e10*x^2 + 1e5*x + 1e-10
k2 := roots(q(x), x)
