# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
from math import log, pi
m_c, c_c, m_h, c_h = 1.2, 4189.0, 2.0, 4342.0
Q = m_c * c_c * (80 - 20)
t_h2 = 160 - Q / (m_h * c_h)
for name, t_cA, t_cB in (("counterflow", 80, 20), ("parallel flow", 20, 80)):
    dA, dB = 160 - t_cA, t_h2 - t_cB
    lm = (dA - dB) / log(dA / dB)
    A = Q / (640 * lm)
    print(name, round(lm, 2), "K", round(A, 3), "m2", round(A / (pi * 0.015), 1), "m")
dA, dB = 80, t_h2 - 20
lm = (dA - dB) / log(dA / dB)
result("Q", Q / 1000, "kW")
result("t_h2", t_h2, "°C")
result("ΔT_ln", lm, "K")
result("A", Q / (640 * lm), "m²")
result("L", Q / (640 * lm) / (pi * 0.015), "m")
```
