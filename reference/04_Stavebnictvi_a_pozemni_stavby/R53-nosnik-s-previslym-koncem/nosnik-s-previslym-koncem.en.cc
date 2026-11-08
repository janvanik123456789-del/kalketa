# Bending moment and stress of a timber beam with an overhang
"An own task of Kalketa: a timber beam rests on a pinned support A and a roller support B, and continues past support B as an overhang. A uniform load acts over the whole length and a vertical point load at the end of the overhang. The cross-section is rectangular, of solid timber. We calculate the reactions, the shear force and bending moment diagrams, the largest moments, and check the beam in bending. The theory is in the Sources layer."
"Source: own task of Kalketa, no outside source; results verified independently in Python (Check in Python layer) and by the function beam."

## Input
L := 5 m              ' span between supports A and B
a := 1.5 m            ' length of the overhang beyond support B
q := 8 kN/m           ' uniform load over the whole length (self-weight included)
F := 12 kN            ' vertical force at the end of the overhang
b := 140 mm           ' width of the section
h := 300 mm           ' height of the section
f_m_d := 14 MPa       ' design bending strength of the timber
"Loads and strength are design values, so no further factors are applied. The beam is restrained against lateral buckling and only bending is checked; the task asks for neither shear nor deflection."
![Diagram of the beam: a horizontal beam on a pinned support A on the left and a roller support B, with an overhang past support B. A uniform load q acts over the whole length and a vertical force F points downwards at the end of the overhang. Dimensions: L between the supports and the overhang length a.](images/schema.svg){width=75%}

## Task
"a) Calculate the reactions at supports A and B."
"b) Determine the shear force and bending moment diagrams, the largest positive moment in the span and the moment over support B."
"c) Calculate the section modulus of the rectangular section."
"d) Calculate the largest normal stress in bending and check the beam in bending."

## a) Reactions at supports A and B
"A beam on two supports is statically determinate; the two reactions follow from two equilibrium conditions." [T2]
"The sum of vertical forces must be zero: the reactions carry the whole load q over the length (L + a) and the force F at the end of the overhang." [T2]
relation R_A + R_B == q·(L + a) + F {eq=Rovn_sily}
"We write the moment condition about support A, so that only the unknown reaction R_B remains (the arm of R_A is zero). The resultant of the uniform load q·(L + a) acts at the middle of the loaded length, the force F at the end of the overhang at a distance (L + a) from A." [T2]
relation R_B·L == q·(L + a)^2/2 + F·(L + a) {eq=Rovn_momenty}
"From the moment condition we express the reaction at support B:"
derive R_B == (q·(L + a)^2/2 + F·(L + a))/L {eq}
R_B := (q·(L + a)^2/2 + F·(L + a))/L | kN
"We add the reaction at support A from the sum of forces (#Rovn_sily):"
derive R_A == q·(L + a) + F - R_B {eq}
R_A := q·(L + a) + F - R_B | kN
"Test: the moment condition about support B, which we did not use, must hold as well. The reaction R_A with arm L turns one way; the load on the span (q·L at mid-span) turns the other way, and so do the load on the overhang q·a and the force F in the first sense."
check "Moment equilibrium about support B": abs(R_A·L - (q·L^2/2 - q·a^2/2 - F·a)) ≤ 0.001 kN·m
check "R_A > 0": R_A ≥ 0 kN
check "R_B > 0": R_B ≥ 0 kN
"Both reactions are positive, so the supports only push the beam up and the diagram agrees with the directions in the picture. Support B carries more than A because it also supports the overhang." [T2]

## b) Shear force and bending moment
"The shear force V(x) is the sum of the vertical forces to the left of the section (upwards positive). The bending moment M(x) is the sum of the moments of the forces on one side of the section. In the span we calculate from support A on the left, on the overhang from the free end on the right, where only the forces on the overhang remain." [T3]
"In the span between A and B the reaction R_A gives a positive moment (tension at the bottom), and the uniform load over the length x subtracts a moment." [T3]
V_pole(x) := R_A - q·x | kN
M_pole(x) := R_A·x - q·x^2/2 | kN·m
"On the overhang the forces bend the beam hogging, so the moment is negative (tension at the top)." [T3]
V_previs(x) := F + q·(L + a - x) | kN
M_previs(x) := -(q·(L + a - x)^2/2 + F·(L + a - x)) | kN·m
"We join both parts into one function according to the position of the section:"
V(x) := if(x ≤ L, V_pole(x), V_previs(x)) | kN
M(x) := if(x ≤ L, M_pole(x), M_previs(x)) | kN·m
"Over support B the shear force jumps up by the reaction R_B. The values just left and right of the support, and the largest shear force:"
V_B_vlevo := V_pole(L) | kN
V_B_vpravo := V_previs(L) | kN
V_max := max(abs(V_B_vlevo), abs(V_B_vpravo)) | kN
check "Jump of the shear force at B is R_B": abs(V_B_vpravo - V_B_vlevo - R_B) ≤ 0.001 kN
"The extreme of the moment in the span is where the shear force is zero, V = dM/dx = 0; hence x = R_A/q." [T3]
solve x_0: derivative(M_pole(x), x: x_0) == 0 in 0 m .. L
check "V = 0 at the extreme": abs(V_pole(x_0)) ≤ 0.001 kN
check "x_0 = R_A/q": abs(x_0 - R_A/q) ≤ 0.001 m
"The largest positive moment follows by substituting the position of the extreme:"
M_max := M_pole(x_0) | kN·m
"The moment in the span is a parabola starting at zero; its second zero is twice as far as its vertex. Beyond it the moment in the span is negative and the tension moves from the bottom fibres to the top ones."
x_n := 2·R_A/q | m
check "M = 0 at the second zero": abs(M_pole(x_n)) ≤ 0.001 kN·m
"Over support B (x = L) we take the moment from the overhang and compare it with the moment from the span. Both must agree, because the moment does not jump along the beam." [T3]
M_B := M_previs(L) | kN·m
check "M_B from the relation for the overhang": abs(M_B + (q·a^2/2 + F·a)) ≤ 0.001 kN·m
check "The moment is continuous at B": abs(M_pole(L) - M_previs(L)) ≤ 0.001 kN·m
check "The moment at the free end is zero": abs(M(L + a)) ≤ 0.001 kN·m
"Test by the function beam, which solves the beam by the stiffness method. The bending stiffness EI does not affect the reactions and moments of a statically determinate beam, so we choose any."
nosnik := beam(L: L + a, EI: 1 MN·m^2, pins: [0 m, L], q: q, at: [L + a], F: [F])
check "Reactions by the function beam": abs(nosnik.R[1] - R_A) ≤ 0.001 kN and abs(nosnik.R[2] - R_B) ≤ 0.001 kN
check "Moments by the function beam": abs(nosnik.M_max - M_max) ≤ 0.01 kN·m and abs(nosnik.M_min - M_B) ≤ 0.001 kN·m
"The picture shows the shape of the moment diagram; a positive moment is drawn downwards, on the side of the tensile fibres. The chart below it has a positive moment upwards."
![Bending moment diagram along the beam with an overhang. A positive moment is drawn downwards, on the side of the tensile fibres: in the span between supports A and B it is positive with the maximum M_max at about a third of the span, it passes through zero before support B, and over support B it has the negative maximum M_B, which drops to zero towards the free end.](images/moment.en.svg){width=75%}
plot(V(x), x: 0 m .. L + a, title: "Shear force V") | kN
plot(M(x), x: 0 m .. L + a, points: [x_0, M_max | L, M_B], title: "Bending moment M") | kN·m
"The moment over support B has the opposite sign to the moment in the span and is larger. The overhang loads the beam harder than the span; the ratio of the two moments:"
pomer_momentu := abs(M_B)/M_max

## c) Section modulus of the rectangular section
"The section modulus of a rectangle of width b and height h is the second moment of area b·h^3/12 divided by the distance h/2 of the extreme fibre from the neutral axis. It tells how effectively the material is placed away from the neutral axis." [T4]
relation W == b·h^2/6 {eq}
W := b·h^2/6 | cm³
![Rectangular cross-section of the timber beam with growth rings sketched. The width is marked b, the height h. The horizontal axis y passes through the centroid at half the height, the vertical axis z points upwards.](images/prurez.svg){width=60%}

## d) Largest normal stress and the bending check
"The normal stress grows linearly with the distance from the neutral axis and is largest at the edges of the section." [T4]
relation σ_max == abs(M)/W {eq}
"Only the magnitude of the moment matters, not its sign, so we compare absolute values: the moment over support B governs." [T4]
M_rozh := max(abs(M_max), abs(M_B)) | kN·m
σ_max := M_rozh/W | MPa
"For comparison, the stress at the largest moment in the span:"
σ_pole := M_max/W | MPa
"The picture shows the stress distribution for a positive moment (compression at the top, tension at the bottom). Over support B the moment is negative, the top fibres are in tension and the bottom ones in compression, so the signs are reversed; the magnitude of the stress is the same."
![Distribution of the normal stress over the height of a rectangular section in bending. The stress varies linearly, it is zero at the neutral axis at half the height, and at one edge there is compression σ_c and at the other tension σ_t of equal magnitude.](images/napeti.en.svg){width=75%}
"The check compares the largest stress with the design bending strength of the timber." [T4]
check "Bending": σ_max ≤ f_m_d  source "Sources layer, T4"
vyuziti := σ_max/f_m_d
W_pot := M_rozh/f_m_d | cm³
"The beam passes in bending: the largest stress is over support B, where the top edge is in tension, and it stays below the design strength. The utilisation is the ratio of stress to strength; the required section modulus is only a little smaller than the actual one, so the reserve is not large. The stress in the span is about half of it."
