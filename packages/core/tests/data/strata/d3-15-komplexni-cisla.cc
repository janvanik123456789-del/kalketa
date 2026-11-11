# 15 — komplexní čísla: polární tvar, argument, De Moivreův vzorec
# Reference: cmath a mpmath (40 číslic). Testuji i quadrantové hlášky pro arg/atan2.

z := 3 - 4j
w := -2 + 2j
abs_z := abs(z)
arg_z := arg(z)
arg_w := arg(w)
re_z := re(z)
im_z := im(z)
konj := conj(z)
soucin_zw := z·w
podil := z / w

zpet := polar(abs_z, arg_z)
arg_exp := arg(exp(3j))
euler := exp(1j·π)
moi_abs := abs((1 + 1j)^8)
moi_re := re((1 + 1j)^8)

sqrt_z := sqrt(z)
sqrt_w := sqrt(w)
sqrt_ctverec := sqrt_z·sqrt_z

log_z := ln(z)
j_na_j := (1j)^(1j)
cislo_j := 2 + 3·1j

atan2_1 := atan2(1, 1)
atan2_2 := atan2(-1, 1)
atan2_3 := atan2(1, -1)
atan2_4 := atan2(-1, -1)
atan2_nula := atan2(0, 0)

check "abs(3-4j) je 5": abs(abs_z - 5) < 1e-15
check "arg(w) je 3π/4": abs(arg_w - 3·π/4) < 1e-13
check "zpět z polárního tvaru": abs(re(zpet) - re_z) < 1e-12 and abs(im(zpet) - im_z) < 1e-12
check "De Moivre: (1+i)^8 = 16": abs(moi_abs - 16) < 1e-12 and abs(moi_re - 16) < 1e-10
check "Eulerova identita": abs(euler + 1) < 1e-14
check "kvadrant atan2(1,-1) je 3π/4": abs(atan2_3 - 3·π/4) < 1e-14
check "atan2(0,0) má hodnotu": atan2_nula == atan2_nula
