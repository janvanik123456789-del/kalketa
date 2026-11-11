# 11 — operace s řadami: kumulativní součty, diferenCe, pojištění posloupnosti
# Reference: ruční výpočet a identity (druhá operace vrací první).

n := [1, 2, 3, 4, 5, 6]
sct := cumsum(n)
soucin := cumprod(n)
rozdil := diff(sct)
prvni := diff(n)
obrat := diff(diff(n))

rev := reverse(n)
posledni := last(n)
delka := len(n)
rozsah := range(2, 10, 1)
s_meritkem_r := range(0 m, 10 m, 2.5 m)
rovnomo := linspace(0, 1, 5)

druhe(x) := x^2
kazdy := each(druhe, n)
ktam := sum(n^2)
odmocniny := srss([3, 4])
ctverce := sumsq(n)

s_meritkem := cumsum([1, 2, 3] m)
dif_meritko := diff([1, 2, 3] m)
podil := diff([1, 4, 9] m) / diff([1, 2, 3] s)

check "diff je inverzní k cumsum": sum(rozdil) == 20
check "druhá diference lineární řady je nula": sum(obrat) == 0
check "součin řady": soucin[6] == 720
check "srss(3,4) je 5": abs(odmocniny - 5) < 1e-13
check "linspace má 5 bodů": len(rovnomo) == 5
check "rozsah od 2 do 10 má 9 členů": len(rozsah) == 9 and rozsah[1] == 2
check "rozsah s jednotkou": len(s_meritkem_r) == 5
check "meritka se chovají podle pravidel": abs(sum(podil) / (m / s) - 8) < 1e-13
