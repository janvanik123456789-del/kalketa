# Dávka 4 – list 03: proměnná definovaná dvakrát
L := 6 m                         ' délka nosníku
q := 10 kN/m                     ' spojitý zatížení
M := q*L^2/8 | kN*m              ' uses the first L
L := 8 m                         ' CHYBA: L už je definováno výše
A := pi*(1 m)^2 | cm^2           ' řádek nezávislý na L
F := q*L/2 | kN                  'uses which L?
