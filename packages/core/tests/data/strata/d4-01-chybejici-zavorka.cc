# Dávka 4 – list 01: chybějící pravá závorka uprostřed listu
Q := 2.5 l/s                    ' průtok vody
d := 32 mm                      ' světlost potrubí
A := pi*d^2/4 | mm^2
v := Q/(pi*d^2/4 | m/s          ' CHYBA: chybí pravá závorka za jmenovatelem
rho := 1000 kg/m^3              ' hustota vody
Re := rho*v*d/(1e-3 Pa*s)       '_dependuje_na_radku_s_chybou
F := rho*9.81 m/s^2*0.5 m^3 | kN ' tíha 0,5 m³ vody
t := 30 s                       ' čtvrtý řádek za chybou
