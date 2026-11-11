# 19 — parametrická rozdělení: exponenciální, Weibullovo, lognormální, gama
# Reference: mpmath (gammainc) na 30 číslic. Metamorfické relace: derivace CDF je PDF
# a integrál přes hustotu je 1.

e_pdf := exppdf(1, 2)
e_cdf := expcdf(1, 2)
e_nula := exppdf(0, 2)
e_prekvapeni := 1 - expcdf(3, 2)
e_zpet := derivative(expcdf(x, 2), x: 1.5)
e_pdf_hodnota := exppdf(1.5, 2)
e_integral := integral(exppdf(x, 2), x: 0 .. 40)

w_pdf := wblpdf(2, 1.5, 1.8)
w_cdf := wblcdf(2, 1.5, 1.8)
w_characteristika := wblcdf(1.8, 1.5, 1.8)
w_slim := wblcdf(0, 1.5, 1.8)
w_der := derivative(wblcdf(x, 1.5, 1.8), x: 2)

l_pdf := lognpdf(2, 0, 1)
l_cdf := logncdf(2, 0, 1)
l_median := exp(logncdf(2, 0, 0.0001)·0 + 0)
l_stred := exp(0 + 1^2 / 2)
l_zpet := derivative(logncdf(x, 0, 1), x: 2)

g_pdf := gampdf(2, 2, 1)
g_cdf := gamcdf(2, 2, 1)
g_cdf1 := gamcdf(1, 1, 1)
g_mean := 2·1
g_der := derivative(gamcdf(x, 2, 1), x: 2)

check "exppdf(1,2) je 0.5·e^-0.5 (MATLAB: měřítko)": abs(e_pdf / (0.5·exp(-0.5)) - 1) < 1e-12
check "derivace CDF je PDF (exp)": abs(e_zpet / e_pdf_hodnota - 1) < 1e-6
check "integrál hustoty je 1 (exp)": abs(e_integral - 1) < 1e-6
check "weibull cdf(1.8; 1.5, 1.8)": abs(w_characteristika - (1 - exp(-(1.8/1.5)^1.8))) < 1e-12
check "weibull cdf(0) je 0": w_slim == 0
check "derivace CDF je PDF (weibull)": abs(w_der / w_pdf - 1) < 1e-5
check "lognormální cdf(2;0,1) = Φ(ln 2)": abs(l_cdf - 0.7558914042144173) < 1e-10
check "gama cdf(1,1,1) je 1−e^-1": abs(g_cdf1 - (1 - exp(-1))) < 1e-12
check "derivace CDF je PDF (gama)": abs(g_der / g_pdf - 1) < 1e-5
