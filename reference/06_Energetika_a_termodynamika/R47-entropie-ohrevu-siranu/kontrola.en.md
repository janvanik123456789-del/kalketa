# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and places the results next to the values of the sheet: if they agree, the sheet is calculated correctly.

```python
from math import log

# The heat capacity is integrated term by term and also by a plain trapezoid sum (another way than the sheet).
m, M = 1000.0, 174.26           # g, g/mol
T1, T2 = 25 + 273.15, 427 + 273.15
a, b, c = 120.4, 99.6e-3, -17.8e-6
n = m / M
cp = lambda T: a + b * T + c / T**2

N = 20000
h = (T2 - T1) / N
s_num = sum((cp(T1 + i * h) / (T1 + i * h) + cp(T1 + (i + 1) * h) / (T1 + (i + 1) * h)) / 2 * h for i in range(N))
q_num = sum((cp(T1 + i * h) + cp(T1 + (i + 1) * h)) / 2 * h for i in range(N))
dS = n * (a * log(T2 / T1) + b * (T2 - T1) - c / 2 * (1 / T2**2 - 1 / T1**2))
Q = n * (a * (T2 - T1) + b / 2 * (T2**2 - T1**2) - c * (1 / T2 - 1 / T1)) / 1000
assert abs(n * s_num - dS) < 1e-3 and abs(n * q_num / 1000 - Q) < 1e-3

result("n", n, "mol")
result("T_1", T1, "K")
result("T_2", T2, "K")
result("ΔS", dS, "J/K")
result("ΔS_ruc", dS, "J/K")
result("Q", Q, "kJ")
result("T_s", Q * 1000 / dS, "K")
result("T_arit", (T1 + T2) / 2, "K")
```
