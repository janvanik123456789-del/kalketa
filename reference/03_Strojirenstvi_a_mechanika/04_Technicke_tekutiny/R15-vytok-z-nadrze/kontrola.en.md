# Check in Python

The calculation of the sheet again and independently, in Python. The button above the script runs it in the built-in Python and places the results next to the values of the sheet: if they agree, the sheet is calculated correctly.

Another way to the same results: instead of the integral, a step-by-step simulation of the emptying (the 4th order Runge–Kutta method), the impact speed from conservation of energy. The button below the script runs it in the built-in Python and places the results next to the values of the sheet.

```python
from math import pi, sqrt

g, r, h_1, h_2, S_2 = 9.81, 0.9, 3.0, 6.0, 6.3e-4
S_1 = pi * r**2

# Fall of the surface: dh/dt = -S_2/S_1 * sqrt(2 g h), step 0.02 s until the tank is empty.
def rate(h):
    return -S_2 / S_1 * sqrt(2 * g * max(h, 0.0))

t, h, dt, t_pol = 0.0, h_1, 0.02, None
while h > 0:
    k1 = rate(h)
    k2 = rate(h + dt / 2 * k1)
    k3 = rate(h + dt / 2 * k2)
    k4 = rate(h + dt * k3)
    step = dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    if t_pol is None and h + step <= h_1 / 2:
        t_pol = t + dt * (h - h_1 / 2) / (-step)
    if h + step <= 0:
        t += dt * h / (-step)
        break
    h += step
    t += dt

result("v_A", sqrt(2 * g * (h_1 + h_2)), "m/s")
result("S_1", S_1, "m^2")
result("t_v", t / 60, "min", rel=1e-4)
result("t_pol", t_pol, "s", rel=1e-4)
```
