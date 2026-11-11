# Dávka 6 – list 06: minimize funkce se dvěma lokálními minimy
f(x) := x^4 - 6*x^2 + 4*x
m1 := min_of(f(x), x: -3 .. 3)    ' interval obsahuje obe minima
v1 := minimize(f(x), x: -3 .. 3)
m2 := min_of(f(x), x: 0 .. 3)     ' jen lokální minimum
v2 := minimize(f(x), x: 0 .. 3)
