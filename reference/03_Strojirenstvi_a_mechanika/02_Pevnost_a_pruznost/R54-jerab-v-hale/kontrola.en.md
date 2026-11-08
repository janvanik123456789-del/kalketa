# Check in Python

The calculation of the sheet again by another way, in plain Python without formulas from the theory. The force in the rope is taken from the equality of work, the worst position of the trolley and the truck is found by a simulation: the trolley is moved along the girder in small steps, the reactions are found from equilibrium and the moment is evaluated along the whole length. The section properties are put together from three rectangles (parallel axis theorem), buckling is solved as the exact root of the characteristic equation for a fixed base and a hinge. The button above the script runs it in the built-in Python and puts the results beside the values of the sheet.

```python
from math import pi, sqrt, cos, sin

g = 9.81

# --- 1. rope: energy. Lifting by 1 m winds n metres of rope onto the drum; work of the pull = work against gravity / efficiency
m, m_h, n, eta = 10000.0, 250.0, 4, 0.95
Q = (m + m_h) * g
work_load = Q * 1.0
S = work_load / eta / (n * 1.0)
sigma_dov = 1770e6 / 5.5
A = S / sigma_dov
psi_l = 0.5
# diameter by bisection from the metal area, not by a closed formula
lo, hi = 0.0, 0.2
for _ in range(100):
    mid = (lo + hi) / 2
    if psi_l * pi * mid**2 / 4 < A:
        lo = mid
    else:
        hi = mid
d = (lo + hi) / 2
sigma_l = S / (psi_l * pi * d**2 / 4)

# --- 2. main girder: simulation of the position of the trolley
L, a, e_k, q = 18.0, 1.6, 1.2, 2000.0
P = (1.2 * Q + 3200.0 * g) / 4


def moment_max(loads, span, q_line, step=0.005):
    """Largest moment of a simple beam from equilibrium: loads = [(position, force)]."""
    r_b = (sum(f * x for x, f in loads) + q_line * span**2 / 2) / span
    r_a = sum(f for _, f in loads) + q_line * span - r_b
    best = 0.0
    z = 0.0
    while z <= span + 1e-9:
        mz = r_a * z - q_line * z * z / 2 - sum(f * (z - x) for x, f in loads if x < z)
        best = max(best, mz)
        z += step
    return best, r_a, r_b


# wheels of the trolley: the first at x, the second a further; at least e_k from the support
best_total = 0.0
best_x = 0.0
x = e_k
while x <= L - a - e_k + 1e-9:
    mm, _, _ = moment_max([(x, P), (x + a, P)], L, q)
    if mm > best_total:
        best_total, best_x = mm, x
    x += 0.02
# moment from the wheels only (without self-weight) and from the self-weight only
best_wheels = 0.0
x = e_k
while x <= L - a - e_k + 1e-9:
    mm, _, _ = moment_max([(x, P), (x + a, P)], L, 0.0)
    best_wheels = max(best_wheels, mm)
    x += 0.02
M_q = moment_max([], L, q)[0]
M_P = best_wheels
M = M_P + M_q          # sum of the largest values as in the sheet
M_ex = best_total      # largest moment of both loads at once

# largest reaction: the trolley nearest to the support A
_, r_a_max, r_b_other = moment_max([(e_k, P), (e_k + a, P)], L, q)
R_max = r_a_max
R_B = r_b_other

# section from three rectangles (b, h, position of the lower edge from the bottom), axis through the centroid; mm
h_g, b_g, t_g, s_g = 550.0, 220.0, 18.0, 10.0
parts = [(b_g, t_g, 0.0), (s_g, h_g - 2 * t_g, t_g), (b_g, t_g, h_g - t_g)]
area = sum(b * h for b, h, _ in parts)
yc = sum(b * h * (y0 + h / 2) for b, h, y0 in parts) / area
I = sum(b * h**3 / 12 + b * h * (y0 + h / 2 - yc) ** 2 for b, h, y0 in parts)   # mm^4
W = I / max(yc, h_g - yc)                                                       # mm^3
f_d = 235.0 / 1.1
sigma = (M * 1e3) / W

# --- 3. runway beam: the same simulation
c, l_d, g_d = 2.4, 7.5, 1800.0
F_k = R_max
M_d = 0.0
x = 0.0
while x <= l_d - c + 1e-9:
    mm_w, _, _ = moment_max([(x, F_k), (x + c, F_k)], l_d, 0.0, 0.0025)
    M_d = max(M_d, mm_w)
    x += 0.01
M_d += moment_max([], l_d, g_d, 0.0025)[0]
M_dex = max(moment_max([(x_ / 100.0, F_k), (x_ / 100.0 + c, F_k)], l_d, g_d, 0.0025)[0] for x_ in range(0, int((l_d - c) * 100) + 1, 1))
# reaction: one wheel directly above the support A
_, R_d, R_dB = moment_max([(0.0, F_k), (c, F_k)], l_d, g_d, 0.5)
W_d = 1500e3  # mm^3
sigma_d = M_d * 1e3 / W_d

# --- 4. column
N = R_d + g_d * l_d / 2 + 60000.0
h_s, b_s, t_s, s_s = 170.0, 180.0, 10.0, 6.5
A_s = 2 * b_s * t_s + (h_s - 2 * t_s) * s_s
# second moment of area about the axis z from the sum of rectangles (flanges and web), the axis lies in the middle of the width
I_z = (t_s * b_s**3 + t_s * b_s**3 + (h_s - 2 * t_s) * s_s**3) / 12
i_z = sqrt(I_z / A_s)
H = 8000.0
E_s = 210e3  # MPa
L_cr = 0.7 * H
lam = L_cr / i_z
lam_p = pi * sqrt(E_s / 235.0)
N_cr = pi**2 * E_s * I_z / L_cr**2
n_s = N_cr / N
sigma_c = N / A_s
sigma_cr = N_cr / A_s

# exact buckling load of a column fixed at the base and hinged at the head: smallest root of tan(x) = x, N = x^2 E I / H^2
lo, hi = 4.0, 4.7
for _ in range(100):
    mid = (lo + hi) / 2
    if sin(mid) / cos(mid) - mid < 0:
        lo = mid
    else:
        hi = mid
x_root = (lo + hi) / 2
N_exact = x_root**2 * E_s * I_z / H**2
print("exact root of tan x = x:", x_root, " N_cr exact:", N_exact / 1e3, "kN; with mu = 0.7:", N_cr / 1e3, "kN; difference", (N_cr / N_exact - 1) * 100, "%")
print("worst position of the first wheel of the trolley:", best_x, "m (formula L/2 - a/4:", L / 2 - a / 4, "m)")
print("exact largest moment:", M_ex / 1e3, "kN·m; sum of the largest values:", M / 1e3, "kN·m")

result("Q", Q / 1e3, "kN")
result("S", S / 1e3, "kN")
result("σ_dov", sigma_dov / 1e6, "MPa")
result("A", A * 1e6, "mm²")
result("d", d * 1e3, "mm")
result("σ_l", sigma_l / 1e6, "MPa")
result("P", P / 1e3, "kN")
result("M_P", M_P / 1e3, "kN·m")
result("M_q", M_q / 1e3, "kN·m")
result("M", M / 1e3, "kN·m")
result("M_ex", M_ex / 1e3, "kN·m")
result("R_max", R_max / 1e3, "kN")
result("R_B", R_B / 1e3, "kN")
result("I_y", I / 1e4, "cm^4")
result("W_y", W / 1e3, "cm^3")
result("f_d", f_d, "MPa")
result("σ", sigma, "MPa")
result("F_k", F_k / 1e3, "kN")
result("M_d", M_d / 1e3, "kN·m")
result("M_dex", M_dex / 1e3, "kN·m")
result("σ_d", sigma_d, "MPa")
result("R_d", R_d / 1e3, "kN")
result("R_dB", R_dB / 1e3, "kN")
result("N", N / 1e3, "kN")
result("A_s", A_s / 1e2, "cm^2")
result("I_z", I_z / 1e4, "cm^4")
result("i_z", i_z, "mm")
result("L_cr", L_cr / 1e3, "m")
result("λ", lam, "")
result("λ_p", lam_p, "")
result("N_cr", N_cr / 1e3, "kN")
result("n_s", n_s, "")
result("σ_c", sigma_c, "MPa")
result("σ_cr", sigma_cr, "MPa")
```
