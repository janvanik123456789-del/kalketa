# 06 — prolozeni jinymi tvary: exponenciala, mocnina, logaritmus, kubicky polynom
# Reference: presne zadane funkce bez sumu — prolozeni ma vratit presne koeficienty,
# dale overeno logaritmickou linearizaci ve zlomcich / mpmath.

xs := [1, 2, 3, 4, 5, 6, 7, 8]
a_skut := 2.5
b_skut := 0.35
exp_y := a_skut·exp(b_skut·xs)
F_exp := fit(exp_y, x: xs, kind: "exp")
e_a := F_exp[1]
e_b := F_exp[2]

k_skut := 3
m_skut := 1.7
moc_y := k_skut·xs^m_skut
F_moc := fit(moc_y, x: xs, kind: "power")
m_k := F_moc[1]
m_m := F_moc[2]

c_skut := 2
d_skut := 0.5
log_y := c_skut + d_skut·ln(xs)
F_log := fit(log_y, x: xs, kind: "log")
l_c := F_log[1]
l_d := F_log[2]

poly_y := 4 - 3·xs + 2·xs^2 - 0.5·xs^3
F_poly := fit(poly_y, x: xs, kind: "poly3")
p3 := F_poly[1]
p2 := F_poly[2]
p1 := F_poly[3]
p0 := F_poly[4]
hodnota := F_poly(3)
polyn := polyfit(xs, poly_y, 3)
pol_hodnota := polyval([-0.5, 2, -3, 4], 3)

check "exponenciala: a": abs(e_a / a_skut - 1) < 1e-9
check "exponenciala: b": abs(e_b / b_skut - 1) < 1e-9
check "mocnina: koeficient": abs(m_k / k_skut - 1) < 1e-9
check "mocnina: exponent": abs(m_m / m_skut - 1) < 1e-9
check "logaritmus: konstanta": abs(l_c / c_skut - 1) < 1e-9
check "logaritmus: koeficient": abs(l_d / d_skut - 1) < 1e-9
check "kubicky polynom: nejvyssí clen": abs(p3 - (-0.5)) < 1e-9
check "polyval sedí na rucni dosazeni": abs(pol_hodnota - (-0.5)) < 1e-12
