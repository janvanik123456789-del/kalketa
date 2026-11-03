# Check in Python

The calculation of the sheet done again and independently, in Python. The button above the script runs it in the built-in Python and places the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

NumPy fits by least squares in a different way (by matrix decomposition, not by normal equations). It places the sums of squared deviations of both curves beside the values of the sheet.

```python
import numpy as np

x = np.array([1, 2, 3, 4, 5.0])
y = np.array([2.1, 3.9, 4.2, 6.2, 9.1])
P = np.polyfit(x, y, 2)          # coefficients from the highest power: b_2, b_1, b_0
L = np.polyfit(x, y, 1)
print("parabola:", P.round(5), " line:", L.round(5))

result("S_P", float(((y - np.polyval(P, x)) ** 2).sum()))
result("S_L", float(((y - np.polyval(L, x)) ** 2).sum()))
```
