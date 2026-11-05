# Splátkový kalendář úvěru s rovnoměrnou splátkou
"Vlastní zadání: spotřebitelský úvěr 300 000 Kč se splácí 36 měsíčními splátkami stejné výše při roční úrokové sazbě 6 %, úročení měsíčně. Hledáme výši splátky a pro každý měsíc úrok, úmor a zbývající dluh. Každý řádek kalendáře čte zůstatek z řádku nad sebou. Poplatky ani zaokrouhlování banky neuvažujeme."
"Zdroj: vlastní zadání, ověřeno uzavřeným vzorcem pro zůstatek (oddíl 4 listu) a nezávisle v Pythonu (vrstva Kontrola v Pythonu)."

## Zadání
P := 300000 Kč           ' výše úvěru
i_r := 6 %               ' roční úroková sazba
n := 36                  ' počet měsíčních splátek

## Výše splátky
"Splátka je anuita: současná hodnota všech splátek se rovná úvěru."
r := i_r/12
pay := P·r/(1 - (1 + r)^(-n)) | Kč

## Kalendář
"Úrok se počítá ze zůstatku předchozího měsíce, zbytek splátky jde na úmor. prev(B, P) je zůstatek o řádek výš, v prvním řádku úvěr P."
table Splatky: {rows=1..n}
    | k | urok [Kč] {0.00} = prev(B, P)·r | umor [Kč] {0.00} = pay - urok | B [Kč] {0.00} = prev(B, P) - umor |
    | Celkem | Σ | Σ | |
plot(Splatky.urok, Splatky.umor, x: Splatky.k, title: "Rozdělení splátky na úrok a úmor", xlabel: "Měsíc", ylabel: "Kč")
plot(Splatky.B, x: Splatky.k, title: "Zbývající dluh", xlabel: "Měsíc", ylabel: "Kč")

## Souhrn
urok_1 := Splatky.urok[1] | Kč
urok_n := Splatky.urok[n] | Kč
U := sum(Splatky.urok) | Kč
placeno := n·pay | Kč
podil := U/P | %
i_ef := (1 + r)^12 - 1 | %

## Posudky
"Zůstatek po dvanácti splátkách umí i uzavřený vzorec, bez kalendáře. Má vyjít stejně jako dvanáctý řádek tabulky."
B_12 := P·(1 + r)^12 - pay·((1 + r)^12 - 1)/r | Kč
check "Po poslední splátce nezbývá dluh": abs(Splatky.B[n]) ≤ 0.01 Kč
check "Úmory dají dohromady celý úvěr": abs(sum(Splatky.umor) - P) ≤ 0.01 Kč
check "Úroky jsou rozdíl zaplaceného a půjčeného": abs(U - (placeno - P)) ≤ 0.01 Kč
check "Zůstatek po 12 splátkách jako z uzavřeného vzorce": abs(Splatky.B[12] - B_12) ≤ 0.01 Kč
"Splátka je 9 126,58 Kč a úroky za tři roky dají 28 556,92 Kč, tedy 9,52 % úvěru. Z první splátky jde na úrok 1 500 Kč, z poslední jen 45,41 Kč: splátka je stále stejná, ale její rozdělení se postupně přesouvá k úmoru."
