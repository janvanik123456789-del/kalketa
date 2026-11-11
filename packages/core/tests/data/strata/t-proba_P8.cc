# Sonda P8 — data v tabulce, kroky po měsících, days360, round, cumsum
mesic := 2026-01-31 + 1 mesic
mesic2 := 2026-01-31 + 1 month
den := 2026-01-31 + 30 d
rok := 2026-01-31 + 1 rok
rozdil := 2026-02-28 - 2026-01-31
d360a := days360(2026-01-31, 2026-02-28)
d360b := days360(2026-01-15, 2026-07-15)
r1 := round(1234.5678, 2)
r2 := round(1234.5, 0)
r3 := round(1235.5, 0)
r4 := round(-1234.5, 0)
r5 := round(0.125, 2)
radek := [10, 20, 30, 40]
kum := cumsum(radek)
posledni := radek[4]
delka := len(radek)
table Urok: {rows=1..4}
| n | Z = prev(Z, 100000 Kc) · (1 + 0.05 / 12) - 8000 Kc |
srovnani := Urok.Z[3]
table Data:
| datum | spl |
| 2026-01-31 | 100 |
| 2026-02-28 | 200 |
| 2026-03-31 | 300 |
prvni_datum := Data.datum[1]
vybrany := pick(Data, 2026-02-28).spl
najity := find_max(Data, by: spl)
