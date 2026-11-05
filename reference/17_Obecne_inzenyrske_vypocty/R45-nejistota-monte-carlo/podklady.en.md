# Propagation of uncertainty and the Monte Carlo method

The theory behind the calculation, in our own words. Kalketa verifies the formulas in the boxes.

## Linear propagation (GUM)

When the result is a function of inputs, y = f(x_1, x_2, …), and the uncertainties of the inputs are small, the function near the nominal point is replaced by its tangent plane. The uncertainty of the result is then the square root of the sum of squares of the contributions c_i·u_i, where the sensitivities c_i are partial derivatives. The procedure is quick and serves most measurements.

## Rectangular distribution

A tolerance of ±a with no further information means a rectangular distribution. Its variance is the mean square deviation over the interval, a²/3:

```kalk
a := 2 Ω
u := a/sqrt(3)
v := integral((x - 52 Ω)^2, x: 50 Ω .. 54 Ω)/(2·a)
check "The variance of a rectangular distribution is a²/3": abs(u^2 - v) ≤ 1e-9 Ω^2
```

## Monte Carlo (Supplement 1 to GUM)

Instead of the tangent plane, the inputs are drawn many times from their distributions and the result is calculated each time. This gives the distribution of the result, from which the mean, the standard deviation and the coverage interval from quantiles are read directly. The simulation needs no derivatives and works where the model is strongly nonlinear or the distribution of the result is not symmetric.

The accuracy grows with the square root of the number of trials: from 5000 trials the mean is found with an error of about u/√5000, about 1.4 % of the uncertainty. A generator with a seed gives the same numbers every time, so the calculation is repeatable and can be checked, although it is random.

## Why the three ways agree here

The power U²/R is curved, but over ±1.3 % of the voltage and ±3.8 % of the resistance it hardly differs from its tangent plane. The difference between the mean and the value at the nominal point comes from the curvature and is less than a watt here. With larger uncertainties, say a resistor with a tolerance of ±50 %, the linear estimate and the simulation would visibly part, and the simulation would give an asymmetric interval.
