# Check in Python

The calculation of the sheet again, by another way: the moments by numerical integration over both distributions, the sensitivities by finite differences. The simulation itself depends on the generator of random numbers, so it is not repeated here; the checks of the sheet verify it against these exact values. The button above the script runs it in the built-in Python and puts the results beside the values of the sheet.

```python
# The deterministic parts by another way: the moments by numerical integration over both distributions,
# the linear estimate by finite differences. The simulation itself depends on the generator, so it is
# checked by the checks of the sheet against these exact values, not here.
from math import exp, log, pi, sqrt

U0, uU, R0, aR = 230.0, 3.0, 52.0, 2.0


def normal_mean(g, steps=4000):
    # E[g(U)] for U ~ N(U0, uU²) by the midpoint rule over ±8 σ.
    lo, h = U0 - 8 * uU, 16 * uU / steps
    total = 0.0
    for i in range(steps):
        u = lo + (i + 0.5) * h
        total += g(u) * exp(-((u - U0) / uU) ** 2 / 2) * h
    return total / (uU * sqrt(2 * pi))


def uniform_mean(g, steps=4000):
    lo, h = R0 - aR, 2 * aR / steps
    return sum(g(lo + (i + 0.5) * h) for i in range(steps)) * h / (2 * aR)


EU2 = normal_mean(lambda u: u * u)
EU4 = normal_mean(lambda u: u ** 4)
ER1 = uniform_mean(lambda r: 1 / r)
ER2 = uniform_mean(lambda r: 1 / r ** 2)
Pe = EU2 * ER1
ue = sqrt(EU4 * ER2 - Pe ** 2)

P = lambda u, r: u * u / r
d = 1e-3
cU = (P(U0 + d, R0) - P(U0 - d, R0)) / (2 * d)
cR = (P(U0, R0 + d) - P(U0, R0 - d)) / (2 * d)
uR = aR / sqrt(3)
uP = sqrt((cU * uU) ** 2 + (cR * uR) ** 2)

print("E[P] =", round(Pe, 3), "W, u =", round(ue, 3), "W, GUM", round(uP, 3), "W")
result("P_0", P(U0, R0), "W")
result("u_R", uR, "Ω")
result("c_U", cU, "W/V")
result("c_R", cR, "W/Ω")
result("u_P", uP, "W")
result("E_U2", EU2, "V²")
result("E_R1", ER1, "1/Ω")
result("P_e", Pe, "W")
result("u_e", ue, "W")
```
