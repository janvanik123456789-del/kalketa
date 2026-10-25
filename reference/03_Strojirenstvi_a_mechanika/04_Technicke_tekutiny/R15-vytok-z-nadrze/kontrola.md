# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Jiná cesta k týmž výsledkům: místo integrálu simulace vyprazdňování krok po kroku (Rungeova–Kuttova metoda 4. řádu), rychlost dopadu ze zachování energie. Tlačítko pod skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu.

```python
from math import pi, sqrt

g, r, h_1, h_2, S_2 = 9.81, 0.9, 3.0, 6.0, 6.3e-4
S_1 = pi * r**2

# Pokles hladiny: dh/dt = -S_2/S_1 * sqrt(2 g h), krok 0,02 s až do prázdné nádrže.
def rate(h):
    return -S_2 / S_1 * sqrt(2 * g * max(h, 0.0))

t, h, dt, t_pol = 0.0, h_1, 0.02, None
while h > 0:
    k1 = rate(h)
    k2 = rate(h + dt / 2 * k1)
    k3 = rate(h + dt / 2 * k2)
    k4 = rate(h + dt * k3)
    step = dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    if t_pol is None and h + step <= h_1 / 2:
        t_pol = t + dt * (h - h_1 / 2) / (-step)
    if h + step <= 0:
        t += dt * h / (-step)
        break
    h += step
    t += dt

result("v_A", sqrt(2 * g * (h_1 + h_2)), "m/s")
result("S_1", S_1, "m^2")
result("t_v", t / 60, "min", rel=1e-4)
result("t_pol", t_pol, "s", rel=1e-4)
```
