# Reactions, moments and deflection of a two-span continuous beam
"Own task: a floor beam of rolled section IPE 300 rests on three supports. It carries a uniform load over both spans and, in the middle of the longer span, a point load from a cross beam. The beam is statically indeterminate to the first degree. Kalketa solves it with the function beam and the result is verified by hand with the three-moment equation. The picture is our own."
"Source: own task, verified by the three-moment equation (section 4 of the sheet) and independently in Python (Check in Python layer)."

## Input
L_1 := 6 m
L_2 := 4.5 m
L := L_1 + L_2
q := 12 kN/m             ' uniform load over both spans
F := 30 kN               ' point load from the cross beam
a := 3 m                 ' position of the load from the left support
E := 210 GPa
f_y := 235 MPa           ' steel S235
"We assume a constant section over the whole length, loads without partial factors and a beam restrained against lateral buckling. The self-weight is part of the load q."
![Two-span beam on three supports with a uniform load q and a point load F](images/nosnik.svg){width=80%}

## Section
"i_section calculates the properties from the dimensions of the section, fillets included. The table values are compared in the checks."
prurez := i_section(300 mm, 150 mm, 7.1 mm, 10.7 mm, 15 mm)
I := prurez.I_y
W := prurez.W_y

## Calculation of the beam
"The function beam uses the stiffness method, exactly and without a mesh. Reactions are positive upwards, a moment with tension at the bottom is positive, deflection is positive downwards."
nosnik := beam(L: L, EI: E·I, pins: [0 m, L_1, L], q: q, at: [a], F: [F])
R_A := nosnik.R[1] | kN
R_B := nosnik.R[2] | kN
R_C := nosnik.R[3] | kN
M_max := nosnik.M_max | kN·m
M_min := nosnik.M_min | kN·m
V_max := nosnik.V_max | kN
w_max := nosnik.w_max | mm
plot(beam_M(nosnik, x), x: 0 m .. L, title: "Bending moment") | kN·m
plot(beam_w(nosnik, x), x: 0 m .. L, title: "Deflection") | mm

## Check by hand with the three-moment equation
"The end supports carry no moment, so only the moment over the middle support stays in the equation. The right side is the sum of the terms from the load on both spans and from the force F."
Σ_q := q·L_1^3/4 + q·L_2^3/4 + F·a·(L_1^2 - a^2)/L_1 | kN·m^2
M_B := -Σ_q/(2·(L_1 + L_2)) | kN·m
R_A_ruka := q·L_1/2 + F·(L_1 - a)/L_1 + M_B/L_1 | kN
M_pod_F := R_A_ruka·a - q·a^2/2 | kN·m

## Checks
σ := max(abs(M_max), abs(M_min))/W | MPa
w_lim := L_1/250 | mm
check "Vertical equilibrium": abs(R_A + R_B + R_C - q·L - F) ≤ 0.001 kN
check "Moment over the support as from the three-moment equation": abs(M_min - M_B) ≤ 0.001 kN·m
check "Largest moment under the force F as from equilibrium by hand": abs(M_max - M_pod_F) ≤ 0.001 kN·m
check "Section as in the tables of IPE 300 (8356 cm⁴, 557 cm³, within 1 %)": abs(I - 8356 cm^4) ≤ 0.01·8356 cm^4 and abs(W - 557 cm^3) ≤ 0.01·557 cm^3
check "The stress does not exceed the yield strength": σ ≤ f_y
check "Deflection at most L_1/250": w_max ≤ w_lim
"The largest moment of 67.4 kN·m is under the force F; the moment over the middle support is −63.2 kN·m, with a stress only slightly smaller. The section passes on stress and deflection with a margin, so a smaller section could be considered."
