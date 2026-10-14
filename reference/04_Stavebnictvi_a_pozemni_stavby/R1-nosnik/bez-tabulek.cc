# Posouzení nosníku N1
"Referenční výpočet R1, fáze F1: hodnoty průřezu a materiálu zadané ručně (tabulky přijdou ve fázi F2)."

## Zadání
L := 5 m                  ' rozpětí prostého nosníku
q := 12 kN/m              ' spojité zatížení
f_y := 235 MPa            ' mez kluzu S235
E := 210 GPa              ' modul pružnosti oceli
W_y := 194.3 cm³          ' IPE 200, pružný průřezový modul
I_y := 1943 cm⁴           ' IPE 200, moment setrvačnosti

## Výpočet
M_Ed := q·L²/8                     | kN·m
σ := M_Ed / W_y                    | MPa
w := 5·q·L⁴ / (384·E·I_y)          | mm
w_lim := L/250                     | mm

## Posouzení
η_M := σ / f_y                     | %
ohyb_vyhovuje := σ ≤ f_y
pruhyb_vyhovuje := w ≤ w_lim
