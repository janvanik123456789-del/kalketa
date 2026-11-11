# 22 — tabulky: filtr, výběr, interpolace, prázdné buňky, datum
# Reference: hodnoty si ověřuji ručně (tabulka je malá a přesná), u data pak
# porovnáním s dnem v roce podle definice ISO.

table Profily:
    | označení | h [mm] | A [cm²] | I [cm⁴] |
    | IPE 100 | 100 | 10.3 | 171 |
    | IPE 120 | 120 | 13.2 | 277 |
    | IPE 140 | 140 | 16.4 | 400 |
    | IPE 160 | 160 | 20.1 | 541 |
    | IPE 180 | 180 | 23.9 | 714 |

maly := filter(Profily, where: r.h ≤ 140 mm).h
vybrany := find_min(Profily, by: I, where: r.A ≥ 13 cm²)
nejvetsi := find_max(Profily, by: I).označení
interpolace := interpolate(Profily, h: 130 mm)
interpolovane_I := interpolate(Profily, h: 130 mm).I
mimo_tabulku := interpolate(Profily, h: 500 mm)
podklad := pick(Profily, "IPE 140").I
chybejici := pick(Profily, "IPE 999").I

table Mereni:
    | t [s] | T [°C] |
    | 0 | 20 |
    | 1 |   |
    | 2 | 24 |
    | 3 | 26 |

radek := Mereni.T
prazdny_radek := Mereni.T[2]
filtr_s_prazdnym := filter(Mereni, where: r.T ≥ 21 °C).t
nejmensi_s_prazdnym := find_min(Mereni, by: T).t

table Kurzy:
    | datum | EUR |
    | 2026-03-01 | 25.40 |
    | 2026-06-30 | 25.62 |
    | 2026-12-31 | 25.88 |

dny := 2026-12-31 - 2026-03-01
posledni := Kurzy.EUR[3]
nejcerstvejsi := find_max(Kurzy, by: datum).EUR
podle_data := pick(Kurzy, 2026-06-30).EUR

check "filtr vybere tři profily": sum(maly) == 360 mm and len(maly) == 3
check "nejmenší I při A ≥ 13 je IPE 120": vybrany.označení == "IPE 120"
check "největší I je IPE 180": nejvetsi == "IPE 180"
check "interpolace uprostřed": abs(interpolovane_I / 338.5 cm^4 - 1) < 1e-12
check "pick vrací přesnou hodnotu": podklad == 400 cm^4
check "počet dnů březen až december": dny == 305 d
check "filtr přeskočí prázdnou buňku": len(filtr_s_prazdnym) == 2
