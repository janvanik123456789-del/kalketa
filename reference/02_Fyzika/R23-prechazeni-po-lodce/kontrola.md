# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Jiná cesta k témuž výsledku: člověk jde s proměnnou rychlostí vůči loďce (rozběhne se, zpomalí, chvíli stojí), a z rovnosti hybností se krok po kroku počítá rychlost loďky. Posun loďky na konci musí vyjít stejně jako ze vzorce, bez ohledu na průběh chůze.

```python
from math import sin, pi

m, M, L = 70.0, 100.0, 2.5

# The man's speed relative to the boat (towards the bow, negative x): a profile with a stop in the middle,
# scaled so that he walks exactly the length of the boat.
T, n = 6.0, 60000
dt = T / n
def shape(t):
    return sin(pi * t / T) ** 2 * (0.2 if 2.5 < t < 3.5 else 1.0)
total = sum(shape((i + 0.5) * dt) for i in range(n)) * dt
x_boat, x_man_rel = 0.0, 0.0
for i in range(n):
    u = -L / total * shape((i + 0.5) * dt)      # speed of the man relative to the boat
    # Momentum stays zero: M·v + m·(v + u) = 0
    v = -m * u / (M + m)
    x_boat += v * dt
    x_man_rel += u * dt
print("the man walked", round(-x_man_rel, 6), "m on the boat; the boat moved", round(x_boat, 6), "m")

x = m * L / (M + m)
result("x", x_boat, "m", rel=1e-6)
result("x_T1", (M * L / 2 + m * L) / (M + m), "m")
result("s_c", L - x_boat, "m", rel=1e-6)
```
