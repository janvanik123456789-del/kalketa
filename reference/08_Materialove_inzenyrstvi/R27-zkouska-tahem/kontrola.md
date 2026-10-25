# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
from math import pi, sqrt
d0, F02, Fm, Fu, du, E = 9.95, 17.21e3, 25.75e3, 17.39e3, 5.28, 210e3
S0 = pi * d0**2 / 4
Su = pi * du**2 / 4
Rp, Rm = F02 / S0, Fm / S0
A565 = (68.5 - 50) / 50
result("S_0", S0, "mm²")
result("R_p02", Rp, "MPa")
result("R_m", Rm, "MPa")
result("Z", (S0 - Su) / S0 * 100, "%")
result("A_565", A565 * 100, "%")
result("A_100", (128 - 100) / 100 * 100, "%")
result("σ_u", Fu / Su, "MPa")
result("U_r", Rp**2 / (2 * E), "MJ/m³")
result("U_t", (Rp + Rm) / 2 * A565, "MJ/m³")
result("n_z", Rm / Rp, "")
```
