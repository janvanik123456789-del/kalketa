# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Let rakety simulovaný krok po kroku z Meščerského rovnice (Rungeova–Kuttova metoda 4. řádu), nezávisle na Ciolkovského vzorci. Výsledky postaví vedle hodnot listu.

```python
from math import log

g, M_r, M_p, v_R, n = 9.81, 2000.0, 12000.0, 5000 / 3.6, 7
q = (n + 1) * g * M_r / v_R          # největší spotřeba: zrychlení n·g na konci hoření
tau = M_p / q

def a(t):                            # zrychlení rakety v čase t
    return v_R * q / (M_r + M_p - q * t) - g

N = 20000
dt = tau / N
v = h = t = 0.0
for _ in range(N):
    k1v, k1h = a(t), v
    k2v, k2h = a(t + dt / 2), v + dt / 2 * k1v
    k3v, k3h = a(t + dt / 2), v + dt / 2 * k2v
    k4v, k4h = a(t + dt), v + dt * k3v
    v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    h += dt / 6 * (k1h + 2 * k2h + 2 * k3h + k4h)
    t += dt

result("q_max", q, "kg/s")
result("τ", tau, "s")
result("v_max", v * 3.6, "km/h", rel=1e-6)
result("h_k", h / 1000, "km", rel=1e-6)
result("F_t", q * v_R / 1000, "kN")
```
