# Reversible reaction

The theory behind the calculation, in our own words. Kalketa verifies the formulas in the boxes.

## Rate equations

In a first-order reaction the rate of conversion is proportional to the concentration. In a reversible reaction both conversions run at once, so each concentration depends on the other:

a′ = −k_1·a + k_2·b, b′ = k_1·a − k_2·b

The right sides are opposite, so the sum a + b does not change. That is the conservation of matter, and a check in the sheet watches it.

## Equilibrium

Equilibrium comes when both conversions balance. The ratio of concentrations is then the equilibrium constant K = k_1/k_2 and does not depend on the initial composition:

```kalk
k_1 := 0.002 1/s
k_2 := 0.001 1/s
a_0 := 1 mol/l
a_r := a_0·k_2/(k_1 + k_2)
b_r := a_0 - a_r
check "At equilibrium both conversions run equally fast": abs(k_1·a_r - k_2·b_r) ≤ 1e-12 mol/(l·s)
```

## Exact solution

Substituting b = a_0 + b_0 − a gives a single equation for a, and its solution is an exponential:

a(t) = a_r + (a_0 − a_r)·exp(−(k_1 + k_2)·t)

The time constant is 1/(k_1 + k_2). At first sight it is surprising that the reaction approaches equilibrium the faster, the **larger the reverse constant** is too: the reverse reaction lowers the yield, but the target is nearer and is reached sooner. The time for 90 % of the way is ln(10)/(k_1 + k_2).

## When a system is needed

Here one equation would do, thanks to the conservation law. A system is more general: when another step is added, for example A ⇌ B → C, the exact solution soon gets complicated, but the notation in the sheet stays just as simple. It is enough to add a curve, an equation and an initial condition.
