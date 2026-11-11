# 03 — přesnost elementárních funkcí
# Srovnání s referencí (mpmath, 40 číslic) — ale férově: Kalketa drží hodnoty v
# dvojité přesnosti, proto u hranicních argumentů porovnávám se vzorcem
# aplikovaným NA ZAPAMATOVANOU hodnotu vstoupního čísla. Zároveň uvádím
# odchylku proti přesnému desítkovému zadání — tam je vidět, že Kalketa nemá
# log1p ani expm1, takže relativní přesnost se ztratí už při zápisu 1 + 1e-12.

blizke1 := ln(1 + 1e-12)
blizke2 := ln(1 + 1e-8)
blizke3 := ln(1 + 1e-4)
expmalo := exp(1e-8) - 1
sqrt_dva := sqrt(2)^2
petina := 0.1 + 0.2

velky1 := sin(1e10)
velky2 := cos(1e12)
velky3 := tan(1e8)
velky4 := sin(1e16)
stredni := sin(1e6)

odmocnina := 2^0.5
log_tri := log(1000, 10)
log_dva := log(8, 2)
desit_zaporna := exp(ln(1e-300))

# referenční hodnoty z _tools/ref_vystup.txt (mpmath na zapamatovaném vstupu)
check "ln(1+1e-12) sedí na libm": abs(blizke1 / 1.000088900581841e-12 - 1) < 1e-13
check "ln(1+1e-8) sedí na libm": abs(blizke2 / 9.999999889225291e-9 - 1) < 1e-13
check "exp(1e-8)-1 sedí na libm": abs(expmalo / 9.9999999392252903e-9 - 1) < 1e-13
check "sqrt(2)^2": abs(sqrt_dva - 2) < 1e-15
check "0.1 + 0.2": abs(petina - 0.3) < 1e-16
check "sin(1e10)": abs(velky1 - (-0.48750602508751067)) < 1e-14
check "cos(1e12)": abs(velky2 - 0.79144630185289022) < 1e-14
check "tan(1e8)": abs(velky3 - (-2.5637789067283774)) < 1e-13
check "sin(1e16)": abs(velky4 - 0.77968800660697879) < 1e-13
check "sin(1e6)": abs(stredni - (-0.34999350217129294)) < 1e-14
check "log(1000, 10) je 3": abs(log_tri - 3) < 1e-15
check "log(8, 2) je 3": abs(log_dva - 3) < 1e-15
check "exp(ln(1e-300)) se vrátí": abs(desit_zaporna / 1e-300 - 1) < 1e-13
