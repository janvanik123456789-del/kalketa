# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Jiná cesta k týmž výsledkům: Colebrookova rovnice iterací pevného bodu, rozdělení průtoku iterací rychlosti delší větve.

```python
from math import pi, sqrt, log10

def colebrook(re, rel):
    lam = 0.02
    for _ in range(200):
        lam = (-2 * log10(rel / 3.7 + 2.51 / (re * sqrt(lam)))) ** -2
    return lam

rho, eta, g = 1000.0, 0.001, 9.81
D, Q = 0.030, 1.2e-3
w = Q / (pi * D**2 / 4)
Re = rho * w * D / eta
lam = 0.3164 / Re**0.25
e_z = w**2 / 2 * (0.5 + 0.33 + 0.8 + lam * 12 / D)
w_t = Q / (12 * pi * 0.0025**2 / 4)
e_c = e_z + w_t**2 / 2 + g * 3
result("w", w, "m/s")
result("λ", lam, "")
result("λ_C", colebrook(Re, 0.0), "")
result("e_z", e_z, "J/kg")
result("P", rho * Q * e_c, "W")
result("P_p", rho * Q * e_c / 0.49, "W")

D2, eta2, rel = 0.3, 1.138e-3, 0.26e-3 / 0.3
S2 = pi * D2**2 / 4
w_A = 0.4 / S2
lam_A = colebrook(rho * w_A * D2 / eta2, rel)
w_B = w_A * sqrt(1000 / 3000)
for _ in range(200):
    lam_B = colebrook(rho * w_B * D2 / eta2, rel)
    w_B = w_A * sqrt(lam_A * 1000 / (lam_B * 3000))
result("Q_B_0", w_A * sqrt(1000 / 3000) * S2, "m^3/s")
result("λ_A", lam_A, "")
result("λ_B", lam_B, "")
result("Q_B", w_B * S2, "m^3/s")
result("Δp", lam_A * 1000 / D2 * rho * w_A**2 / 2 / 1000, "kPa")
```
