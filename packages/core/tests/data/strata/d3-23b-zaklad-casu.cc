# 23b — srovnávací základ pro měření času: tutéž úlohy jen v malé velikosti
# (Čas tohoto listu je základ — Node, načtení, parsování. Rozdíl oproti listu 23
# je práce navíc za velké úlohy.)

malá := 2000
s1 := linspace(0, 1, malá)
p1 := sum(s1)
m1 := mean(s1)
med1 := median(s1)
mx1 := max(s1)
serazene := sort(s1)
otocene := reverse(s1)
rozdil := diff(s1)
kumulativ := cumsum(s1)
histogram := hist_counts(s1, 10)

matice30 := matrix(1 / (i + j - 1), i: 1 .. 4, j: 1 .. 4)
inverze := inverse(matice30)
det := det(matice30)

fit_data_x := linspace(0, 10, 50)
fit_data_y := 3 - 2·fit_data_x + sin(fit_data_x)
prolozeni := fit(fit_data_y, x: fit_data_x, kind: "poly5")

check "součet aritmetické posloupnosti": abs(p1 / (malá / 2) - 1) < 1e-12
check "maximum je 1": mx1 == 1
