# Check in Python

The calculation of the sheet again, by another way: instead of the closed formulas the strings are summed LED by LED, the peak of the secondary is found by bisection from a numerically summed saw-tooth, the numbers of turns are found by a loop, the ripple comes from the charge summed in slices and the largest heat sink resistance from bisection over the temperatures in the chain. The button above the script runs it in the built-in Python and puts the results beside the values of the sheet. A time-domain simulation with conduction of the diodes (information only, not in the table) gives a ripple smaller by less than a tenth than the formula, so the formula is an estimate on the safe side.

```python
# Second way: loops and sums, bisection and a numerical discharge instead of the closed formulas of the sheet.
from math import sqrt, ceil, pi, sin, asin

# Part 1: strings by summing LED by LED, string by string.
N_s, U_f, I_s, n_s, U_dc = 7, 3.0, 0.2, 8, 24.0
U_s = sum(U_f for _ in range(N_s))
I = sum(I_s for _ in range(n_s))
R_s = (U_dc - U_s) / I_s
P_LED = sum(U_f * I_s for _ in range(N_s * n_s))
P_out = U_dc * I
P_Rs = sum(I_s ** 2 * R_s for _ in range(n_s))
assert abs(P_out - P_LED - P_Rs) < 1e-9, "power balance"
result("U_s", U_s, "V")
result("I", I, "A")
result("R_s", R_s, "Ω")
result("P_R", I_s ** 2 * R_s, "W")
result("P_LED", P_LED, "W")
result("P_out", P_out, "W")
result("P_Rs", P_Rs, "W")
result("η_out", P_LED / P_out, "")

# Part 2: the peak is searched by bisection so that the mean of the numerically
# integrated saw-tooth on the capacitor equals U_z (instead of the formula U_z + dU/2 + 2 U_F).
U_z, I_z, U_1, f, U_F, dU_max, d_u, k_I = U_dc, I, 230.0, 50.0, 0.9, 1.5, 0.06, 1.8
B_m, A_Fe = 1.2, 9e-4
C_for_max = I_z / (2 * f * dU_max)            # the capacitor that gives exactly dU_max


def mean_on_capacitor(U_2m, C, steps=20000):
    peak = U_2m - 2 * U_F
    T_half = 1 / (2 * f)
    total = 0.0
    for i in range(steps):
        t = (i + 0.5) * T_half / steps
        total += peak - I_z * t / C           # discharge by a constant current, integrated in slices
    return total / steps


lo, hi = 20.0, 40.0
for _ in range(100):
    mid = (lo + hi) / 2
    if mean_on_capacitor(mid, C_for_max) < U_z:
        lo = mid
    else:
        hi = mid
U_2m = (lo + hi) / 2
U_2 = U_2m / sqrt(2)
U_20 = U_2 / (1 - d_u)
n = U_1 / U_20
I_2 = k_I * I_z
S = U_2 * I_2
I_1 = S / U_1


def turns(U):                                  # the smallest whole number of turns with B <= B_m
    N = 1
    while U / (4.44 * f * N * A_Fe) > B_m:
        N += 1
    return N


N_2, N_1 = turns(U_20), turns(U_1)
result("U_2m", U_2m, "V")
result("U_2", U_2, "V")
result("U_20", U_20, "V")
result("n", n, "")
result("I_2", I_2, "A")
result("S", S, "VA")
result("I_1", I_1, "A")
result("N_2", N_2, "")
result("N_1", N_1, "")
result("B_2", U_20 / (4.44 * f * N_2 * A_Fe), "T")
result("B_1", U_1 / (4.44 * f * N_1 * A_Fe), "T")

# Part 3: the ripple is the charge taken by the load during T/2 divided by C (numerical sum).
U_m = sqrt(2) * U_2 - 2 * U_F


def ripple(C, steps=20000):
    dt = 1 / (2 * f) / steps
    q = 0.0
    for _ in range(steps):
        q += I_z * dt
    return q / C


lo, hi = 1e-6, 1.0
for _ in range(200):
    mid = (lo + hi) / 2
    if ripple(mid) > dU_max:
        lo = mid
    else:
        hi = mid
C_min = (lo + hi) / 2
C_v = 15000e-6
dU_v = ripple(C_v)
U_min, U_str = U_m - dU_v, U_m - dU_v / 2
result("U_m", U_m, "V")
result("C_min", C_min * 1e6, "μF")
result("ΔU_v", dU_v, "V")
result("U_min", U_min, "V")
result("U_str", U_str, "V")
result("Δ_min", U_min - U_z, "V")
result("I_D", I_z / 2, "A")
result("U_RRM", 2.0 * U_m, "V")
result("U_C", 1.25 * U_m, "V")

# Information only: time-domain simulation with conduction of the diodes. The real ripple is
# a little smaller than the formula, because the capacitor is discharged for less than T/2.
dt = 1e-6
u_c, t, lowest, highest = U_m, 0.0, 1e9, 0.0
for _ in range(int(0.2 / dt)):
    t += dt
    source = sqrt(2) * U_2 * abs(sin(2 * pi * f * t)) - 2 * U_F
    u_c = max(u_c - I_z * dt / C_v, source)
    if t > 0.1:
        lowest, highest = min(lowest, u_c), max(highest, u_c)
print("simulated ripple with conduction:", round(highest - lowest, 4), "V, formula:", round(dU_v, 4), "V")

# Part 4: heat flows through the chain of thermal resistances; the temperatures are
# found node by node from the ambient, the largest heat sink resistance by bisection.
P_Fe, P_Cu, T_a, T_jmax = 1.5, 3.2, 50.0, 100.0
R_jc, R_cs, R_sa = 3.0, 0.5, 12.0
P_D = 2 * U_F * I_z
P_in = P_LED + P_Rs + P_D + P_Fe + P_Cu        # energy balance: everything the mains gives


def chip_temperature(R_heatsink):
    T_s = T_a + P_D * R_heatsink
    T_c = T_s + P_D * R_cs
    return T_c, T_c + P_D * R_jc


lo, hi = 0.0, 100.0
for _ in range(200):
    mid = (lo + hi) / 2
    if chip_temperature(mid)[1] < T_jmax:
        lo = mid
    else:
        hi = mid
T_c, T_j = chip_temperature(R_sa)
result("P_D", P_D, "W")
result("P_in", P_in, "W")
result("η", P_LED / P_in, "")
result("R_sa_max", lo, "K/W")
result("T_c", T_c, "°C")
result("T_j", T_j, "°C")
```
