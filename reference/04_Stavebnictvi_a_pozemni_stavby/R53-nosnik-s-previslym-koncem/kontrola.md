# Kontrola v Pythonu

Výpočet listu znovu a jinou cestou: reakce se najdou půlením tak, aby moment na volném konci vyšel nulový, když se posouvající síla po krocích sčítá (integruje) po délce nosníku. Průřezový modul vyjde ze součtu příspěvků tenkých proužků průřezu. Vzorce listu se tu nepoužívají.

```python
# Reactions by bisection: choose R_B, integrate the shear force step by step along the beam, and ask for zero moment at the free end.
L, a = 5.0, 1.5
q, F = 8e3, 12e3
b, h = 0.140, 0.300

n = 13000                      # steps, 2000 per metre: L and the support fall on nodes
ds = (L + a) / n


def integrate(R_B):
    R_A = q * (L + a) + F - R_B
    M, moments, shears = 0.0, [0.0], []
    for i in range(n):
        x = (i + 0.5) * ds
        v = R_A + (R_B if x > L else 0.0) - q * x
        shears.append(v)
        M += v * ds
        moments.append(M)
    return R_A, moments, shears


lo, hi = 0.0, 1e5
for _ in range(60):
    mid = (lo + hi) / 2
    if integrate(mid)[1][-1] > 0:
        lo = mid               # moment at the free end positive: R_B is too small
    else:
        hi = mid
R_B = (lo + hi) / 2
R_A, moments, shears = integrate(R_B)

k_B = round(L / ds)
k_max = max(range(k_B + 1), key=lambda i: moments[i])
x_0 = k_max * ds
M_max = moments[k_max]
M_B = moments[k_B]
# Shear just left and right of the support B (the values at the step centres, moved by half a step).
V_max = max(abs(shears[k_B - 1] - q * ds / 2), abs(shears[k_B] + q * ds / 2))

# Section modulus from thin strips: I is the sum of z^2 dA, W = I / (h/2).
m = 3000
dz = h / m
I = sum(((i + 0.5) * dz - h / 2) ** 2 * b * dz for i in range(m))
W = I / (h / 2)
sigma_max = max(abs(M_max), abs(M_B)) / W

print("Moment at the free end:", round(moments[-1], 6), "N.m (should be 0)")
result("R_A", R_A / 1e3, "kN")
result("R_B", R_B / 1e3, "kN")
result("x_0", x_0, "m")
result("M_max", M_max / 1e3, "kN·m")
result("M_B", M_B / 1e3, "kN·m")
result("V_max", V_max / 1e3, "kN")
result("W", W * 1e6, "cm³")
result("σ_max", sigma_max / 1e6, "MPa")
```
