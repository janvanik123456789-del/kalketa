# Dávka 4 – list 08: check s podmínkou, kterou nelze spočítat
sigma := 150 MPa                 ' napětí v ohybu
f_y := 235 MPa                   ' mez kluzu
check "Ohyb": sqrt(-1 m^2) <= 5 m      ' CHYBA: odmocnina ze záporného čísla
tau := 40 MPa
check "Smyk": tau <= f_y/1.7
d := 10 mm
L := 12 m
