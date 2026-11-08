# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and puts the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

Another way to the same results: the friction factor by fixed-point iteration of the Colebrook equation beside the Swamee–Jain relation, the operating point by bisection (without the formula for the intersection), the energy from the work against gravity instead of from the power, and the level in the tower by a time simulation in one-second steps.

```python
from math import pi, sqrt, log10, ceil

g, rho, nu = 9.81, 1000.0, 1.1e-6
d, k, Q_n = 0.080, 1.0e-4, 0.010
L = 6.0 + 95.0
sum_zeta = 4 * 0.9 + 3.0 + 2.0 + 0.2 + 1.0

# 1. pipe: velocity, Reynolds number, friction factor by two relations
S = pi * d**2 / 4
v = Q_n / S
Re = v * d / nu
lam_SJ = 0.25 / log10(k / (3.7 * d) + 5.74 / Re**0.9) ** 2
lam_C = 0.02
for _ in range(200):                     # Colebrook: fixed-point iteration
    lam_C = (-2 * log10(k / (3.7 * d) + 2.51 / (Re * sqrt(lam_C)))) ** -2
h_f = lam_SJ * L / d * v**2 / (2 * g)
h_l = sum_zeta * v**2 / (2 * g)
h_z = h_f + h_l
K = h_z / Q_n**2

# 2. operating point: bisection on the difference of the characteristics
H_g = 3 + 22 + 4
a = (46 - 36) / 0.012**2
f = lambda Q: (46 - a * Q**2) - (H_g + K * Q**2)
lo, hi = 0.0, 0.012
for _ in range(100):
    mid = (lo + hi) / 2
    if f(lo) * f(mid) <= 0:
        hi = mid
    else:
        lo = mid
Q_b = (lo + hi) / 2
H_b = 46 - a * Q_b**2

# 3. energy from the work against gravity (no power): E = rho g V H / (eta_c eta_m)
eta = 0.70 * 0.90
V_d = 100.0
E_work = rho * g * V_d * H_b / eta / 3.6e6          # kWh
P_hyd = rho * g * Q_b * H_b
P_el = P_hyd / eta
t_c = V_d / Q_b / 3600                              # h
N_d = E_work * 5.5

# 4. tower: simulation of the level in one-second steps
D, h_min, h_max = 6.0, 1.0, 4.0
S_n = pi * D**2 / 4
q_p, q_v = 1.2e-3, 4.0e-3
def cas(h0, h1, rate):
    """Time for the level to go from h0 to h1; the last step is shortened to reach the limit exactly."""
    h, t = h0, 0.0
    while (h1 - h) * (1 if rate > 0 else -1) > 0:
        step = min(1.0, (h1 - h) / rate)
        h += rate * step
        t += step
    return t / 3600

t_n = cas(h_min, h_max, (Q_b - q_p) / S_n)
t_v = cas(h_max, h_min, -q_v / S_n)
V_u = S_n * (h_max - h_min)

print("lambda SJ", round(lam_SJ, 5), "Colebrook", round(lam_C, 5))
print("Q_b", round(Q_b * 1000, 3), "l/s  H_b", round(H_b, 2), "m")
print("E from power", round(P_el * t_c / 1000, 3), "kWh, from work", round(E_work, 3), "kWh")

result("v", v, "m/s")
result("Re", Re, "")
result("λ", lam_SJ, "")
result("λ_C", lam_C, "")
result("h_f", h_f, "m")
result("h_z", h_z, "m")
result("K_z", K, "s^2/m^5")
result("Q_b", Q_b * 1000, "L/s")
result("H_b", H_b, "m")
result("P_hyd", P_hyd / 1000, "kW")
result("P_el", P_el / 1000, "kW")
result("t_c", t_c, "h")
result("E_d", E_work, "kWh")
result("N_d", N_d, "CZK")
result("V_u", V_u, "m^3")
result("t_n", t_n, "h")
result("t_v", t_v, "h")
result("n_p", V_d / V_u, "")
```
