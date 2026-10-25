# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Jiná cesta k týmž výsledkům: vlastní čísla matice M⁻¹·K z charakteristické rovnice, tvary z prvního řádku, pohyb simulovaný krok po kroku (Rungeova–Kuttova metoda) a porovnaný s rozkladem do tvarů.

```python
from math import pi, sqrt, cos

m1, m2, k1, k2, k3 = 9.0, 1.0, 38.0, 2.0, 3.0
# Characteristic equation m1 m2 Ω² − (m1 (k2+k3) + m2 (k1+k2)) Ω + (k1+k2)(k2+k3) − k2² = 0
a = m1 * m2
b = -(m1 * (k2 + k3) + m2 * (k1 + k2))
c = (k1 + k2) * (k2 + k3) - k2**2
d = sqrt(b * b - 4 * a * c)
O1, O2 = (-b - d) / (2 * a), (-b + d) / (2 * a)
w1, w2 = sqrt(O1), sqrt(O2)
r1 = (k1 + k2 - m1 * O1) / k2
r2 = (k1 + k2 - m1 * O2) / k2

# Free vibration from y = [1, 0], simulated with RK4 and compared with the sum of the modes at t = 7 s.
def acc(y):
    return [(-(k1 + k2) * y[0] + k2 * y[1]) / m1, (k2 * y[0] - (k2 + k3) * y[1]) / m2]

y, v, dt, t = [1.0, 0.0], [0.0, 0.0], 0.0005, 0.0
while t < 7.0 - 1e-12:
    def f(state):
        yy, vv = state
        return [vv, acc(yy)]
    s0 = [y, v]
    k_1 = f(s0)
    k_2 = f([[y[i] + dt / 2 * k_1[0][i] for i in range(2)], [v[i] + dt / 2 * k_1[1][i] for i in range(2)]])
    k_3 = f([[y[i] + dt / 2 * k_2[0][i] for i in range(2)], [v[i] + dt / 2 * k_2[1][i] for i in range(2)]])
    k_4 = f([[y[i] + dt * k_3[0][i] for i in range(2)], [v[i] + dt * k_3[1][i] for i in range(2)]])
    y = [y[i] + dt / 6 * (k_1[0][i] + 2 * k_2[0][i] + 2 * k_3[0][i] + k_4[0][i]) for i in range(2)]
    v = [v[i] + dt / 6 * (k_1[1][i] + 2 * k_2[1][i] + 2 * k_3[1][i] + k_4[1][i]) for i in range(2)]
    t += dt
C1, C2 = 9 / 13, 4 / 13
modes = C1 * cos(w1 * 7) + C2 * cos(w2 * 7)
print("y1(7 s): simulation", round(y[0], 9), "modes", round(modes, 9))

result("ω_1", w1, "rad/s")
result("ω_2", w2, "rad/s")
result("f_1", w1 / (2 * pi), "Hz")
result("f_2", w2 / (2 * pi), "Hz")
result("r_1", r1, "")
result("r_2", r2, "")
result("T_r", 2 * pi / (w2 - w1), "s")
```
