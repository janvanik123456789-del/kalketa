# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Lomená čára a model B spočtené nezávisle na Kalketě (spline a pchip ověřuje test jádra proti SciPy).

```python
from math import exp, log

T = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
R = [33.62, 20.17, 12.54, 8.037, 5.301, 3.588, 2.486, 1.76, 1.27, 0.9336, 0.6975]
T_1 = 37.0

i = max(k for k in range(len(T) - 1) if T[k] <= T_1)
R_lin = R[i] + (R[i + 1] - R[i]) * (T_1 - T[i]) / (T[i + 1] - T[i])

K = lambda t: t + 273.15
B_0100 = log(R[0] / R[-1]) / (1 / K(T[0]) - 1 / K(T[-1]))
R_B = R[0] * exp(B_0100 * (1 / K(T_1) - 1 / K(T[0])))
R_1 = 10 * exp(3950 * (1 / K(T_1) - 1 / K(25)))

result("R_lin", R_lin, "kΩ")
result("B_0100", B_0100, "K")
result("R_B", R_B, "kΩ")
result("R_1", R_1, "kΩ")
result("δ_1", (R_lin / R_1 - 1) * 100, "%")
```
