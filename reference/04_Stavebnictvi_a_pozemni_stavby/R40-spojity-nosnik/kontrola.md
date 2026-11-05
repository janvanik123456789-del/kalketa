# Kontrola v Pythonu

Výpočet listu znovu a jinou cestou: moment nad podporou z rovnice tří momentů, reakce z rovnováhy polí, průhyb integrací křivosti po krocích. Funkci beam tu nic nepoužívá. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu.

```python
# Everything from first principles: the three-moment equation, then equilibrium, then the deflection by integrating the curvature.
from math import pi

L1, L2 = 6.0, 4.5
L = L1 + L2
q, F, a = 12e3, 30e3, 3.0
E = 210e9
h, b, tw, tf, r = 0.300, 0.150, 0.0071, 0.0107, 0.015

# Section: two rectangles, four fillets by their own area, centroid and inertia.
web = h - 2 * tf
fillet = (1 - pi / 4) * r ** 2
own = r ** 4 * (1 / 3 - pi / 16 - 1 / (9 * (4 - pi)))
arm = web / 2 - r * (10 - 3 * pi) / (12 - 3 * pi)
I = (b * h ** 3 - (b - tw) * web ** 3) / 12 + 4 * (own + fillet * arm ** 2)
W = I / (h / 2)

# Three-moment equation with zero moments at the end supports.
S = q * L1 ** 3 / 4 + q * L2 ** 3 / 4 + F * a * (L1 ** 2 - a ** 2) / L1
M_B = -S / (2 * (L1 + L2))
R_A = q * L1 / 2 + F * (L1 - a) / L1 + M_B / L1
R_C = q * L2 / 2 + M_B / L2
R_B = q * L + F - R_A - R_C


def moment(x):
    if x <= L1:
        return R_A * x - q * x ** 2 / 2 - (F * (x - a) if x > a else 0.0)
    s = L - x
    return R_C * s - q * s ** 2 / 2


n = 21000                     # steps; 2000 a metre, so a and L1 fall on nodes
dx = L / n
xs = [i * dx for i in range(n + 1)]
M_max = max(moment(x) for x in xs)
M_min = min(moment(x) for x in xs)
V_max = max(abs(R_A), abs(R_A - q * a - F), abs(R_B + R_A - q * L1 - F), abs(R_C))
V_max = max(V_max, abs(R_A - q * L1 - F))

# Deflection downwards, EI·w'' = -M, zero at the supports: each span by itself.
def deflections(start, end):
    m = round((end - start) / dx)
    slope, w, out = 0.0, 0.0, [0.0]
    for i in range(m):
        x = start + i * dx
        k0, k1 = -moment(x + 1e-9) / (E * I), -moment(x + dx - 1e-9) / (E * I)
        w += slope * dx + (2 * k0 + k1) * dx ** 2 / 6
        slope += (k0 + k1) * dx / 2
        out.append(w)
    return [v - out[-1] * j / m for j, v in enumerate(out)]


w_max = max(max(deflections(0.0, L1)), max(deflections(L1, L)))
sigma = max(abs(M_max), abs(M_min)) / W

print("I =", round(I * 1e8, 1), "cm4 (tables 8356), W =", round(W * 1e6, 1), "cm3 (tables 557)")
result("R_A", R_A / 1e3, "kN")
result("R_B", R_B / 1e3, "kN")
result("R_C", R_C / 1e3, "kN")
result("M_max", M_max / 1e3, "kN·m")
result("M_min", M_min / 1e3, "kN·m")
result("V_max", V_max / 1e3, "kN")
result("w_max", w_max * 1e3, "mm")
result("M_B", M_B / 1e3, "kN·m")
result("σ", sigma / 1e6, "MPa")
```
