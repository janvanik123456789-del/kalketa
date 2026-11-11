# Dávka 7 – list 09: interpolate(T, column: x) mezi řádky i mimo ně; sloupec v cm, dotaz v m
table Posun:
    | t [s] | x [cm] | F [kN] |
    | 0 | 0 | 0 |
    | 2 | 12 | 6 |
    | 4 | 30 | 10 |
    | 6 | 42 | 14 |
x1 := interpolate(Posun, t: 3 s).x | cm
x2 := interpolate(Posun, t: 1 s).x | m
x3 := interpolate(Posun, t: 8 s).x | cm
x4 := interpolate(Posun, t: -1 s).x | cm
F3 := interpolate(Posun, t: 3 s).F | kN
