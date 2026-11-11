# Sonda P9 — odsazení těl tabulek, měna, kalendářní posun po měsících
mesic1 := 2026-01-31 + 1 month
mesic2 := 2026-02-01 + 1 month
mesic3 := 2026-01-31 + 2 month
konec := 2026-01-31 + 12 month
mena := 1000 Kc
mena2 := 1000 CZK
mena3 := 1000 EUR
table Urok: {rows=1..4}
    | n | Z = prev(Z, 100000) · (1 + 0.05 / 12) - 8000 |
treti := Urok.Z[3]
table Data:
    | datum | spl |
    | 2026-01-31 | 100 |
    | 2026-02-28 | 200 |
    | 2026-03-31 | 300 |
prvni := Data.datum[1]
sloupec := Data.spl
vybrany := pick(Data, 2026-02-28).spl
max_spl := find_max(Data, by: spl)
filtr := filter(Data, where: r.spl > 150).spl
table Kal: {rows=1..4}
    | k | D = prev(D, 2026-01-31) + 1 month |
posun := Kal.D[3]
