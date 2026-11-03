# Check in Python

The calculation of the sheet done again and independently, in Python. The button above the script runs it in the built-in Python and places the results beside the values of the sheet: if they agree, the sheet is calculated correctly.

Another way to the same result: the man walks with a varying speed relative to the boat (he starts running, slows down, stands for a while), and the speed of the boat is calculated step by step from the equality of momenta. The shift of the boat at the end must come out the same as from the formula, whatever the course of the walk.

```python
from math import sin, pi

m, M, L = 70.0, 100.0, 2.5

# The man's speed relative to the boat (towards the bow, negative x): a profile with a stop in the middle,
# scaled so that he walks exactly the length of the boat.
T, n = 6.0, 60000
dt = T / n
def shape(t):
    return sin(pi * t / T) ** 2 * (0.2 if 2.5 < t < 3.5 else 1.0)
total = sum(shape((i + 0.5) * dt) for i in range(n)) * dt
x_boat, x_man_rel = 0.0, 0.0
for i in range(n):
    u = -L / total * shape((i + 0.5) * dt)      # speed of the man relative to the boat
    # Momentum stays zero: M·v + m·(v + u) = 0
    v = -m * u / (M + m)
    x_boat += v * dt
    x_man_rel += u * dt
print("the man walked", round(-x_man_rel, 6), "m on the boat; the boat moved", round(x_boat, 6), "m")

x = m * L / (M + m)
result("x", x_boat, "m", rel=1e-6)
result("x_T1", (M * L / 2 + m * L) / (M + m), "m")
result("s_c", L - x_boat, "m", rel=1e-6)
```
