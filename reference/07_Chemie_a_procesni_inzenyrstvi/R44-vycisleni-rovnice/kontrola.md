# Kontrola v Pythonu

Výpočet listu znovu a jinou cestou: nulový prostor matice prvků Gaussovou-Jordanovou eliminací v přesných zlomcích, molární hmotnosti součtem atomových hmotností. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu.

```python
# The null space by exact fractions (Gauss-Jordan), the molar masses from atomic weights, nothing from the sheet.
from fractions import Fraction
from math import gcd

formulas = [{"K": 1, "Mn": 1, "O": 4}, {"H": 1, "Cl": 1}, {"K": 1, "Cl": 1}, {"Mn": 1, "Cl": 2}, {"Cl": 2}, {"H": 2, "O": 1}]
sides = [1, 1, -1, -1, -1, -1]
elements = ["K", "Mn", "O", "H", "Cl"]
rows = [[Fraction(s * f.get(e, 0)) for f, s in zip(formulas, sides)] for e in elements]

# Reduced row echelon form.
pivots, r = [], 0
for col in range(6):
    pick = next((i for i in range(r, len(rows)) if rows[i][col] != 0), None)
    if pick is None:
        continue
    rows[r], rows[pick] = rows[pick], rows[r]
    rows[r] = [x / rows[r][col] for x in rows[r]]
    for i in range(len(rows)):
        if i != r and rows[i][col] != 0:
            rows[i] = [a - rows[i][col] * b for a, b in zip(rows[i], rows[r])]
    pivots.append(col)
    r += 1
free = [c for c in range(6) if c not in pivots]
assert len(free) == 1, free
x = [Fraction(0)] * 6
x[free[0]] = Fraction(1)
for i, col in enumerate(pivots):
    x[col] = -rows[i][free[0]]
lcm = 1
for v in x:
    lcm = lcm * v.denominator // gcd(lcm, v.denominator)
c = [int(v * lcm) for v in x]
g = 0
for v in c:
    g = gcd(g, v)
c = [v // g for v in c]

weights = {"K": 39.098, "Mn": 54.938, "O": 15.999, "H": 1.008, "Cl": 35.45}
M = [sum(weights[e] * k for e, k in f.items()) for f in formulas]
n1 = 10 / M[0]
n2 = n1 * c[1] / c[0]
n5 = n1 * c[4] / c[0]
V5 = n5 * 8.314462618 * 273.15 / 101325

print("coefficients", c)
result("h", len(pivots), "")
result("M_1", M[0], "g/mol")
result("M_5", M[4], "g/mol")
result("m_l", c[0] * M[0] + c[1] * M[1], "g/mol")
result("m_p", sum(ci * Mi for ci, Mi in zip(c[2:], M[2:])), "g/mol")
result("n_1", n1, "mol")
result("n_2", n2, "mol")
result("n_5", n5, "mol")
result("m_2", n2 * M[1], "g")
result("m_5", n5 * M[4], "g")
result("V_5", V5 * 1000, "l")
```
