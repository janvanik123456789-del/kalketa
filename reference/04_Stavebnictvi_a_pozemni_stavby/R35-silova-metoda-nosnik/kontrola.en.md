# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and places the results next to the values of the sheet: if they agree, the sheet is calculated correctly. The integrals of the products of the diagrams are computed here by the two-point Gauss rule on each span where the diagrams are linear (so the product is quadratic and the rule is exact); the sheet integrates them.

```python
L_ab, L_bc, L_cd = 5.0, 3.0, 3.0
L = L_ab + L_bc + L_cd
q_x, M_c = 20e3, 50e3                 # N/m, N·m
E, A, I = 210e9, 28.5e-4, 1943e-8
EA, EI = E * A, E * I

A_z0, D_z0 = -M_c / L, M_c / L
N0 = lambda x: q_x * (L_ab - x) if x <= L_ab else 0.0
M0 = lambda x: A_z0 * x if x <= L_ab + L_bc else D_z0 * (L - x)
M2 = lambda x: (L - L_ab) / L * x if x <= L_ab else L_ab / L * (L - x)

def integral(f):
    # two-point Gauss rule on each of the three spans: exact for a quadratic,
    # and the nodes lie inside a span, so the jump of the moment at c does not matter
    total = 0.0
    for a, b in [(0.0, L_ab), (L_ab, L_ab + L_bc), (L_ab + L_bc, L)]:
        m, h = (a + b) / 2, (b - a) / 2
        total += h * (f(m - h / 3 ** 0.5) + f(m + h / 3 ** 0.5))
    return total

d10 = integral(lambda x: N0(x)) / EA
d11 = L / EA
d20 = integral(lambda x: M2(x) * M0(x)) / EI
d22 = integral(lambda x: M2(x) ** 2) / EI

X1 = -d10 / d11
X2 = -d20 / d22
A_x = -q_x * L_ab - X1
A_z = A_z0 + X2 * (L - L_ab) / L
D_z = D_z0 + X2 * L_ab / L
M_b = L_ab * A_z
M_cL = (L_ab + L_bc) * A_z - L_bc * X2
M_cP = L_cd * D_z

print("delta10*EA =", round(d10 * EA), "N·m (source 250000)")
print("X1 =", round(X1 / 1e3, 4), "kN, X2 =", round(X2 / 1e3, 4), "kN")
result("δ_10", d10 * 1e3, "mm")
result("δ_11", d11 * 1e6, "mm/kN")
result("δ_20", d20 * 1e3, "mm")
result("δ_22", d22 * 1e6, "mm/kN")
result("X_1", X1 / 1e3, "kN")
result("X_2", X2 / 1e3, "kN")
result("A_x", A_x / 1e3, "kN")
result("A_z", A_z / 1e3, "kN")
result("D_z", D_z / 1e3, "kN")
result("N_a", -A_x / 1e3, "kN")
result("N_d", X1 / 1e3, "kN")
result("M_b", M_b / 1e3, "kN·m")
result("M_cL", M_cL / 1e3, "kN·m")
result("M_cP", M_cP / 1e3, "kN·m")
```
