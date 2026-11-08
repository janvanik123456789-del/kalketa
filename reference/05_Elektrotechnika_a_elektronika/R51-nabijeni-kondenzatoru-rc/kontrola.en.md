# Check in Python

The calculation of the sheet again, by another way: the circuit equation C·du_C/dt = (U − u_C)/R is not evaluated by a formula with the exponential but numerically by Euler's method with a small step. The time to charge to 90 % is found by passing a threshold and the energy as a sum of the power loss R·i² over time. Then the results are compared with the closed formulas. The button above the script runs it in the built-in Python.

```python
# Euler integration of the circuit equation, no exponential formula used for the results.
from math import exp, log

U, R, C, t1 = 12.0, 4.7e3, 220e-6, 1.0

# a) time constant: the time when the numerical u_C first passes (1 - 1/e) U,
#    found by stepping; the product R*C is not used for it
dt = 1e-5
u, t, Q = 0.0, 0.0, 0.0
i0 = (U - u) / R                 # current at the instant of switching (u_C = 0)
t_tau = None
u_t1 = i_t1 = None
t90 = None
while t < 25.0:
    i = (U - u) / R              # Kirchhoff: the resistor carries what the capacitor does not
    if t_tau is None and u >= (1 - 1 / 2.718281828459045) * U:
        t_tau = t
    if t90 is None and u >= 0.9 * U:
        t90 = t
    if u_t1 is None and t >= t1:
        u_t1, i_t1 = u, i
    Q += i * i * R * dt          # heat in the resistor
    u += dt * i / C              # the capacitor charges with the current
    t += dt
    if t > 8.0:
        dt = 1e-3                # the rest is almost settled, a larger step is enough
W_c = C * U * U / 2

print("tau (numerically) =", round(t_tau, 4), "s")
print("i(0) =", round(i0 * 1e3, 4), "mA, i(t1) =", round(i_t1 * 1e3, 4), "mA")
print("u_C(t1) =", round(u_t1, 4), "V, t90 =", round(t90, 4), "s")
print("heat in R =", round(Q * 1e3, 3), "mJ, W of the capacitor =", round(W_c * 1e3, 3), "mJ")

result("τ", t_tau, "s", rel=2e-3)
result("I_0", i0 * 1e3, "mA")
result("i_t1", i_t1 * 1e3, "mA", rel=1e-3)
result("u_C_t1", u_t1, "V", rel=1e-3)
result("u_R_t1", U - u_t1, "V", rel=1e-3)
result("podil_t1", 100 * u_t1 / U, "%", rel=1e-3)
result("t_90", t90, "s", rel=1e-3)
result("Q_R", Q * 1e3, "mJ", rel=1e-3)
result("W", W_c * 1e3, "mJ")
```
