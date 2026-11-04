# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and places the results next to the values of the sheet: if they agree, the sheet is calculated correctly.

```python
from math import log, exp
t = [2, 13, 24]
c300 = [30.72, 7.68, 1.92]
k_e = log(c300[0] / c300[2]) / (t[2] - t[0])
c_0 = c300[0] * exp(k_e * t[0])
V_d = 300 / c_0
CL = k_e * V_d
trap = (c_0 + c300[0]) / 2 * t[0] + (c300[0] + c300[1]) / 2 * 11 + (c300[1] + c300[2]) / 2 * 11 + c300[2] / k_e
print("k_e", round(k_e, 4), "V_d", round(V_d, 2), "CL", round(CL, 3), "AUC", round(300 / CL, 1), "trapezoids", round(trap, 2))
result("k_e", k_e, "h⁻¹")
result("t_12", log(2) / k_e, "h")
result("c_0", c_0, "mg/L")
result("V_d", V_d, "L")
result("CL", CL, "L/h")
result("AUC", 300 / CL, "mg·h/L")
result("AUC_l", trap, "mg·h/L")
result("AUC_2", 750 / CL, "mg·h/L")
```
