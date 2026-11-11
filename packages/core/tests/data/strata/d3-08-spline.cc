# 08 — kubický spline (ne-zavázané konce) na Rungeově funkci
# Reference: vlastní řešení trojúhelníkové soustavy pro not-a-knot spline v NumPy.

x := [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]
y := 1 / (1 + 25·x^2)

h_m100 := spline(x, y, -1)
h_m090 := spline(x, y, -0.9)
h_m060 := spline(x, y, -0.6)
h_m030 := spline(x, y, -0.3)
h_000 := spline(x, y, 0)
h_015 := spline(x, y, 0.15)
h_040 := spline(x, y, 0.4)
h_062 := spline(x, y, 0.62)
h_100 := spline(x, y, 1)
h_m120 := spline(x, y, -1.2)
h_130 := spline(x, y, 1.3)

spline_uzel := spline(x, y, 0.5)
presna_hodnota := 1 / (1 + 25·0.5^2)

n := [0, 0.2, 0.4, 0.6, 0.8, 1]
g := [0, 0.19869012, 0.36901555, 0.51152462, 0.62748492, 0.71504877]
druhy_spline := spline(n, g, 0.5)
mimo_mrizky := spline(n, g, 2.5)

check "spline prochází uzlem": abs(spline_uzel - presna_hodnota) < 1e-14
check "spline v nule je 1": abs(h_000 - 1) < 1e-14
check "spline na konci mrizky je hodnota uzlu": abs(h_m100 - y[1]) < 1e-14
