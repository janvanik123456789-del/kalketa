# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Celý výpočet znovu, místnost po místnosti, z hodnot zdroje (tabulky 1 až 4 článku):

```python
rooms = [  # V, t_int, n_min, supply, exhaust, transfer, envelope area
    (97.2, 20, 0.5, 55, 40, 0, 120.7), (5.7, 20, 0, 0, 25, 25, 5.0), (22.7, 20, 0.5, 0, 10, 10, 26.3),
    (32.4, 20, 0.5, 40, 0, 0, 35.1), (34.6, 20, 0.5, 20, 0, 0, 51.4), (34.0, 20, 0.5, 20, 0, 0, 43.9),
    (24.8, 24, 0.5, 0, 50, 50, 28.8), (13.2, 20, 0.5, 0, 10, 10, 16.3), (8.4, 20, 0, 0, 0, 0, 11.3),
    (25.4, 20, 0, 0, 0, 0, 21.3),
]
te, ti, rc = -15.0, 20.0, 1.2 * 0.28
A_env, V50, f_qv, f_e, f_dir, eta = 359.9, 1.33, 0.03, 1.0, 2.0, 0.8
V_inf = V50 * A_env * f_qv * f_e
V_env = max(135 - 135, 0) + V_inf
t_rec = te + eta * (ti - te)
Q_env = Q_sup = Q_tr = 0.0
for V, t, n, sup, exh, tr, a in rooms:
    v_env = min(V_env, f_dir * V_inf * a / A_env)
    v_tech = max(sup + tr, exh)
    Q_env += max(v_env, n * V - v_tech) * rc * (t - te)
    Q_sup += sup * rc * (t - t_rec)
    Q_tr += tr * rc * (t - 20)
print("envelope", round(Q_env), "W, supply", round(Q_sup), "W, transfer", round(Q_tr), "W; the source: 341, 318, 67, 725 W")

result("V_inf", V_inf, "m³/h")
result("t_rec", t_rec, "°C")
result("Q_env", Q_env, "W")
result("Q_sup", Q_sup, "W")
result("Q_tr", Q_tr, "W")
result("Q_V", Q_env + Q_sup + Q_tr, "W")
```
