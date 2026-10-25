# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
Kc, Tc = 0.43, 21 / 4
rules = {"P": (0.50, 0, 0), "PI": (0.45, 0.54, 0), "PD": (0.80, 0, 0.075), "PID": (0.59, 1.18, 0.075)}
for name, (a_p, a_i, a_d) in rules.items():
    print(name, round(a_p * Kc, 4), round(a_i * Kc / Tc, 4), round(a_d * Kc * Tc, 4))
a_p, a_i, a_d = rules["PID"]
result("T_c", Tc, "s")
result("K_p", a_p * Kc, "")
result("K_i", a_i * Kc / Tc, "s⁻¹")
result("K_d", a_d * Kc * Tc, "s")
```
