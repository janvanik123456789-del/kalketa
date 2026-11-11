# Sonda P12 — kalendářní aritmetika, přístup do datumového sloupce, výsledek find_max
ctvrty := 2026-01-31 + 1 month
dt1 := 2026-03-02 - 2026-02-28
dt2 := (2026-01-31 + 1 month) - 2026-01-31
dt3 := (2026-02-01 + 1 month) - 2026-02-01
dt4 := (2026-01-31 + 12 month) - 2026-01-31
dt5 := (2026-05-31 + 1 month) - 2026-05-31
dt6 := (2026-06-30 + 1 month) - 2026-06-30
dt7 := (2026-03-15 + 1 month) - 2026-03-15
rovnost := (2026-03-02 - 2026-02-28) - 2 d
table Splat:
    | k | datum | sazba |
    | 1 | 2026-01-31 | 0.05 |
    | 6 | 2026-06-30 | 0.065 |
    | 9 | 2026-09-30 | 0.072 |
sest := pick(Splat, 6).datum
sazba6 := pick(Splat, 6).sazba
veterany := Splat.sazba
daty := Splat.datum
table Uroky: {rows=1..4}
    | k | U = prev(Z, 100000) · 0.005 · k |
redek := find_max(Uroky, by: U)
klen := find_max(Uroky, by: U).k
du := find_max(Uroky, by: U).U
minimum := find_min(Uroky, by: U).k
