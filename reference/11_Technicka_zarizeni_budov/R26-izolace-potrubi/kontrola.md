# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Celý výpočet pro všech pět tlouštěk, nezávisle na listu. Výsledky zvolené varianty (50 mm) porovná Kalketa s listem.

```python
from math import pi, log
d, s_t, lam_t, lam_iz, alpha = 0.0483, 0.00325, 50.0, 0.038, 10.0
t_m = (75 - 20) * (3.7 + 13) / (20 + 13) + 20
C_ts = 400 / 277.7777777777778 * ((1 + 0.08 - 0.03) ** 2 - 1) / (2 * (0.08 - 0.03))
prices = {20: 79, 25: 86, 30: 95, 40: 106, 50: 118}
source = {20: 282.30, 25: 263.90, 30: 254.70, 40: 241.20, 50: 237.50}
totals = {}
for s, C_iz in prices.items():
    D = d + 2 * s / 1000
    U_o = pi / (log(d / (d - 2 * s_t)) / (2 * lam_t) + log(D / d) / (2 * lam_iz) + 1 / (alpha * D))
    q = U_o * (t_m - 10)
    N_p = q * C_ts * 24 * 219 * 2 / 1000
    totals[s] = N_p + C_iz
    print(s, "mm:", round(totals[s], 2), "Kč/m, the source", source[s])
print("cheapest:", min(totals, key=totals.get), "mm")

result("t_m", t_m, "°C")
result("C_ts", C_ts, "Kč/kWh")
result("U_o", U_o, "W/(m·K)")
result("q", q, "W/m")
result("N_p", N_p, "Kč/m")
result("N", N_p + C_iz, "Kč/m")
```
