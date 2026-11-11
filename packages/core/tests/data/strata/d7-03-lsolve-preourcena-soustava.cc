# Dávka 7 – list 03: lsolve s přeurčenou soustavou (6 rovnic, 3 neznámé)
A6 := [1, 0, 0 | 0, 1, 0 | 1, 1, 0 | 1, 0, 1 | 0, 1, 1 | 1, 1, 1]
b6 := [1 kN | 2 kN | 3 kN | 4 kN | 5 kN | 6 kN]
x6 := lsolve(A6, b6)
A5 := [1, 0, 0 | 0, 1, 0 | 1, 1, 1]
b5 := [1 kN | 2 kN | 6 kN]
x5 := lsolve(A5, b5)
x51 := x5[1] | kN
x53 := x5[3] | kN
