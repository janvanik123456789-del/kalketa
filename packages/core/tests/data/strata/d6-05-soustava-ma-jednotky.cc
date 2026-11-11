# Dávka 6 – list 05: soustava, jejíž rovnice mají různě velké jednotky (GPa, kN, mm, km)
F := 12 kN
A1 := 400 mm^2
A2 := 0.0008 m^2
L1 := 1200 mm
L2 := 1.2 km
E := 210 GPa
solve (F1, F2): F1 + F2 == F, F1 / A1 == F2 / A2 guess F1 = 1 kN, F2 = 1 kN
u1 := F1 * L1 / (E * A1) | mm
u2 := F2 * L2 / (E * A2) | mm
