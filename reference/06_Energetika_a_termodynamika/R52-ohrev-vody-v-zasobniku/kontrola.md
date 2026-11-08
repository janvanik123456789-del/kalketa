# Kontrola v Pythonu

Výpočet listu znovu a jinou cestou: ohřev i chladnutí se nepočítají vzorcem s logaritmem, ale krok za krokem z energetické bilance (teplo přijaté vodou za malý čas), chladnutí navíc Rungovou–Kuttovou metodou. Tok izolací vychází z tepelného odporu vrstvy. Tlačítko nad skriptem ho spustí ve vestavěném Pythonu a výsledky postaví vedle hodnot listu.

```python
# Step-by-step energy balance instead of the closed formulas of the sheet.
V, rho, c = 120e-3, 1000.0, 4186.0   # m3, kg/m3, J/(kg K)
P, eta = 2000.0, 0.95                # W, -
t1, t2, to, tc = 12.0, 60.0, 20.0, 50.0   # degrees C
delta, lam, A = 0.050, 0.025, 2.4    # m, W/(m K), m2

m = rho * V
C = m * c                            # heat capacity of the water, J/K
R = delta / (lam * A)                # thermal resistance of the insulation, K/W
G = 1.0 / R

# Heating without losses: add heat eta*P*dt until t2 is reached.
dt, t, tau = 0.5, t1, 0.0
while t < t2:
    step = min(dt, (t2 - t) * C / (eta * P))   # the last step ends exactly at t2
    t += eta * P * step / C
    tau += step
tau_o = tau / 60.0

# Heating with losses: the same loop, the heat flow through the insulation subtracted.
t, tau = t1, 0.0
while t < t2:
    t += (eta * P - (t - to) / R) * dt / C
    tau += dt
tau_oz = tau / 60.0

# Flow through the insulation at t2 from the thermal resistance.
phi2 = (t2 - to) / R

# Cooling: RK4 on dt/dtau = -(t - to)/(R*C) until t falls to tc, time of crossing by interpolation.
def f(x):
    return -(x - to) / (R * C)

h, t, tau = 60.0, t2, 0.0
while True:
    k1 = f(t); k2 = f(t + 0.5 * h * k1); k3 = f(t + 0.5 * h * k2); k4 = f(t + h * k3)
    t_new = t + h / 6.0 * (k1 + 2 * k2 + 2 * k3 + k4)
    if t_new <= tc:
        tau += h * (t - tc) / (t - t_new)
        break
    t, tau = t_new, tau + h
tau_c = tau / 3600.0

# Energy balance of the cooling: the heat flowing out equals the heat lost by the water.
Q_lost = C * (t2 - tc)

print("R =", round(R, 4), "K/W; C =", round(C), "J/K; T = R*C =", round(R * C / 3600, 3), "h")
result("m", m, "kg")
result("Q", C * (t2 - t1) / 1e6, "MJ")
result("τ_o", tau_o, "min", rel=1e-3)
result("G", G, "W/K")
result("Φ_2", phi2, "W")
result("ratio_ztraty", 100.0 * phi2 / P, "%")
result("T", R * C / 3600.0, "h")
result("τ_c", tau_c, "h", rel=1e-3)
result("τ_oz", tau_oz, "min", rel=1e-3)
result("Q_uby", Q_lost / 1e6, "MJ")
```
