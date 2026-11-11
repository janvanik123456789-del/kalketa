# Dávka 7 – list 08: filter s podmínkou na dva sloupce; find_max se shodou dvou maxim
table Profily:
    | označení | A [cm²] | W [cm³] | hmotnost [kg/m] |
    | IPE 200 | 28.5 | 220.6 | 22.4 |
    | IPE 300 | 39.1 | 430.3 | 31.7 |
    | HEA 200 | 53.8 | 388.9 | 42.3 |
    | HEA 300 | 74.8 | 780.6 | 58.9 |
    | IPE 400 | 53.8 | 743.1 | 42.3 |
vyber := filter(Profily, where: r.A ≥ 40 cm² and r.W ≥ 400 cm³)
hmotnosti := vyber.hmotnost
soucet_h := sum(hmotnosti) | kg/m
pocet := len(hmotnosti)
A_nej := find_max(Profily, by: A).A | cm²
jmeno := find_max(Profily, by: A).označení
W_nej := find_max(vyber, by: W).W | cm³
table Dvojice:
    | označení | A [cm²] |
    | vzorek 1 | 12 |
    | vzorek 2 | 12 |
    | vzorek 3 | 9 |
A_shoda := find_max(Dvojice, by: A).A | cm²
jmeno_shoda := find_max(Dvojice, by: A).označení
