# Check in Python

The calculation of the sheet again, independently, in Python. The principal stresses are not found here as eigenvalues of a matrix but as roots of the cubic characteristic polynomial (trigonometric solution). The button above the script runs it in the built-in Python and puts the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

```python
from math import acos, cos, pi, sqrt

sx, sy, sz, txy, tyz, tzx, dov = 80.0, 20.0, -15.0, 40.0, 0.0, 0.0, 112.0  # MPa

# Invariants of the stress tensor: s^3 - I1 s^2 + I2 s - I3 = 0
I1 = sx + sy + sz
I2 = sx * sy + sy * sz + sz * sx - txy**2 - tyz**2 - tzx**2
I3 = sx * sy * sz + 2 * txy * tyz * tzx - sx * tyz**2 - sy * tzx**2 - sz * txy**2

# After shifting by I1/3 the cubic is solved trigonometrically
J2 = (I1**2 - 3 * I2) / 3
J3 = 2 * I1**3 / 27 - I1 * I2 / 3 + I3
r = 2 * sqrt(J2 / 3)
theta = acos(max(-1.0, min(1.0, 3 * J3 / (2 * J2) * sqrt(3 / J2)))) / 3
s1, s2, s3 = sorted(round(I1 / 3 + r * cos(theta - 2 * pi * k / 3), 9) for k in range(3))

hmh = sqrt(s1**2 + s2**2 + s3**2 - s1 * s2 - s2 * s3 - s3 * s1)
guest = max(abs(s1 - s2), abs(s2 - s3), abs(s3 - s1))
hmh2 = sqrt(sx**2 + sy**2 + sz**2 - sx * sy - sy * sz - sz * sx + 3 * (txy**2 + tyz**2 + tzx**2))
q = sx**2 + sy**2 + sz**2 - sx * sy - sy * sz - sz * sx

result("σ_1", s1, "MPa")
result("σ_2", s2, "MPa")
result("σ_3", s3, "MPa")
result("τ_12", abs(s1 - s2) / 2, "MPa")
result("τ_23", abs(s2 - s3) / 2, "MPa")
result("τ_31", abs(s3 - s1) / 2, "MPa")
result("τ_max", guest / 2, "MPa")
result("σ_RED_HMH", hmh, "MPa")
result("σ_RED_GUEST", guest, "MPa")
result("σ_RED_HMH2", hmh2, "MPa")
result("v_HMH", hmh / dov * 100, "%")
result("v_GUEST", guest / dov * 100, "%")
result("τ_dov_HMH", sqrt((dov**2 - q) / 3), "MPa")
result("τ_dov_GUEST", sqrt((dov + sz - (sx + sy) / 2) ** 2 - ((sx - sy) / 2) ** 2), "MPa")
```
