# Kontrola v Pythonu

Výpočet listu znovu a jinou cestou: rovnice smyček se řeší Cramerovým pravidlem v komplexních číslech, bez matic. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu.

```python
# Cramer's rule on the two mesh equations, in plain complex numbers.
from cmath import phase
from math import pi, sqrt

U, f = 230.0, 50.0
R1, L1, R2, L2, M, Rz = 2.0, 0.040, 1.0, 0.010, 0.015, 6.0
w = 2 * pi * f

Z1 = complex(R1, w * L1)
Z2 = complex(R2 + Rz, w * L2)
ZM = complex(0, w * M)

# Z1·I1 − ZM·I2 = U, −ZM·I1 + Z2·I2 = 0
D = Z1 * Z2 - ZM * ZM
I1 = U * Z2 / D
I2 = U * ZM / D

S = U * I1.conjugate()
P1, P2, Pz = R1 * abs(I1) ** 2, R2 * abs(I2) ** 2, Rz * abs(I2) ** 2

print("I1 =", round(I1.real, 4), round(I1.imag, 4), "I2 =", round(I2.real, 4), round(I2.imag, 4))
result("ω", w, "rad/s")
result("k", M / sqrt(L1 * L2), "")
result("I_1a", abs(I1), "A")
result("I_2a", abs(I2), "A")
result("φ_1", phase(I1), "rad")
result("P", S.real, "W")
result("Q", S.imag, "W")
result("P_1", P1, "W")
result("P_2", P2, "W")
result("P_z", Pz, "W")
result("η", Pz / S.real * 100, "%")
```
