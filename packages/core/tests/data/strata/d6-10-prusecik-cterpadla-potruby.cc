# Dávka 6 – list 10: průsečík dvou křivek s jednotkami (čerpadlo a potrubí)
H_c(v) := 50 m - 20 s^2/m^5 * v^2
H_p(v) := 20 m + 120 s^2/m^5 * v^2
solve v1 ∈ ℝ, v1 > 0: H_c(v1) == H_p(v1) guess v1 = 1 m^3/s
b1 := H_c(v1) | m
b2 := H_p(v1) | m
