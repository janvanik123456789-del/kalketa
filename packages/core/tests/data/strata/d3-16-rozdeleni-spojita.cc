# 16 — normální, Studentovo, chí-kvadrát a F rozdělení
# Reference: mpmath (erf, betainc, gammainc) na 30 číslic. Návratovost cdf/inv je
# metamorfická relace — nezávisí na referenční hodnotě.

n0 := normcdf(0)
n196 := normcdf(1.96)
nm3 := normcdf(-3)
n_posun := normcdf(2, 1, 0.5)
n_zpet := norminv(normcdf(0.7))
n_hodnota := norminv(0.975)
n_hustota := normpdf(0)
n_pdf_integral := integral(normpdf(x), x: -8 .. 8)

t_2132 := tcdf(2.131846786, 15)
t_zpet := tinv(tcdf(1.2, 7), 7)
t_kritic := tinv(0.975, 5)
t_tezsi := tcdf(5, 2)

c_25 := chi2cdf(25, 12)
c_maly := chi2cdf(0.1, 2)
c_zpet := chi2inv(chi2cdf(7.3, 4), 4)
c_inv := chi2inv(0.95, 3)

f_35 := fcdf(3.5, 5, 10)
f_zpet := finv(fcdf(2.4, 3, 20), 3, 20)
f_inv := finv(0.95, 4, 8)
f_velka := fcdf(100, 2, 3)

check "normcdf(0) je 1/2": abs(n0 - 0.5) < 1e-15
check "norminv je inverzní k normcdf": abs(n_zpet - 0.7) < 1e-12
check "tinv je inverzní k tcdf": abs(t_zpet - 1.2) < 1e-10
check "chi2inv je inverzní": abs(c_zpet - 7.3) < 1e-10
check "finv je inverzní": abs(f_zpet - 2.4) < 1e-10
check "hustota na R integrál 1": abs(n_pdf_integral - 1) < 1e-9
check "normcdf(1.96) je skoro 0.975": abs(n196 - 0.9750021048517795) < 1e-12
