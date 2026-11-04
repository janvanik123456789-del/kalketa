# Check in Python

The sheet is calculated again, independently, in Python, in closed form. The button above the script runs it in the built-in Python and places the results next to the values of the sheet: if they agree, the sheet is calculated correctly.

```python
R, rho_F, rho_S, g, G = 1.0, 997.0, 1025.0, 9.81, 30e3
# Moments about the hinge D per metre of width: salt water (horizontal component on the arm R), weight, river water.
M_S = R * rho_S * g * R**2 / 2
M_G = G * R / 3
M_F = lambda t: rho_F * g * (t * R**2 / 2 + R**3 / 3)
F_A = lambda t: (M_S + M_G - M_F(t)) / R
# Opening depth: moment of the river = moment of the salt water and of the weight.
t0 = (M_S + M_G - rho_F * g * R**3 / 3) / (rho_F * g * R**2 / 2)
result("M_S", M_S / 1e3, "kN·m/m")
result("M_G", M_G / 1e3, "kN·m/m")
result("F_A0", F_A(0) / 1e3, "kN/m")
result("F_A1", F_A(1) / 1e3, "kN/m")
result("t_0", t0, "m")
```
