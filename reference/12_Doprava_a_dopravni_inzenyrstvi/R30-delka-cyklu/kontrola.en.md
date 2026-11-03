# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and sets the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

```python
y = [0.233, 0.13, 0.256]
I = [6, 4, 7]
L = sum(I)
Y = sum(y)
C0 = (1.5 * L + 5) / (1 - Y)
C = 5 * round(C0 / 5)
g = [yi / Y * (C - L) for yi in y]
print("cycle", round(C0, 2), "s ->", C, "s; greens", [round(x, 1) for x in g])
result("L_z", L, "s")
result("Y", Y, "")
result("C_o", C0, "s")
result("C_n", C, "s")
result("C_min", 1.5 * L + 5, "s")
result("X", Y * C / (C - L), "")
```
