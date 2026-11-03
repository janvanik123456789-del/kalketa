# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and sets the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

```python
from math import atan2, sin, cos, pi
gon = pi / 200
X517, Y517 = 1119008.31, 668249.55
X518, Y518 = 1120260.63, 668625.06
sigma = atan2(Y518 - Y517, X518 - X517) % (2 * pi)
omega = (189.2487 - 82.0285) * gon
alpha = sigma + omega
d = 286.45
print("Y =", round(Y517 + d * sin(alpha), 2), " X =", round(X517 + d * cos(alpha), 2))
result("σ", sigma / gon, "gon")
result("ω", omega / gon, "gon")
result("α", alpha / gon, "gon")
result("Y_550", Y517 + d * sin(alpha), "m")
result("X_550", X517 + d * cos(alpha), "m")
```
