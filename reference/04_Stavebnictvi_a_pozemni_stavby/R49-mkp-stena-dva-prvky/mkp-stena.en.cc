# Displacements and stresses of a wall of two triangular elements (FEM)
"Based on example 4.1 of the text Finite Element Method in Structural Mechanics (VSB-Technical University of Ostrava; in Czech). A square wall of 1 m × 1 m and thickness 0.1 m is divided by a diagonal into two constant-strain triangular elements (plane stress). The lower nodes are fixed, a horizontal force acts at the upper right node and a vertical one at the upper left node. We look for the displacements of the free nodes, the reactions and the stresses in both elements. The source has errors in the stiffness matrices of both elements (see the section Comparison with the source); the sheet computes the correct values."
"Source: Brožovský, Konečný: Metoda konečných prvků ve stavební mechanice, VŠB-TU Ostrava, https://mi21.vsb.cz/sites/mi21.vsb.cz/files/unit/metoda_konecnych_prvku_stavebni_mechanika.pdf"

## Input
E := 20 GPa
ν := 0.2
t := 0.1 m
F_x3 := -10 kN               ' the force at node 3 points to the left
F_y4 := -20 kN               ' the force at node 4 points down
"Nodes 1 to 4 lie in the corners of the square; coordinate x to the right, y upwards. Element 1 has nodes 1, 2, 4, element 2 nodes 2, 3, 4 (counterclockwise). Nodes 1 and 2 are fixed, their displacements are zero. The source says no more; we assume plane stress, as is usual for a thin wall."
x_u := [0, 1, 1, 0] m
y_u := [0, 0, 1, 1] m
uzly := [1, 2, 4 | 2, 3, 4]  ' row = element, columns = its nodes i, j, k
![Square wall divided by a diagonal into elements 1 and 2, nodes 1 to 4, supports at nodes 1 and 2, forces at nodes 3 and 4](images/stena.svg){width=55%}

## Material
"The elasticity matrix for plane stress connects the stress σ = (σ_x, σ_y, τ_xy) with the strain ε = (ε_x, ε_y, γ_xy):"
D := E/(1 - ν^2)·[1, ν, 0 | ν, 1, 0 | 0, 0, (1 - ν)/2] | GPa

## An element from its number
"Coordinates of the a-th node of element e and its area (three nodes counterclockwise give a positive area):"
x_e(e, a) := x_u[uzly[e, a]]
y_e(e, a) := y_u[uzly[e, a]]
A_e(e) := ((x_e(e, 2) - x_e(e, 1))·(y_e(e, 3) - y_e(e, 1)) - (x_e(e, 3) - x_e(e, 1))·(y_e(e, 2) - y_e(e, 1)))/2
"Coordinate differences for node a of the element: b_a = y_b − y_c, c_a = x_c − x_b, where b, c are the other two nodes in order."
b_e(e, a) := y_e(e, mod(a, 3) + 1) - y_e(e, mod(a + 1, 3) + 1)
c_e(e, a) := x_e(e, mod(a + 1, 3) + 1) - x_e(e, mod(a, 3) + 1)
"The matrix B (3 × 6) gives the strain of the element from its six displacements (u_i, v_i, u_j, v_j, u_k, v_k). Column j belongs to node a = ⌈j/2⌉; an odd column is the displacement u, an even one v."
B_e(e) := matrix(if(i == 1, if(mod(j, 2) == 1, b_e(e, floor((j + 1)/2)), 0 m), if(i == 2, if(mod(j, 2) == 1, 0 m, c_e(e, floor((j + 1)/2))), if(mod(j, 2) == 1, c_e(e, floor((j + 1)/2)), b_e(e, floor((j + 1)/2)))))/(2·A_e(e)), i: 1 .. 3, j: 1 .. 6)
"Stiffness matrix of the element (6 × 6): k = t·A·Bᵀ·D·B."
k_e(e) := t·A_e(e)·transpose(B_e(e))·D·B_e(e)

## Stiffness matrices of the elements
A_1 := A_e(1) | m^2
A_2 := A_e(2) | m^2
"The multiplier t·E/(2·(1 − ν²)) is the same for both elements of a square with a side of 1 m, 1.0417·10⁹ N/m; the matrices of the source are written in multiples of it:"
m_k := t·E/(2·(1 - ν^2)) | MN/m
k_1 := k_e(1) | MN/m
k_2 := k_e(2) | MN/m
"Order of rows and columns: u and v of the nodes of the element, element 1 has nodes 1, 2, 4, element 2 nodes 2, 3, 4."

## Assembly of the system
"Degrees of freedom: 1 = u_3, 2 = v_3, 3 = u_4, 4 = v_4. A fixed node gets the place 0 and its row is left out. Places of the six displacements of element e:"
n_d := 4
dof(n, s) := if(n <= 2, 0, 2·(n - 3) + s)
misto(e) := vector(dof(uzly[e, floor((j + 1)/2)], 2 - mod(j, 2)), j: 1 .. 6)
"The stiffness of the whole wall is the sum of the element matrices at their places:"
K := sum(scatter(k_e(e), misto(e), n_d), e: 1 .. 2) | MN/m
F := [F_x3 | 0 kN | 0 kN | F_y4]
r := lsolve(K, F) | μm
u_3 := r[1] | μm
v_3 := r[2] | μm
u_4 := r[3] | μm
v_4 := r[4] | μm
![The original shape of the wall as a solid line and the deformed shape dashed, displacements magnified 5000 times](images/deformace.svg){width=55%}

## Reactions
"The same with all eight degrees of freedom (1, 2 = node 1, … 7, 8 = node 4). The reactions are given by the first four rows, that is nodes 1 and 2, as no external load acts on them."
misto_8(e) := vector(2·uzly[e, floor((j + 1)/2)] - mod(j, 2), j: 1 .. 6)
K_8 := sum(scatter(k_e(e), misto_8(e), 8), e: 1 .. 2) | MN/m
r_8 := vector(if(i <= 4, 0 μm, r[i - 4]), i: 1 .. 8)
R := K_8·r_8 | kN
R_x1 := R[1] | kN
R_y1 := R[2] | kN
R_x2 := R[3] | kN
R_y2 := R[4] | kN

## Strains and stresses of the elements
"The strain of an element is ε = B·u_e and the stress σ = D·ε, where u_e are the displacements of its six degrees of freedom; both are constant in the element."
u_e(e) := vector(r_8[2·uzly[e, floor((i + 1)/2)] - mod(i, 2)], i: 1 .. 6)
ε_1 := B_e(1)·u_e(1)
σ_1 := D·B_e(1)·u_e(1) | kPa
ε_2 := B_e(2)·u_e(2)
σ_2 := D·B_e(2)·u_e(2) | kPa
σ_x1 := σ_1[1] | kPa
σ_y1 := σ_1[2] | kPa
τ_xy1 := σ_1[3] | kPa
σ_x2 := σ_2[1] | kPa
σ_y2 := σ_2[2] | kPa
τ_xy2 := σ_2[3] | kPa

## Comparison with the source
"The source gives the displacements u_3, v_3, u_4, v_4 = −38.7; −3.9; −28.2; −19.1 μm and in element 1 the stresses σ_y = −397.9 kPa, τ = −235 kPa. We get different values because the source has two errors in the stiffness matrices of the elements (with the multiplier 1.0417·10⁹ N/m): in element 1 it has +1.0 instead of −1.0 between u_1 and u_2, and in element 2 it has 0.2 instead of 0.6 between u_3 and v_3 (that is ν + (1 − ν)/2 in multiples of the multiplier). That our matrices are right can be seen from the row sums: a displacement of the wall as a rigid body must cause no force."
p_x := vector(if(mod(i, 2) == 1, 1 μm, 0 μm), i: 1 .. 6)
p_y := vector(if(mod(i, 2) == 1, 0 μm, 1 μm), i: 1 .. 6)
f_tuhe_1 := norm(k_1·p_x) + norm(k_1·p_y) | N
f_tuhe_2 := norm(k_2·p_x) + norm(k_2·p_y) | N
k_1_uu := k_1[1, 3]/m_k
k_2_uv := k_2[3, 4]/m_k
"The values in the source would fail this test: the sum of the elements of row 1 in the columns u (1.4 + 1.0 − 0.4) would give 2.0 instead of 0. With the free part of the assembled stiffness matrix as the source printed it (with its errors), the displacements come out different from its own result as well:"
K_zdroj := 1.042·[1.4, 0.2, -1.0, -0.4 | 0.2, 1.4, -0.2, -0.4 | -1.0, -0.2, 1.4, 0 | -0.4, -0.4, 0, 1.4] GN/m
r_zdroj := lsolve(K_zdroj, F) | μm

## Checks
S_asym := K - transpose(K)
check "Element 1 moved as a rigid body carries no force": f_tuhe_1 ≤ 0.001 N
check "Element 2 moved as a rigid body carries no force": f_tuhe_2 ≤ 0.001 N
check "The reactions balance the load in the horizontal direction": abs(R_x1 + R_x2 + F_x3) ≤ 1e-6 kN
check "The reactions balance the load in the vertical direction": abs(R_y1 + R_y2 + F_y4) ≤ 1e-6 kN
check "The moment about node 1 is in equilibrium": abs(R_y2·1 m - F_x3·1 m) ≤ 1e-6 kN·m
check "The assembled stiffness K is symmetric": sqrt(trace(S_asym·transpose(S_asym))) ≤ 1e-9 MN/m
check "Error of the source in element 1: K[u_1, u_2] is −1.0 of the multiplier, not +1.0": abs(k_1_uu + 1.0) ≤ 1e-9
check "Error of the source in element 2: K[u_3, v_3] is 0.6 of the multiplier, not 0.2": abs(k_2_uv - 0.6) ≤ 1e-9
check "The matrix of the source gives a different displacement than the source itself (u_3 ≈ −26.95 μm, not −38.7 μm)": abs(r_zdroj[1] + 26.95 μm) ≤ 0.01 μm
"The wall is loaded by compression and bending: element 1 at the supports is compressed mainly vertically (σ_y = −435 kPa), element 2 horizontally (σ_x = −165 kPa) and vertically it has a small tension (35 kPa). Node 2 is pulled down by the reaction R_y2 = −10 kN, because the horizontal force at the top tries to overturn the wall. Because of the errors in the element matrices the source gets displacements u_3 and u_4 about a third larger and v_3 with the opposite sign."
