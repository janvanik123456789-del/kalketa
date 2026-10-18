# Odpor termistoru NTC mezi body katalogové tabulky: interpolace a model B
"Katalog termistoru NTC 10 kΩ udává odpor po 10 °C. Potřebujeme odpor při teplotě mezi body tabulky. Porovnáme interpolaci lomenou čarou, kubickým splinem a pchip (zkratky jako v MATLABu) s výpočtem z modelu B termistoru. Tabulka je spočtená z modelu B (R_25 = 10 kΩ, B = 3950 K) a zaokrouhlená na 4 platné číslice jako v katalozích, přesnou hodnotu tedy známe a chybu každé metody lze spočítat."

## Tabulka z katalogu
table NTC: {across}
    | T [°C] {0} | R [kΩ] {0.000} |
    | 0          | 33.62          |
    | 10         | 20.17          |
    | 20         | 12.54          |
    | 30         | 8.037          |
    | 40         | 5.301          |
    | 50         | 3.588          |
    | 60         | 2.486          |
    | 70         | 1.76           |
    | 80         | 1.27           |
    | 90         | 0.9336         |
    | 100        | 0.6975         |
T_1 := 37 °C                    ' teplota, pro kterou odpor hledáme

## Interpolace mezi body
"Lomená čára spojí sousední body přímkou, kubický spline vede body hladkou křivkou (spojitá první i druhá derivace), pchip je kubika, která zachová tvar dat a mezi body nepřekmitne:"
R_lin := interp1(NTC.T, NTC.R, T_1) | kΩ
R_spl := spline(NTC.T, NTC.R, T_1) | kΩ
R_pch := pchip(NTC.T, NTC.R, T_1) | kΩ

## Model B termistoru
"Odpor NTC klesá s teplotou exponenciálně, R = R_25·e^(B·(1/T − 1/T_25)), s termodynamickou teplotou T v kelvinech. Teploty proto převedeme na K. Konstantu B určíme z krajních bodů tabulky (katalogy ji tak uvádějí jako B_0/100):"
T_0 := NTC.T[1] | K
T_100 := NTC.T[11] | K
B_0100 := ln(NTC.R[1]/NTC.R[11])/(1/T_0 - 1/T_100) | K
T_1K := T_1 | K
R_B := NTC.R[1]·exp(B_0100·(1/T_1K - 1/T_0)) | kΩ
"Přesná hodnota z modelu, ze kterého je tabulka spočtená:"
R_25 := 10 kΩ
B := 3950 K
T_25 := 25 °C | K
R_ex(T) := R_25·exp(B·(1/T - 1/T_25))
R_1 := R_ex(T_1K) | kΩ

## Chyby metod
"Relativní chyba lomené čáry (δ_1), splinu (δ_2), pchip (δ_3) a modelu s B z tabulky (δ_4) proti přesné hodnotě:"
δ_1 := R_lin/R_1 - 1 | %
δ_2 := R_spl/R_1 - 1 | %
δ_3 := R_pch/R_1 - 1 | %
δ_4 := R_B/R_1 - 1 | %
check "spline do 0,1 %": abs(δ_2) < 0.1 %
check "lomená čára nestačí na 1 %": abs(δ_1) > 1 %
"Chyba po celém rozsahu tabulky: lomená čára leží mezi body vždy nad křivkou (ta je vypuklá), spline a pchip se od ní odchylují jen nepatrně a v bodech tabulky je chyba dána jen zaokrouhlením katalogu."
δ_lin(T) := interp1(NTC.T, NTC.R, T)/R_ex(T) - 1
δ_spl(T) := spline(NTC.T, NTC.R, T)/R_ex(T) - 1
δ_pch(T) := pchip(NTC.T, NTC.R, T)/R_ex(T) - 1
plot(δ_lin(T), δ_spl(T), δ_pch(T), T: T_0 .. T_100, title: "Chyba interpolace proti modelu B (teplota v K)") | %
