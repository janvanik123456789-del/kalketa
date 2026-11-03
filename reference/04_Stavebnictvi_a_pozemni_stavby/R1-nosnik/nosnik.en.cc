# Check of beam N1
"Reference calculation R1: the section and the material are selected from the tables of the sheet."

## Input
L := 5 m                                   ' span of the simply supported beam
q := 12 kN/m                               ' uniform load
material := pick(Materialy, "S235")
profil := pick(Profily_IPE, "IPE 200")

## Calculation
M_Ed := q·L²/8                             | kN·m
σ := M_Ed / profil.W_y                     | MPa
w := 5·q·L⁴ / (384·material.E·profil.I_y)  | mm
w_lim := L/250                             | mm

## Checks
check "Bending": σ ≤ material.f_y             source "EN 1993-1-1, 6.2.5"
check "Deflection": w ≤ w_lim                  source "EN 1990, A1.4 (L/250)"

## Design of the lightest suitable section
profil_min := find_min(Profily_IPE, by: G,
    where: M_Ed / r.W_y ≤ material.f_y and 5·q·L⁴ / (384·material.E·r.I_y) ≤ w_lim)
G_min := profil_min.G
σ_min := M_Ed / profil_min.W_y                          | MPa
w_min := 5·q·L⁴ / (384·material.E·profil_min.I_y)      | mm
check "Bending, designed section": σ_min ≤ material.f_y    source "EN 1993-1-1, 6.2.5"
check "Deflection, designed section": w_min ≤ w_lim         source "EN 1990, A1.4 (L/250)"
