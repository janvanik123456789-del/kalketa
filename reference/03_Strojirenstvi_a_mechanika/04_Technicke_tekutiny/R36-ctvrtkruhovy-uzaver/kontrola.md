# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu, v uzavřeném tvaru. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

```python
R, rho_F, rho_S, g, G = 1.0, 997.0, 1025.0, 9.81, 30e3
# Momenty ke kloubu D na metr šířky: slaná voda (vodorovná složka na rameni R), tíha, říční voda.
M_S = R * rho_S * g * R**2 / 2
M_G = G * R / 3
M_F = lambda t: rho_F * g * (t * R**2 / 2 + R**3 / 3)
F_A = lambda t: (M_S + M_G - M_F(t)) / R
# Hloubka otevření: moment řeky = moment slané vody a tíhy.
t0 = (M_S + M_G - rho_F * g * R**3 / 3) / (rho_F * g * R**2 / 2)
result("M_S", M_S / 1e3, "kN·m/m")
result("M_G", M_G / 1e3, "kN·m/m")
result("F_A0", F_A(0) / 1e3, "kN/m")
result("F_A1", F_A(1) / 1e3, "kN/m")
result("t_0", t0, "m")
```
