# Soustava tří lineárních rovnic s jednotkami

"Staticky určitý nosník: vetknutí na jedné straně, kloubová podpora na druhé."
L := 6 m
F_1 := 10 kN                  ' síla ve třetině pole
a_1 := 2 m
F_2 := 5 kN                   ' síla ve čtyřech pětinách pole
a_2 := 4 m
"Rovnováha: součet vodorovných sil, součet svislých sil a součet momentů k bodu A."
solve (R_A, R_B, H_A):
    R_A + R_B == F_1 + F_2
    R_B·L - F_1·a_1 - F_2·a_2 == 0
    H_A == 0 kN
    guess R_A = 1 kN, R_B = 1 kN, H_A = 0 kN
"Vodorovná reakce nulová, součet svislých reakcí se rovná součtu sil."
check "Reakce jsou v rovnováze": abs(R_A + R_B - F_1 - F_2) < 1e-9 kN
check "Momentová rovnováha": abs(R_B·L - F_1·a_1 - F_2·a_2) < 1e-9 kN·m
check "Vodorovná reakce nulová": abs(H_A) < 1e-12 kN
