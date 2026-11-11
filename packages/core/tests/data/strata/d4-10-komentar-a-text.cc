# Dávka 4 – list 10: komentář a text v uvozovkách obsahují :=, == a ^
q := 10 kN/m                     ' q := 5 kN/m je jiná hodnota; platí q*L^2/8 == 180 kN*m
L := 12 m
M := q*L^2/8 | kN*m
"Maximum je M := q·L^2/8; podmínka M == 180 kN·m platí a objem je L^3."
check "Únosnost": M <= 200 kN*m
V := L^3 | m^3
