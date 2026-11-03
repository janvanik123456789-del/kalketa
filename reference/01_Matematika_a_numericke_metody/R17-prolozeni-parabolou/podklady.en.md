# Method of least squares

Theory for the calculation, in our own words. Kalketa verifies the formulas in the frames as derivations.

## The task

Measured points [xᵢ; yᵢ] never lie exactly on a curve: measurements have errors. We look for a curve of a given shape that describes the points best. For a polynomial of degree 2, y = b₀ + b₁·x + b₂·x², there are three coefficients. As a measure of agreement we take the sum of squares of the vertical deviations of the points from the curve:

S = Σ (yᵢ − b₀ − b₁·xᵢ − b₂·xᵢ²)²

Squares, because deviations upward and downward do not cancel and large deviations weigh more than small ones. We look for the coefficients for which S is smallest.

## Normal equations

At the minimum the derivatives of S with respect to all coefficients are zero. The derivative of one term of the sum with respect to b₀, b₁ and b₂:

```kalk
derive derivative((y - b_0 - b_1·x - b_2·x^2)^2, b_0: b_0) == -2·(y - b_0 - b_1·x - b_2·x^2)
derive derivative((y - b_0 - b_1·x - b_2·x^2)^2, b_1: b_1) == -2·x·(y - b_0 - b_1·x - b_2·x^2)
derive derivative((y - b_0 - b_1·x - b_2·x^2)^2, b_2: b_2) == -2·x^2·(y - b_0 - b_1·x - b_2·x^2)
```

We sum over all points, set the result equal to zero and divide by −2. This gives three linear equations for b₀, b₁, b₂, the normal equations:

- n·b₀ + Σx·b₁ + Σx²·b₂ = Σy
- Σx·b₀ + Σx²·b₁ + Σx³·b₂ = Σx·y
- Σx²·b₀ + Σx³·b₁ + Σx⁴·b₂ = Σx²·y

The coefficients of the system are sums of powers of x over the points (n is the number of points), the right-hand sides are sums of x^k·y. The system is symmetric and for points with at least three different x it has a single solution. The function `fit(…, kind: "poly2", steps: true)` writes it out, with numbers too.

## The straight line as a special case

For a line (b₂ = 0) two normal equations remain. Their solution gives the well-known formulas for the slope and the intercept:

```kalk
relation n·b_0 + S_x·b_1 == S_y
relation S_x·b_0 + S_xx·b_1 == S_xy
derive b_1 == (n·S_xy - S_x·S_y)/(n·S_xx - S_x^2)
derive b_0 == (S_y - b_1·S_x)/n
```

Here S_x = Σx, S_xx = Σx², S_y = Σy and S_xy = Σx·y.

## Coefficient of determination R²

R² = 1 − S / Σ(yᵢ − ȳ)² compares the remaining deviations with the variance of the y values around their mean ȳ. R² = 1 means the points lie exactly on the curve. A polynomial of higher degree always has R² at least as large as a lower one (a line is a parabola with b₂ = 0), so a better R² alone does not say that the shape of the curve is right. The degree is chosen from the physical nature of the dependence and from whether the deviations of the points from the curve look random.

## What to watch for

- **Number of points.** A polynomial of degree k has k + 1 coefficients; there must be more points, otherwise the curve passes exactly through all points and says nothing about measurement errors.
- **Outside the measured range.** Outside the range of the measured x a polynomial quickly veers away; a prediction beyond the last point is only an estimate.
- **Rounding.** The sums Σx⁴ grow quickly and the system is often sensitive to rounding. In a hand calculation one must keep enough significant digits and check the result by substituting into all three equations.
