# Check in Python

The sheet is calculated again, independently, in Python with its built-in complex numbers. The button above the script runs it in the built-in Python and places the results next to the values of the sheet: if they agree, the sheet is calculated correctly. Here the results are compared as magnitudes and angles of the phasors.

```python
import cmath
import math

E, f = 120.0, 60.0
C1, L, R, C2 = 4.7e-6, 0.650, 470.0, 1.5e-6
w = 2 * math.pi * f
Z_C1, Z_L, Z_C2 = 1 / (1j * w * C1), 1j * w * L, 1 / (1j * w * C2)
Z_LC2 = Z_L + Z_C2
Z_p = 1 / (1 / R + 1 / Z_LC2)
Z = Z_C1 + Z_p
I = E / Z
E_C1, E_p = I * Z_C1, I * Z_p
I_R, I_LC2 = E_p / R, E_p / Z_LC2
E_L, E_C2 = I_LC2 * Z_L, I_LC2 * Z_C2
S = E * I.conjugate()
print("Z =", Z, "= %.2f ohm, %.3f deg" % (abs(Z), math.degrees(cmath.phase(Z))))
print("Kirchhoff: %.2e V, %.2e A" % (abs(E_C1 + E_p - E), abs(I_R + I_LC2 - I)))
result("ω", w, "rad/s")
result("Z_abs", abs(Z), "Ω")
result("φ_Z", math.degrees(cmath.phase(Z)), "°")
result("I_abs", abs(I) * 1e3, "mA")
result("E_C1_abs", abs(E_C1), "V")
result("E_p_abs", abs(E_p), "V")
result("I_R_abs", abs(I_R) * 1e3, "mA")
result("I_LC2_abs", abs(I_LC2) * 1e3, "mA")
result("E_L_abs", abs(E_L), "V")
result("E_C2_abs", abs(E_C2), "V")
result("cos_φ", math.cos(cmath.phase(Z)), "")
result("P", S.real, "W")
result("P_R", abs(I_R) ** 2 * R, "W")
```
