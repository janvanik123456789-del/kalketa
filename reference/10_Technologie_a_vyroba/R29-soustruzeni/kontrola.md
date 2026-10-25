# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
from math import pi, floor, ceil
D, l, l_n, n_s, f = 72, 138, 5, 350, 0.18
for name, v, T, z in (("RO", 45, 60, 1), ("SK", 155, 45, 4)):
    n = 1000 * v / (pi * D)
    t_m = (l + l_n) / (n * f)
    p = floor(z * T / t_m)
    k = ceil(n_s / p)
    print(name, round(n), "1/min,", round(t_m, 3), "min,", p, "parts per tool,", k, "tools,", k - 1, "changes")
result("n", n, "min⁻¹")
result("L", l + l_n, "mm")
result("t_m", t_m, "min")
result("t_s", n_s * t_m / 60, "h")
result("p", p, "")
result("k", k, "")
result("k_v", k - 1, "")
```
