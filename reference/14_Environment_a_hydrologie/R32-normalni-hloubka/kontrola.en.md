# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and sets the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

```python
from math import sqrt
b, m, I0, Q = 8.0, 1.5, 0.0009, 56.0
S = lambda y: (b + m * y) * y
R = lambda y: S(y) / (b + 2 * y * sqrt(1 + m * m))
n1 = S(2) * R(2) ** (2 / 3) * sqrt(I0) / Q
f = lambda y: S(y) * R(y) ** (2 / 3) * sqrt(I0) / 0.017 - Q
lo, hi = 0.5, 5.0
for _ in range(100):
    mid = (lo + hi) / 2
    lo, hi = (lo, mid) if f(mid) > 0 else (mid, hi)
y_n = (lo + hi) / 2
print("n =", round(n1, 5), " y_n =", round(y_n, 3), "m; the source 0.01507 and 2.137 m")
result("R_1", R(2), "m")
result("n_1", n1, "s/m^(1/3)")
result("y_n", y_n, "m")
result("v", Q / S(y_n), "m/s")
```
