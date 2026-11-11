# Dávka 5 – list 07: erf, erfc a normcdf v ocáscích; norminv u 0 a 1
e1 := erf(8)
e2 := erfc(8)                  ' 1 – erf(8) -> ocásek
e3 := erf(-8)
e4 := erfc(-8)
e5 := erf(20)
e6 := erfc(20)
c1 := normcdf(8)
c2 := normcdf(-8)
c3 := normcdf(-20)
c4 := normcdf(20)
i1 := norminv(1e-12)
i2 := norminv(1 - 1e-12)
i3 := norminv(1e-300)          ' extremní kvantil
