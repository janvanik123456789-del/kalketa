# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Jiná cesta k průhybu: moment po délce, křivost M/(E·I) a dvojí numerická integrace s nulovým průhybem na konzolách, bez vzorce 5/384. Nejtenčí prkno pak hledá půlením intervalu.

```python
m_k, g, L, b, t = 30.0, 9.81, 0.8, 0.25, 0.018
rho, f_mk, E = 420.0, 24e6, 11e9
k_mod, gamma_M, k_def = 0.6, 1.3, 0.6

q_k = (m_k + rho * b * t) * g
q_d = 1.35 * q_k
M_d = q_d * L**2 / 8
sigma = M_d / (b * t**2 / 6)

def deflection(thickness, n=4000):
    # Curvature −M/(E·I), integrated twice by the trapezoidal rule; then the straight line making w(0) = w(L) = 0.
    I = b * thickness**3 / 12
    dx = L / n
    xs = [i * dx for i in range(n + 1)]
    kappa = [-(q_k * x * (L - x) / 2) / (E * I) for x in xs]
    slope, w = [0.0], [0.0]
    for i in range(n):
        slope.append(slope[-1] + (kappa[i] + kappa[i + 1]) / 2 * dx)
    for i in range(n):
        w.append(w[-1] + (slope[i] + slope[i + 1]) / 2 * dx)
    w = [wi - w[-1] * x / L for wi, x in zip(w, xs)]
    return (1 + k_def) * max(abs(wi) for wi in w)

w_lim = L / 300
low, high = 0.005, 0.05
for _ in range(80):
    mid = (low + high) / 2
    low, high = (mid, high) if deflection(mid) > w_lim else (low, mid)

print("bending", round(sigma / (k_mod * f_mk / gamma_M) * 100, 1), "% of strength; deflection", round(deflection(t) / w_lim * 100, 1), "% of the limit")
result("M_d", M_d, "N·m")
result("σ_m", sigma / 1e6, "MPa")
result("w", deflection(t) * 1000, "mm", rel=1e-5)
result("t_min", high * 1000, "mm", rel=1e-5)
```
