# Dávka 5 – list 03: atan2 ve všech čtyřech kvadrantech a na osách, acos na hranici
q1 := atan2(1, 1)
q2 := atan2(1, -1)
q3 := atan2(-1, -1)
q4 := atan2(-1, 1)
q5 := atan2(0, 1)
q6 := atan2(1, 0)
q7 := atan2(-1, 0)
q8 := atan2(0, -1)
q9 := atan2(0, 0)
q10 := atan2(3 m, 4 m)         ' atan2 s jednotkami
h1 := acos(1 + 1e-16)          ' hranice definičního oboru
h2 := acos(1 - 1e-16)
h3 := acos(1.0000000001)       ' zjevně mimo obor
