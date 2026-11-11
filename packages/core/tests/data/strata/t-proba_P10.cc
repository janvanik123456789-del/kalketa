# Sonda P10 — cumprod, prvkové operace, round na řadě, skalární součin
radek := [1.1, 1.2, 1.3]
cp := cumprod(radek)
podil_radu := [1, 2, 3] / [2, 4, 6]
reciproka := 1 / [2, 4, 6]
zaokr := round([1.005, 2.0049, 3.5, -3.5], 2)
sk := sum([1, 2, 3] · [4, 5, 6])
druhy := [10, 20, 30][2]
soucet_kumu := sum(cumsum([1, 2, 3]))
nejvyssi := max([1, 5, 2])
porovnej := [1, 2, 3] - mean([1, 2, 3])
kum_f := cumsum([100 CZK, 200 CZK, 300 CZK])
mena_z := sum([100 CZK, 200 CZK]) · 1.05
round_mena := round(1234.5678 CZK, 2)
