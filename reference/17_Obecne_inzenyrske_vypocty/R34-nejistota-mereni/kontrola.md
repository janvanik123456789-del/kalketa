# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
from math import sqrt, pi
t = [18.60, 18.55, 18.60, 18.70, 18.65]
n = len(t)
mean = sum(t) / n
s = sqrt(sum((x - mean) ** 2 for x in t) / (n - 1))
u_A = s / sqrt(n) / 8
u_B = 0.3 / (8 * sqrt(3))
d = 0.81
S = pi * d ** 2 / 4
u_rS = 2 * (0.01 / sqrt(3)) / d
print("T =", round(mean / 8, 4), "s, u =", round(sqrt(u_A ** 2 + u_B ** 2), 4), "s; S =", round(S, 4), "mm², u_r =", round(u_rS * 100, 2), "%")
result("T_k", mean / 8, "s")
result("u_A", u_A, "s")
result("u_B", u_B, "s")
result("u_c", sqrt(u_A ** 2 + u_B ** 2), "s")
result("S_d", S, "mm²")
result("u_rS", u_rS * 100, "%")
result("u_S", S * u_rS, "mm²")
```
