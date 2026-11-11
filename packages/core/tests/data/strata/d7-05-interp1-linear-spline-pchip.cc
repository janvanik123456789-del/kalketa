# Dávka 7 – list 05: interp1 metodami linear, spline a pchip, mimo rozsah bez a s "extrap"
xs := [0, 1, 2, 3]
ys := [0, 1, 4, 9]
q1 := interp1(xs, ys, 1.5, "linear")
q2 := interp1(xs, ys, 1.5, "spline")
q3 := interp1(xs, ys, 1.5, "pchip")
q4 := interp1(xs, ys, 1.5, "nearest")
q5 := interp1(xs, ys, 4, "linear")
q6 := interp1(xs, ys, 4, "linear", "extrap")
q7 := interp1(xs, ys, -1, "linear", "extrap")
q8 := interp1(xs, ys, 4, "spline")
q9 := interp1(xs, ys, 4, "spline", "extrap")
q10 := interp1(xs, ys, 4, "pchip", "extrap")
