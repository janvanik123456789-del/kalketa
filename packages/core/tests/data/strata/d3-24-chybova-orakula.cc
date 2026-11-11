# 24 — chybová orákula: hlásí jádro chybu na pravém místě a s pravdivým důvodem?
# Každý řádek je záměrně špatně; hodnotím, jestli text odpovídá skutečné podstatě
# a jestli souřadnice (řádek:sloupec) ukazují na chybné místo.

spravne := 2·3
chybna_funkce := neexistuje(3)
spatny_pocet := sqrt(4, 9)
zaporny_log := ln(-2)
nula_log := ln(0)
zaporny_sqrt := sqrt(-9)
mocnina_nuly := 0^0
deleni_nulou := 5 / 0
nekonecno := 1e308·10
moc_nekonecno := 1e308^3
rozdil_jednotek := 3 m + 2 s
prevod_casu := 3 m | s
mocnina_s_jednotkou := (3 m)^2.5
sictani_textu := "abc" + 1
prazdna_rada := mean([])
kvantil_mimo := quantile([1, 2, 3], 1.5)
mimo_obor := [1, 2, 3][7]
riadeni_mimo := [1, 2 | 3, 4][5, 1]
zaporny_index := [1, 2, 3][-1]
faktorial_zaporny := factorial(-3)
faktorial_netvary := factorial(2.5)
kombinace_mimo := nchoosek(5, 7)
deleni_nulou_mod := mod(5, 0)
nerovnake_rady := sum([1, 2, 3] + [1, 2])
matice_nesedi := [1, 2 | 3, 4]·[1, 2, 3]
krateni_nuly := [0, 0] / [0, 0]
log_zerova_mocnina := 1^0.5
check "výše platného řádku je 6": spravne == 6
