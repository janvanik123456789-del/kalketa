# Quadratic equation

"We solve the equation **a·x² + b·x + c = 0** and study the parabola y = a·x² + b·x + c: its roots, vertex, tangent and the area between the curve and the x axis. The coefficients a, b, c can be changed with sliders in the editor; the calculation, the checks and the chart follow."

## Input

"The coefficients of the equation:"
a := -2 {slider=-5..5}
b := 2 {slider=-10..10 beside}
c := 10 {slider=-20..20 beside}

"The parabola as a function of the sheet. The solution, the vertex, the tangent, the area and the chart all come from it, so changing the coefficients is enough."
y(x) := a·x^2 + b·x + c

## Condition of a solution

"The equation has real roots when its discriminant D = b² − 4·a·c is not negative. With D < 0 the parabola does not meet the x axis: the check below then fails and the lines that calculate with the roots (the checks, the area) are not calculated. Try it with the slider of a."
D := b^2 - 4·a·c
check "the equation has real roots": D ≥ 0

## Roots

"The roots are sought among the real numbers. The program writes the solution out as on paper: the discriminant, the formula of the roots with the numbers put in and both roots; the roots are then the names x_1 and x_2 for what follows. It also gives the vertex of the parabola V = [−b/(2·a); −D/(4·a)]."
solve x ∈ ℝ: y(x) == 0

"Check by Vieta's formulas: the sum of the roots is −b/a, their product c/a."
check "sum of the roots": x_1 + x_2 == -b/a
check "product of the roots": x_1·x_2 == c/a

"The factored form: the parabola is the same as a·(x − x₁)·(x − x₂). We check it at one point, x = 3 say:"
y_r(x) := a·(x - x_1)·(x - x_2)
check "factored form": y_r(3) == y(3)

## Vertex of the parabola

"The vertex lies where the first derivative is zero, y′(x) = 0. The program writes the derivative out and solves the equation."
solve x_v: y′(x_v) == 0
y_v := y(x_v)

"A check by the formula of the vertex, y_v = c − b²/(4·a):"
check "vertex by its formula": y_v == c - b^2/(4·a)
V := [x_v, y_v]

## Tangent

"The slope of the tangent at a point x₀ is the value of the first derivative there, k = y′(x₀); the angle of the tangent from the x axis is α = arctan k."
x_0 := -1
k := y′(x_0)
α := atan(k) | °

## Area under the curve

"The area between the parabola and the x axis between the roots. The integral is negative where the curve lies below the x axis; the area is its absolute value."
S := abs(integral(y(x), x: x_1 .. x_2))

## Chart

"The chart shows the roots on the x axis, the axis of symmetry, the vertex V as calculated in the sheet, the hatched area S and the tangent at x₀. In the editor the point of the tangent can be dragged along the curve and the labels moved elsewhere."
plot(y(x), x: -4 .. 5, place: "ratio=0.7", ylim: -30 .. 20, roots: true, symmetry: true, points: V, area: S, tangent: -1, labels: "t=-72,-44 a0.0=0,8 p0.0=4,-6 s=0,10")
