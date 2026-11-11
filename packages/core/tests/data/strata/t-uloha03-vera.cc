# Úloha 03 — úvěr 250 000 CZK, 12 měsíčních splátek, tři sazby, konstantní anuita
# Zadání: leden a únor 5,00 % p.a., březen až červen 6,50 %, červenec až prosinec 7,20 %.
# Splatka se určí anuitním vzorcem z lednové sazby a už se nemění; úrok se zaokrouhluje na haléře.
# Očekávané hodnoty: uloha03-vera.ref.py (Fraction + Decimal, ROUND_HALF_UP).
P := 250000 CZK
sazby := [0.05, 0.05, 0.065, 0.065, 0.065, 0.065, 0.072, 0.072, 0.072, 0.072, 0.072, 0.072]
mesicni := sazby / 12
i0 := 0.05 / 12
anuita := P · i0 / (1 - (1 + i0)^(-12))
splatka := round(anuita, 2)
table Kalendář: {rows=1..12}
    | k | U = round(prev(Z, P) · mesicni[k], 2) | J = splatka - round(prev(Z, P) · mesicni[k], 2) | Z = prev(Z, P) + round(prev(Z, P) · mesicni[k], 2) - splatka |
z6 := Kalendář.Z[6]
z11 := Kalendář.Z[11]
z12 := Kalendář.Z[12]
soucet_uroku := sum(Kalendář.U)
soucet_jistin := sum(Kalendář.J)
kontrolni_rovnice := sum(Kalendář.U) + sum(Kalendář.J)
nejvyssi_urok := max(Kalendář.U)
mesic_nejvyssi := find_max(Kalendář, by: U).k
mesic_nejnizsi := find_min(Kalendář, by: U).k
nad_sto_tisic := filter(Kalendář, where: r.Z > 100000 CZK).k
pocet_nad := len(nad_sto_tisic)
doplatek := z11 · (1 + 0.072 / 12)
naklady := 12 · splatka + z12 - P
podil := naklady / P
A_k := cumprod(1 + mesicni)
R_k := cumsum(1 / A_k)
Z_vzorec := P · A_k - anuita · A_k · R_k
table Splatnost:
    | k | datum | sazba |
    | 1 | 2026-01-31 | 0.05 |
    | 2 | 2026-02-28 | 0.05 |
    | 3 | 2026-03-31 | 0.065 |
    | 4 | 2026-04-30 | 0.065 |
    | 5 | 2026-05-31 | 0.065 |
    | 6 | 2026-06-30 | 0.065 |
    | 7 | 2026-07-31 | 0.072 |
    | 8 | 2026-08-31 | 0.072 |
    | 9 | 2026-09-30 | 0.072 |
    | 10 | 2026-10-31 | 0.072 |
    | 11 | 2026-11-30 | 0.072 |
    | 12 | 2026-12-31 | 0.072 |
datum_6 := pick(Splatnost, 6).datum
sazba_9 := pick(Splatnost, 9).sazba
doba := 2026-12-31 - 2026-01-31
d360 := days360(2026-01-31, 2026-12-31)
month_delka := (2026-01-31 + 1 month) - 2026-01-31
rok_delka := (2026-01-31 + 12 month) - 2026-01-31
unor := 2026-02-28 - 2026-01-31
check "anuita": abs(anuita / (21401.8704471167803 CZK) - 1) < 1e-12
check "anuita po zaokrouhlení": abs(splatka - 21401.87 CZK) < 1e-9 CZK
check "zůstatek po 6. splátce (zaokrouleně)": abs(z6 - 127458.72 CZK) < 1e-9 CZK
check "zůstatek po 11. splátce": abs(z11 - 23027.45 CZK) < 1e-9 CZK
check "zůstatek po 12. splátce": abs(z12 - 1763.74 CZK) < 1e-9 CZK
check "součet úroků": abs(soucet_uroku - 8586.18 CZK) < 1e-9 CZK
check "součet jistin": abs(soucet_jistin - 248236.26 CZK) < 1e-9 CZK
check "identita jistina minus konečný zůstatek": abs(soucet_jistin - (P - z12)) < 1e-6 CZK
check "identita úroky plus jistiny": abs(kontrolni_rovnice - 12 · splatka) < 1e-6 CZK
check "nejvyšší úrok je v březnu": abs(nejvyssi_urok - 1133.14 CZK) < 1e-9 CZK
check "nejvyšší úrok ve 3. měsíci": abs(mesic_nejvyssi - 3) < 1e-12
check "nejnižší úrok ve 12. měsíci": abs(mesic_nejnizsi - 12) < 1e-12
check "počet měsícu se zůstatkem nad 100 000": abs(pocet_nad - 7) < 1e-12
check "doplatek na konci": abs(doplatek / (23165.6147 CZK) - 1) < 1e-9
check "náklady úvěru": abs(naklady - 8586.18 CZK) < 1e-9 CZK
check "podíl nákladů": abs(podil / 0.03434472 - 1) < 1e-6
check "zůstatek z uzavřeného vzorce po 6 měsících": abs(Z_vzorec[6] / (127458.713785978267 CZK) - 1) < 1e-9
check "zůstatek z uzavřeného vzorce po 12 měsících": abs(Z_vzorec[12] / (1763.73841480080409 CZK) - 1) < 1e-9
check "rozdíl obou cest menší než haléř": abs(z12 - Z_vzorec[12]) < 0.01 CZK
check "6. splátka z tabulky (vrací se text)": datum_6 == "2026-06-30"
check "sazba v 9. měsíci": abs(sazba_9 / 0.072 - 1) < 1e-12
check "skutečná doba úvěru": abs(doba / (334 d) - 1) < 1e-12
check "doba podle 30/360": abs(d360 / (330 d) - 1) < 1e-12
check "month = 30,4375 dne": abs(month_delka / (30.4375 d) - 1) < 1e-12
check "12 month = 365,25 dne": abs(rok_delka / (365.25 d) - 1) < 1e-12
check "únor má 28 dní, měsíc je o 2,4375 déle": abs((month_delka - 28 d) - 2.4375 d) < 1e-9 d
