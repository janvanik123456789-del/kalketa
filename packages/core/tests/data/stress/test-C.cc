# Zátěžový test C — list musí poznat nesmysly
"Každá řádka níže je záměrně špatně (kromě těch označených 'v pořádku'). Očekávání je, že program ohlásí chybu a trefí její druh; mlčenlivý souhlas je nález."

## C1 — rozměry a jednotky
c1 := 5 m + 2 s                    ' OČ: chyba jednotek
c2 := sqrt(-4)                     ' OČ: chyba (odmocnina ze záporného)
c3 := sin(30 mm)                   ' OČ: chyba, goniometrie chce bezrozměrný argument
c4 := 2 kW + 5 m^2                 ' OČ: chyba jednotek

## C2 — jména
c5 := neco_nezname·2               ' OČ: nedefinované jméno
c6 := 3 m                          ' první definice
c6 := 4 m                          ' OČ: druhé definování téhož jména
c7 := c8 + 1                       ' OČ: jméno definované až pod sebou
c8 := c7 + 1                       ' OČ: navazuje na předchozí chybu

## C3 — teplota a datum
c9 := 20 °C + 30 °C                ' OČ: dvě absolutní teploty sečíst nejde
c10 := 2026-09-29 + 2026-10-29     ' OČ: dvě data sečíst nejde
c11 := 1 d - 1 h                   ' OČ: v pořádku, 23 h (kontrola, že ne vše je chyba)

## C4 — matice
K_c := [4, -2 | -2, 4]             ' OČ: v pořádku
c12 := K_c + identity(3)           ' OČ: nesouhlasí rozměry
c13 := inverse([1, 2 | 2, 4])      ' OČ: singulární matice
c14 := det([1, 2, 3 | 4, 5, 6])    ' OČ: det chce čtvercovou matici

## C5 — funkce a řešič
c15 := sqrt(4, 9)                  ' OČ: špatný počet argumentů
c16 := max_of(x^2, x: 0 m)         ' OČ: špatný zápis rozsahu
solve c17: c17^2 == -1 in 0 .. 10  ' OČ: solve nevede na kořen
c18(x) := c18(x) + 1               ' OČ: rekurze
c19 := sqrt                        ' OČ: holé jméno funkce není volání

## C6 — tabulky
table T_c:
    | polo | hod [mm] |
    | a | 10 |
    | b |    |
c20 := T_c.hod[2]                  ' OČ: prázdná buňka
c21 := pick(T_c, "z")              ' OČ: takový řádek v tabulce není

## C7 — grafy
c22 := plot(sin(x), x: 0 .. 3)     ' OČ: graf nelze přiřadit do proměnné
plot(sin(x) + 1 m, x: 0 .. 3, ylim: 0 .. 2)   ' OČ: bezrozměrné plus metry
plot(sin(x), x: 0 .. 3, kind: "kruhove")      ' OČ: neznámý druh grafu

## C8 — text
"Věta s citací, kterou list nezná. [XX:T9]" [XX:T9]   ' OČ: neznámá citace