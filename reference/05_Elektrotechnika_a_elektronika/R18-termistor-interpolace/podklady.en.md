# Interpolation of tabulated values

Theory for the calculation, in our own words. Kalketa verifies the formulas in the boxes as derivations.

## Interpolation and approximation

- **Interpolation** leads the curve exactly through all the points. It suits tables we trust: catalogue values, tables in standards, results of an exact calculation.
- **Approximation** (least squares fit, the functions `fit` and `polyfit` with a lower degree) only captures the points. It suits measured data burdened with error, where a curve through all the points would follow the measurement noise too.

## Broken line

Between neighbouring points x₁, x₂ we replace the curve by a straight line. The piecewise notation is the same as the Lagrange polynomial of two points:

```kalk
derive y_1 + (y_2 - y_1)·(x - x_1)/(x_2 - x_1) == y_1·(x - x_2)/(x_1 - x_2) + y_2·(x - x_1)/(x_2 - x_1)
```

Between the points the error is at most (x − x₁)·(x₂ − x)/2 · max|f″|: it grows with the square of the table step and with the curvature of the function. For a convex curve (NTC) the broken line always lies above it. At 37 °C in a table with a 10 °C step the curvature is greatest at the beginning of the section 30–40 °C, f″ ≐ 0.0171 kΩ/K², and the estimate gives at most 7·3/2·0.0171 ≐ 0.18 kΩ; the actual error is 0.132 kΩ, about 2.2 %.

## Cubic spline

On each section there is a cubic; neighbouring cubics have the same value, first and second derivative at the node. At the ends two conditions are missing. MATLAB, SciPy and Kalketa choose "not-a-knot": the first two and the last two cubics are one and the same curve (the third derivative is continuous at the second and the last but one point too). Four points therefore give exactly one cubic, three points a parabola.

The spline is smooth and accurate for smooth functions, but for data with a jump or with a sharp change of slope it can swing above or below the data between the points.

## PCHIP: a shape-preserving cubic

PCHIP (piecewise cubic Hermite interpolation) chooses the slope at each point so that the curve does not overshoot: where the data change direction, the slope is zero, elsewhere it is a weighted harmonic mean of the slopes of the neighbouring sections. Monotonic data give a monotonic curve. The second derivative is not continuous, though, so for smooth functions it tends to be slightly less accurate than the spline. It suits characteristics where an overshoot would be unphysical (efficiency above 100 %, negative flow).

## Polynomial through all points and the Runge phenomenon

One polynomial of degree n − 1 can pass through n points (the Lagrange polynomial, `polyfit(x, y, n − 1)`). For a smooth function, such as the exponential of a thermistor, it tends to be very accurate. For functions with a sharp change or for data with error, however, it oscillates strongly between the end points (the Runge phenomenon), and it gets worse as the number of points grows. This is why splines, not a single polynomial, are used for tables with many points.

## B model of the thermistor

The resistance of a semiconductor NTC thermistor falls exponentially with temperature. T is the thermodynamic temperature in kelvins:

```kalk
relation R == R_25·exp(B·(1/T - 1/T_25))
derive ln(R/R_25) == B·(1/T - 1/T_25)
```

So ln R is a straight line in 1/T. From two points of the table the constant B is calculated directly; catalogues give it as B₂₅/₈₅ or B₀/₁₀₀ according to which temperatures it comes from:

```kalk
relation R_1 == R_25·exp(B·(1/T_1 - 1/T_25))
relation R_2 == R_25·exp(B·(1/T_2 - 1/T_25))
derive B == ln(R_1/R_2)/(1/T_1 - 1/T_2)
```

The sensitivity of the thermistor (the slope of the characteristic) follows from the derivative of the model; relatively it is −B/T², around 25 °C about −4.4 % per kelvin:

```kalk
derive derivative(R_25·exp(B·(1/T - 1/T_25)), T: T) == -B/T^2·R_25·exp(B·(1/T - 1/T_25))
```

The B model holds exactly only near the temperatures from which B was determined. More accurate is the Steinhart–Hart equation: 1/T = a + b·ln R + c·(ln R)³.

## What to use when

- A function known by a formula (B model): calculate by the formula, the table is only for checking.
- A smooth table (properties of substances, a catalogue): cubic spline.
- A table where an overshoot would make no sense (a monotonic characteristic, data with breaks): pchip.
- A rough estimate, a dense table, or when a standard prescribes it: broken line.
- Measured data with error: approximation (`fit`, `polyfit` of low degree), not interpolation.
