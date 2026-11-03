# Fitting measured points with a parabola by least squares
"Five points from an experiment show a nonlinear trend. We fit them with a polynomial of degree 2 (a parabola) y = b_0 + b_1·x + b_2·x² so that the sum of squared deviations of the points from the curve is smallest, and compare it with a straight line. The theory (derivation of the normal equations) is in the Sources layer."

## Measured points
table Body: {across}
    | x {0} | y {0.0} |
    | 1     | 2.1     |
    | 2     | 3.9     |
    | 3     | 4.2     |
    | 4     | 6.2     |
    | 5     | 9.1     |

## Parabola
"We look for b_0, b_1, b_2 for which the sum of squared deviations Σ(y − b_0 − b_1·x − b_2·x²)² is smallest. The derivatives with respect to each coefficient set equal to zero give a system of three linear equations, the normal equations (see Sources). The program adds up the powers of x over the points, builds the system and solves it:"
P := fit(Body.y, x: Body.x, kind: "poly2", steps: true)

## Comparison with a straight line
"The least squares line through the same points:"
L := fit(Body.y, x: Body.x)
"Sum of squared deviations of the points from the parabola and from the line:"
S_P := sum((Body.y - P(Body.x))^2)
S_L := sum((Body.y - L(Body.x))^2)
check "the parabola fits the points better than the line": S_P < S_L
plot(Body.y, P(x), L(x), x: Body.x, title: "Measured points, parabola and line")
