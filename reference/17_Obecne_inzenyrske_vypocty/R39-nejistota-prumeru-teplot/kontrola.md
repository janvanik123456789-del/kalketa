# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
from math import sqrt
import statistics
t = [18.75, 28.25, 25.75, 28.00, 28.50, 20.75, 21.00, 22.75, 18.50, 27.25, 20.75,
     26.50, 28.00, 23.25, 28.00, 21.75, 26.00, 26.50, 28.00, 33.25, 32.00, 29.50]
m = len(t)
avg = statistics.mean(t)
s = statistics.stdev(t)
u = s / sqrt(m)
# Studentův kvantil t(0,975; 21) z tabulek, ověřeno SciPy: 2,0796
k = 2.07961384472768
U = k * u
print("průměr =", round(avg, 4), "°C, s =", round(s, 4), "K, u =", round(u, 4), "K, k =", round(k, 4))
print("95% interval:", round(avg - U, 3), "°C až", round(avg + U, 3), "°C")
result("m", m, "")
result("t_avg", avg, "°C")
result("s", s, "Δ°C")
result("u", u, "Δ°C")
result("k", k, "")
result("U", U, "Δ°C")
result("t_low", avg - U, "°C")
result("t_high", avg + U, "°C")
```
