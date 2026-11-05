# Kontrola v Pythonu

Výpočet listu znovu a jinou cestou: soustava se integruje vlastní metodou Rungeho a Kutty s pevným krokem, přesné řešení tu není. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu.

```python
# The system step by step (Runge-Kutta of the fourth order), nothing from the exact solution.
from math import log

k1, k2 = 0.002, 0.001
a0, b0 = 1.0, 0.0        # mol/l
t_end = 3600.0


def rates(a, b):
    r = -k1 * a + k2 * b
    return r, -r


def integrate(until, step=0.5):
    a, b = a0, b0
    n = round(until / step)
    h = until / n
    for _ in range(n):
        p1, q1 = rates(a, b)
        p2, q2 = rates(a + h * p1 / 2, b + h * q1 / 2)
        p3, q3 = rates(a + h * p2 / 2, b + h * q2 / 2)
        p4, q4 = rates(a + h * p3, b + h * q3)
        a += h * (p1 + 2 * p2 + 2 * p3 + p4) / 6
        b += h * (q1 + 2 * q2 + 2 * q3 + q4) / 6
    return a, b


a_600, b_600 = integrate(600.0)
a_e, b_e = integrate(t_end)
tau = 1 / (k1 + k2)
t_90 = tau * log(10)
a_90, _ = integrate(t_90)
a_r = a0 * k2 / (k1 + k2)
b_r = a0 * k1 / (k1 + k2)

print("a(600 s) =", round(a_600, 5), "mol/l, equilibrium", round(a_r, 5), ":", round(b_r, 5))
result("a_600", a_600, "mol/l")
result("b_600", b_600, "mol/l")
result("a_e", a_e, "mol/l")
result("b_e", b_e, "mol/l")
result("K", k1 / k2, "")
result("a_r", a_r, "mol/l")
result("b_r", b_r, "mol/l")
result("τ", tau, "s")
result("t_90", t_90, "s")
result("a_90", a_90, "mol/l")
```
