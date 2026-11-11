# 20 — náhodná čísla: opakovatelnost semínkem, rozsah, statistické vlastnosti
# Reference: determinismus (stejná semínka = stejná čísla) a statistické meze
# ze střední hodnoty a směrodatné odchylky jednotkového rozdělení.

a1 := rnd(6, 42, 0, 1)
a2 := rnd(6, 42, 0, 1)
a3 := rnd(6, 99, 0, 1)
rozsah := rnd(4, 7, -10, 10)
celocisla := rnd(5, 3, 1, 6)
nula_polozek := rnd(0, 1, 0, 1)
obráceny := rnd(3, 5, 5, -5)

n := 4000
velky_vzor := rnd(n, 2026, 0, 1)
prumer := mean(velky_vzor)
sd := stdev(velky_vzor)
minimum := min(velky_vzor)
maximum := max(velky_vzor)

normalni := rndn(n, 77, 0, 1)
n_prumer := mean(normalni)
n_sd := stdev(normalni)
pocet_zapornych := sum(if(normalni < 0, 1, 0))

sigma := 1 / sqrt(12·n)
check "stejná semínka davaji stejna cisla": sum(abs(a1 - a2)) == 0
check "jina seminka davaji jina cisla": sum(abs(a1 - a3)) > 0
check "hodnoty jsou v rozsahu": minimum ≥ 0 and maximum < 1
check "prumer je v trem sigma": abs(prumer - 0.5) < 3·sigma
check "směrodatná odchylka jednotkového rozdělení": abs(sd - 1 / sqrt(12)) < 3 · (1 / sqrt(12)) / sqrt(2·(n - 1))
check "normální vzorek má průměr blízko nule": abs(n_prumer) < 3 / sqrt(n)
check "normální vzorek má rozptyl blízko 1": abs(n_sd - 1) < 3 / sqrt(2·(n - 1))
check "záporných je zhruba polovina": abs(pocet_zapornych / n - 0.5) < 3 · 0.5 / sqrt(n)
