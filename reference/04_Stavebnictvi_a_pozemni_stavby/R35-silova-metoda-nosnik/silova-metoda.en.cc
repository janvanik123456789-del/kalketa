# Reactions and internal forces of a statically indeterminate beam by the force method
"After example no. 8 of the course BD03 (Brno University of Technology, Faculty of Civil Engineering; in Czech). The beam a–b–c–d has a hinged support a, a vertical support b and a sliding support d that also holds horizontally. Span a–b carries a distributed axial load, a concentrated moment acts at point c. The beam is statically indeterminate to the second degree: the primary system is obtained by removing the horizontal restraint at d (unknown X_1) and the support b (unknown X_2). The unknowns follow from the conditions that the beam does not move at the places of the removed restraints. The work of shear forces is neglected. The drawing is our own."
"Source: Brdečko L.: Příklad č. 8, BD03, VUT FAST Brno, https://www.fce.vutbr.cz/stm/zidek.r/files/_priklad_8_BD03.pdf"

## Input
L_ab := 5 m
L_bc := 3 m
L_cd := 3 m
L := L_ab + L_bc + L_cd
q_x := 20 kN/m           ' axial load on span a–b
M_c := 50 kN·m           ' concentrated moment at point c
"The source does not state the cross-section in its text (apparently only in the figure). The unknowns X_1, X_2 do not depend on it, because EA and EI cancel in the canonical equations. We assume IPE 200:"
E := 210 GPa
A := 28.5 cm^2
I := 1943 cm^4
![Beam a–b–c–d: the model with its load and the primary system with the unknowns X_1 and X_2](images/nosnik.svg){width=80%}

## State 0: the original load on the primary system
A_x0 := -q_x·L_ab | kN
A_z0 := -M_c/L | kN
D_z0 := M_c/L | kN
N_0(x) := if(x ≤ L_ab, q_x·(L_ab - x), 0 kN)
M_0(x) := if(x ≤ L_ab + L_bc, A_z0·x, D_z0·(L - x))

## States 1 and 2: unit forces in the directions of X_1 and X_2
"A unit horizontal force at d pulls the whole beam; a unit vertical force at b is shared between the supports a and d."
N_1(x) := 1
M_2(x) := if(x ≤ L_ab, (L - L_ab)/L·x, L_ab/L·(L - x))

## Displacements
δ_10 := integral(N_1(x)·N_0(x), x: 0 m .. L)/(E·A) | mm
δ_11 := integral(N_1(x)^2, x: 0 m .. L)/(E·A) | mm/kN
δ_20 := integral(M_2(x)·M_0(x), x: 0 m .. L)/(E·I) | mm
δ_22 := integral(M_2(x)^2, x: 0 m .. L)/(E·I) | mm/kN

## Canonical equations
solve (X_1, X_2): δ_10 + δ_11·X_1 == 0, δ_20 + δ_22·X_2 == 0 guess X_1 = 1 kN, X_2 = 1 kN
"The source has a misprint in the equation for X_2: 261236 once, 261326 elsewhere. The correct value is about 261 364 (without rounding the intermediate results). The source also continues with the rounded 2.727, so it gets X_2 = 9.584 kN instead of our 9.583 kN."

## Resulting reactions and internal forces
A_x := A_x0 - X_1 | kN
A_z := A_z0 + X_2·(L - L_ab)/L | kN
D_z := D_z0 + X_2·L_ab/L | kN
N_a := -A_x | kN
N_d := X_1 | kN
M_b := L_ab·A_z | kN·m
M_cL := (L_ab + L_bc)·A_z - L_bc·X_2 | kN·m
M_cP := L_cd·D_z | kN·m

## Bending moment along the beam
M(x) := M_0(x) + X_2·M_2(x) | kN·m
plot(M(x), x: 0 m .. L, title: "Bending moment along the beam") | kN·m

## Checks
check "Vertical equilibrium": abs(A_z + D_z - X_2) ≤ 0.001 kN
check "Moment equilibrium about point a": abs(L·D_z - M_c - L_ab·X_2) ≤ 0.001 kN·m
check "Unknowns and reactions as in the source (−22.727; 9.584; −77.273; 0.682; 8.902 kN)": abs(X_1 + 22.727 kN) ≤ 0.005 kN and abs(X_2 - 9.584 kN) ≤ 0.005 kN and abs(A_x + 77.273 kN) ≤ 0.005 kN and abs(A_z - 0.682 kN) ≤ 0.005 kN and abs(D_z - 8.902 kN) ≤ 0.005 kN
check "Moments as in the source (3.41; −23.296; 26.706 kN·m)": abs(M_b - 3.41 kN·m) ≤ 0.005 kN·m and abs(M_cL + 23.296 kN·m) ≤ 0.005 kN·m and abs(M_cP - 26.706 kN·m) ≤ 0.005 kN·m
"The largest bending moment is at point c: −23.3 kN·m just to the left and 26.7 kN·m just to the right of it. The horizontal restraint at d takes 22.7 kN of the axial load, so a horizontal reaction of 77.3 kN remains at point a."
