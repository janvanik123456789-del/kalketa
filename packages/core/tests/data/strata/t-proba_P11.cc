# Sonda P11 — index v rekurentním buňce, prvkové násobení řad
saz := [0.01, 0.02, 0.03, 0.04]
table K: {rows=1..4}
    | k | Z = prev(Z, 1000) · (1 + saz[k]) - 100 |
z1 := K.Z[1]
z2 := K.Z[2]
z3 := K.Z[3]
z4 := K.Z[4]
prvkove := [1, 2, 3] * [4, 5, 6]
skalarsoucin := [1, 2, 3] · [4, 5, 6]
