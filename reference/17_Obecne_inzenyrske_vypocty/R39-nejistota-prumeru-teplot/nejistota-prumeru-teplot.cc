# Nejistota průměrné maximální denní teploty z 22 měření
"Podle příkladu E2 Surface Temperature z NIST Technical Note 1900 (A. Possolo, 2015): maximální denní teplota odečtená rtuťovým maximálním teploměrem v meteorologické budce v areálu NIST v květnu 2012, 22 dnů. Měřená veličina je průměr skutečných denních maxim; odečty jsou nezávislé, normálně rozdělené kolem něj. Nejistota kalibrace teploměru se zanedbává. Úloha: odhadnout tento průměr a 95% interval, v němž leží."
"Zdroj: https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.1900.pdf (veřejné dílo vlády USA)"

## Zadání
table Kveten:
    | den | t [°C] {0.00} |
    | 1   | 18.75 |
    | 2   | 28.25 |
    | 3   | 25.75 |
    | 4   | 28.00 |
    | 7   | 28.50 |
    | 8   | 20.75 |
    | 9   | 21.00 |
    | 10  | 22.75 |
    | 11  | 18.50 |
    | 14  | 27.25 |
    | 15  | 20.75 |
    | 16  | 26.50 |
    | 17  | 28.00 |
    | 18  | 23.25 |
    | 21  | 28.00 |
    | 22  | 21.75 |
    | 23  | 26.00 |
    | 24  | 26.50 |
    | 25  | 28.00 |
    | 29  | 33.25 |
    | 30  | 32.00 |
    | 31  | 29.50 |

## Průměr a směrodatná odchylka
m := len(Kveten.t)
t_avg := mean(Kveten.t)
s := stdev(Kveten.t)

## Standardní a rozšířená nejistota
u := s/sqrt(m)
ν := m - 1
k := tinv(0.975, ν)
U := k·u
t_low := t_avg - U
t_high := t_avg + U
"95% interval pokrytí pro průměrnou maximální teplotu je od t_low do t_high."
"Výsledek: průměrná maximální teplota je (25,59 ± 1,81) °C, tedy 23,8 až 27,4 °C, jako ve zdroji. Interval se týká průměru, ne jednotlivých dní: ty kolísají od 18,5 do 33,3 °C."

## Graf
l_avg(d) := t_avg
l_low(d) := t_low
l_high(d) := t_high
plot(Kveten.t, l_avg(d), l_low(d), l_high(d), d: Kveten.den, title: "Denní maxima, průměr a 95% interval", xlabel: "den v květnu", ylabel: "t [°C]")
