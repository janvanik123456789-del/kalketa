# Proložení přímkou – deset bodů přesné přímky

"Body leží přesně na přímce y = 2,5·x + 1, metoda nejmenších čtverců musí vrátit stejné koeficienty."
table Body:
    | x | y |
    | 0 | 1 |
    | 1 | 3.5 |
    | 2 | 6 |
    | 3 | 8.5 |
    | 4 | 11 |
    | 5 | 13.5 |
    | 6 | 16 |
    | 7 | 18.5 |
    | 8 | 21 |
    | 9 | 23.5 |
f := fit(Body.y, x: Body.x, kind: "linear")
"Koeficienty se čtou od nejvyšší mocniny: f[1] je směrnice, f[2] úsek."
smernice := f[1]
usek := f[2]
check "Směrnice 2,5": abs(smernice - 2.5) < 1e-9
check "Úsek 1": abs(usek - 1) < 1e-9
"Koeficient Determinační R² je přesně jedna, rozptyl bodů kolem přímky nulový."
R2 := fit_r2(f)
s_bodu := fit_s(f)
check "R² rovna jedné": R2 == 1
check "Bodová odchylka nulová": s_bodu < 1e-12
