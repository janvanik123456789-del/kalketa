# Dávka 7 – list 06: spline na nerovnoměrné síti a na dvou bodech; pchip na monotónních datech
xn := [0, 1, 2, 4, 8]
yn := [0, 1, 4, 9, 16]
sn1 := spline(xn, yn, 3)
sn2 := spline(xn, yn, 5)
pn1 := pchip(xn, yn, 3)
pn2 := pchip(xn, yn, 5)
s2b := spline([0, 1], [0, 1], 0.5)
xp := [0, 1, 2, 3, 4, 5]
yp := [0, 1, 2, 3, 12, 13]
pp1 := pchip(xp, yp, 3.2)
pp2 := pchip(xp, yp, 3.5)
pp3 := pchip(xp, yp, 3.8)
ss1 := spline(xp, yp, 3.2)
ss2 := spline(xp, yp, 3.5)
ss3 := spline(xp, yp, 3.8)
