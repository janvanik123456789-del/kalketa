# Posouzení nosníku N1
"Referenční výpočet R1: profil a materiál se vybírají z tabulek listu."

## Zadání
L := 5 m                                   ' rozpětí prostého nosníku
q := 12 kN/m                               ' spojité zatížení
material := pick(Materialy, "S235")
profil := pick(Profily_IPE, "IPE 200")

## Výpočet
M_Ed := q·L²/8                             | kN·m
σ := M_Ed / profil.W_y                     | MPa
w := 5·q·L⁴ / (384·material.E·profil.I_y)  | mm
w_lim := L/250                             | mm

## Posouzení
check "Ohyb": σ ≤ material.f_y             source "EN 1993-1-1, 6.2.5"
check "Průhyb": w ≤ w_lim                  source "EN 1990, A1.4 (L/250)"

## Návrh nejlehčího vyhovujícího profilu
profil_min := find_min(Profily_IPE, by: G,
    where: M_Ed / r.W_y ≤ material.f_y and 5·q·L⁴ / (384·material.E·r.I_y) ≤ w_lim)
G_min := profil_min.G
σ_min := M_Ed / profil_min.W_y                          | MPa
w_min := 5·q·L⁴ / (384·material.E·profil_min.I_y)      | mm
check "Ohyb, navržený profil": σ_min ≤ material.f_y    source "EN 1993-1-1, 6.2.5"
check "Průhyb, navržený profil": w_min ≤ w_lim         source "EN 1990, A1.4 (L/250)"
