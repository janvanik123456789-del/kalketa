# Velocity and position from measured acceleration
"After problem 112 of a Czech collection of solved physics problems (reseneulohy.cz/112; originally a set of problems in mechanics, Charles University 1994). Little Paul set off on a bicycle along a straight road. His acceleration as a function of time is given by a table. Draw the graph, find the form of the function a(t) and from it the course of velocity and position. At time 0 s Paul was at rest at the origin. The times are converted to seconds (the collection gives them in tenths of a second). The picture is our own."
"Source: Mandíková, Rojko: Soubor úloh z mechaniky, MFF UK 1994, https://reseneulohy.cz/112"

## Data
table Pavlik: {across}
    | t [s] {0.0} | a [m/s²] {0.0} |
    | 0           | 4.0            |
    | 0.1         | 3.7            |
    | 0.2         | 3.3            |
    | 0.3         | 3.0            |
    | 0.4         | 2.6            |
    | 0.5         | 2.3            |
    | 0.6         | 1.9            |
    | 0.7         | 1.6            |
    | 0.8         | 1.2            |
    | 0.9         | 0.8            |
    | 1.0         | 0.4            |
![Paul on a bicycle on a straight road: position x from the origin, velocity v and acceleration a in the direction of travel](images/pavlik.en.svg){width=75%}

## Acceleration
"The points in the graph lie on a line, the acceleration decreases uniformly with time. The line a(t) = q − k·t: q is the acceleration at time 0, the slope k we find from the first and the last point:"
q := Pavlik.a[1]
k := (Pavlik.a[1] - Pavlik.a[11])/(Pavlik.t[11] - Pavlik.t[1])
a(t) := q - k·t {eq}
"More precisely, the method of least squares leads the line through all points: we look for the line b_0 + b_1·t for which the sum of squared deviations of the points from it Σ(a − b_0 − b_1·t)² is smallest. The derivatives with respect to b_0 and b_1 set equal to zero give formulas for the slope and the intercept; the program calculates them from sums over the points of the table:"
a_fit := fit(Pavlik.a, x: Pavlik.t, steps: true)
"The line from the collection (end points) and the least squares line differ only a little; R² close to 1 says that the points really lie on a line."
plot(Pavlik.a, a(t), a_fit(t), t: Pavlik.t, title: "Acceleration of Paul: measured points and lines") | m/s^2

## Velocity and position
"Velocity is the integral of acceleration. The integration constant is zero because at time 0 Paul was at rest, so we integrate from 0 s:"
v(t) := integral(a(τ), τ: 0 s .. t) == q·t - k/2·t^2 {eq}
"Position is the integral of velocity, the constant is again zero because Paul started from the origin (in the collection s, here x, because s is the second):"
x(t) := integral(v(τ), τ: 0 s .. t) == q/2·t^2 - k/6·t^3 {eq}
plot(v(t), t: 0 s .. 1 s, title: "Velocity of Paul") | m/s
plot(x(t), t: 0 s .. 1 s, title: "Position of Paul") | m
"In 1 s from the start:"
v_1 := v(1 s) | m/s
x_1 := x(1 s) | m
"The velocity would grow until the acceleration falls to zero. According to the line this would be at time t_0, a little after the end of the measurement (1 s), so it is only an estimate:"
solve t_0: a(t_0) == 0 m/s^2
v_max := v(t_0) | m/s
