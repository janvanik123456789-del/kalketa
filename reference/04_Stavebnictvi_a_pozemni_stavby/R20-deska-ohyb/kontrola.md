# Kontrola v Pythonu

Výpočet listu znovu a nezávisle, v Pythonu. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu: shodují-li se, je list spočítaný správně.

Jiná cesta k týmž výsledkům: vlastní výpočet bez tabulek (rameno ζ z kvadratické rovnice, ne z přílohy P04) a posudky čistou aritmetikou.

```python
from math import pi, sqrt

h, c, fi = 0.200, 0.025, 0.012
m_Ed = 40e3                       # N·m na metr šířky
f_ck, f_ctm, f_yk = 30e6, 2.9e6, 500e6
E_s, eps_cu = 200e9, 0.0035

f_cd = min((40e6 / f_ck) ** (1 / 3), 1.0) * 1.0 * f_ck / 1.5
f_yd = f_yk / 1.15
d = h - c - fi / 2

a1 = m_Ed / (0.9 * d * f_yd)
mu = m_Ed / (d**2 * f_cd)
xi = (1 - sqrt(1 - 2 * mu)) / 0.8        # x/d z rovnováhy
zeta = 1 - 0.4 * xi
a3 = d * f_cd / f_yd * (1 - sqrt(1 - 2 * mu))
a_prov = pi * fi**2 / 4 / 0.150
x = a_prov * f_yd / (0.8 * f_cd)
m_Rd = a_prov * f_yd * (d - 0.4 * x)
m_cr = h**2 * f_ctm / 6
xi_bal = eps_cu / (eps_cu + f_yd / E_s)

result("f_cd", f_cd / 1e6, "MPa")
result("d", d * 1e3, "mm")
result("a_s_req", a1 * 1e6, "mm^2/m")
result("μ", mu, "")
result("a_s_req_2", m_Ed / (zeta * d * f_yd) * 1e6, "mm^2/m", rel=2e-3)
result("a_s_req_3", a3 * 1e6, "mm^2/m")
result("a_s_prov", a_prov * 1e6, "mm^2/m")
result("x", x * 1e3, "mm")
result("m_Rd", m_Rd / 1e3, "kN·m/m")
result("m_cr", m_cr / 1e3, "kN·m/m")
result("ξ_bal", xi_bal, "")
result("a_s_rv", pi * 0.006**2 / 4 / 0.200 * 1e6, "mm^2/m")
```
