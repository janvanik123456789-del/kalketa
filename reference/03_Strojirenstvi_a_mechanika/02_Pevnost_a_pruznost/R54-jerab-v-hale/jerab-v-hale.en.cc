# Overhead crane in a hall: forces in the rope, main girder, runway and column
"An own task of Kalketa: a steel hall has an overhead travelling crane with a trolley. The load hangs on the hook of a block and tackle, the rope winds onto the drum of the trolley. The trolley runs on the two main girders of the bridge, and the bridge rests with its wheels on runway beams carried by brackets of the hall columns. The weight of the load thus passes through the rope, the main girder, the runway and the column into the foundations, and each part builds on the result of the previous one. We find the rope, the stress in the main girder, the load on the runway and the safety of the column against buckling. Dynamics, lateral forces (braking, skewing) and fatigue are neglected, except for the dynamic hoisting factor. The pictures are our own."
"Source: own task; theory in the Sources layer, calculation verified independently in Python (Check in Python layer)."

## Block and tackle and rope
### Input
"The load is lifted by a block and tackle with four load-carrying parts of the rope. The rope of six strands of steel wires winds onto the drum. We need the force in the rope and the smallest diameter of the rope."
g := 9.81 m/s^2           ' gravitational acceleration
m := 10 t                 ' mass of the lifted load
m_h := 250 kg             ' mass of the hook block with the lower sheaves
n := 4                    ' number of load-carrying parts of the rope
η_k := 0.95               ' overall efficiency of the block and tackle
R_m := 1770 MPa           ' tensile strength of the rope wires
k := 5.5                  ' required safety factor of the rope
ψ_l := 0.5                ' fill factor: ratio of the metal area of the rope to the area of a circle of the rope diameter
"a) Find the weight Q of the load with the hook block."
"b) What force S acts in the rope winding onto the drum? Take the number of load-carrying parts and the efficiency of the tackle into account."
"c) What is the allowable stress in the rope wires and what smallest total metal area A of the rope follows from it?"
"d) Find the smallest diameter d of the rope when the metal area is A = ψ_l·π·d²/4."
![Block and tackle: at the top the frame of the trolley with two fixed sheaves, at the bottom the hook block with two sheaves and the suspension with the load. The blue rope runs alternately over the upper and lower sheaves in four vertical parts and then winds onto the drum on the right. Arrow S shows the force in the rope, arrow Q the weight of the load.](images/kladkostroj.en.svg){width=75%}

### a) Weight of the load with the hook block
"The rope has to carry both the load and the hook block, so their masses are added and multiplied by the gravitational acceleration." [T2]
relation Q == (m + m_h)·g {eq=Q1}
Q := (m + m_h)·g | kN

### b) Force in the rope on the drum
"The load hangs on n parts of the rope and its weight is shared among them. Because of the friction in the bearings of the sheaves the rope has to pull a little more, as the efficiency η_k is less than one." [T2]
relation S·n·η_k == Q {eq=S1}
derive S == Q/(n·η_k) {eq=S2}
S := Q/(n·η_k) | kN

### c) Allowable stress and metal area of the rope
"The wires of the rope are designed for the tensile strength. Dividing the strength by the required safety factor gives the allowable stress." [T3]
relation σ_dov == R_m/k {eq}
σ_dov := R_m/k | MPa
"The metal area of the wires is the force divided by the allowable stress." [T3]
relation A == S/σ_dov {eq}
A := S/σ_dov | mm²

### d) Smallest diameter of the rope
![Cross-section of a steel rope: six strands around a central core, each strand made of several wires. Dimension d is the diameter of the rope. The labels mark the strand, the wire and the metal cross-section A, which is the sum of the areas of the wires.](images/lano.en.svg){width=75%}
"The metal fills only a part of the area of a circle of diameter d; the fill factor ψ_l gives this ratio." [T3]
relation A == ψ_l·π·d^2/4 {eq}
"We express the diameter from it and solve it numerically:"
solve d: A == ψ_l·π·d^2/4 in 0 mm .. 100 mm
derive d == sqrt(4·A/(ψ_l·π)) {eq}
σ_l := S/(ψ_l·π·d^2/4) | MPa
check "The diameter of the rope is positive": d > 0 mm
check "A rope of this diameter carries the force S with the required safety factor": σ_l ≤ σ_dov
"The rope must have a diameter of at least d; in practice the nearest larger diameter from the range of manufactured ropes is chosen. The force S in the rope is only a quarter of the weight carried by the tackle, increased by the losses in the sheaves."

## Main girder of the bridge
### Input
"The main girder of the bridge is a welded I girder simply supported at its ends. The trolley has four wheels, two of them run on each of the two main girders. The load of the trolley is the weight of the load with the hook block from the previous part, increased by the dynamic hoisting factor, plus the weight of the trolley. One main girder is calculated."
L := 18 m                 ' span of the bridge between the wheels
F_Q := Q | kN             ' weight of the load with the hook block from the previous part
m_k := 3.2 t              ' mass of the trolley
ψ_d := 1.2                ' dynamic hoisting factor
a_k := 1.6 m              ' wheel base of the trolley on one girder
e_k := 1.2 m              ' smallest distance of the first wheel of the trolley from the support
q_g := 2 kN/m             ' self-weight of the main girder with the rail
f_y := 235 MPa            ' yield strength of steel
γ_M := 1.1                ' partial factor for the material
h_g := 550 mm             ' depth of the girder section
b_g := 220 mm             ' flange width
t_g := 18 mm              ' flange thickness
s_g := 10 mm              ' web thickness
"a) What vertical force P does one wheel of the trolley transmit? The four wheels together carry the dynamically increased load and the weight of the trolley."
"b) Find the largest bending moment of the main girder from the wheels of the trolley and from its self-weight. The least favourable position of the trolley is when the midpoint of the girder lies midway between the resultant of the two wheels and the wheel nearer to the middle."
"c) The trolley goes as far to the edge as possible. What is the largest reaction R_max in the support? Use it as the wheel pressure of the bridge on the runway."
"d) Find the second moment of area and the section modulus of the section and check the girder in bending against the design strength f_y/γ_M."
![Diagram of the main girder of the bridge: a horizontal girder on a pinned support A on the left and a roller support B on the right, a uniform load q_g along the whole length. Near the middle of the span stands the trolley with two wheels, each with a vertical force P, the wheel base is a_k. Dimension L is the span.](images/hlavni-nosnik.en.svg){width=75%}

### a) Force in one wheel of the trolley
"The trolley has four wheels and all together they carry the dynamically increased load plus the weight of the trolley itself, so the force is divided by four." [T4]
relation 4·P == ψ_d·F_Q + m_k·g {eq=P1}
"We express P and substitute:"
derive P == (ψ_d·F_Q + m_k·g)/4 {eq=P2}
P := (ψ_d·F_Q + m_k·g)/4 | kN

### b) Largest bending moment
![Diagram of the bending moment M along the girder between the supports A and B, plotted downwards. The curve consists of straight segments between the two forces and of gently curved segments; the largest value M_max is just beside the middle of the span. Red arrows at the top mark the positions of the two wheels of the trolley.](images/moment.en.svg){width=75%}
"The largest moment under a force occurs when the midpoint of the span lies midway between the resultant of the two wheels and the wheel nearer to the middle, that is when the first wheel is at the distance x_k from the support A. The moment from the self-weight of the girder is added." [T5]
x_k := L/2 - a_k/4 | m
relation M_P == 2·P/L·(L/2 - a_k/4)^2 {eq}
M_P := 2·P/L·(L/2 - a_k/4)^2 | kN·m
"From the uniform self-weight the largest moment is in the middle of the span:" [T5]
relation M_q == q_g·L^2/8 {eq}
M_q := q_g·L^2/8 | kN·m
"The moments are added by superposition. The sum of the two largest values, which occur at slightly different places, is on the safe side." [T5]
relation M == M_P + M_q {eq}
M := M_P + M_q | kN·m
"A check without an assumption about the position: the moment under the first wheel at the position x is the moment of the reaction in the support A minus the moment of the uniform load, and we look for the largest value over all positions of the trolley that can occur. This is exactly what the chart shows."
M_kola(x, F, a, l, q) := (F·(2·l - 2·x - a)/l + q·l/2)·x - q·x^2/2
x_ex := maximize(M_kola(x, P, a_k, L, q_g), x: e_k .. L - a_k - e_k)
M_ex := M_kola(x_ex, P, a_k, L, q_g) | kN·m
plot(M_kola(x, P, a_k, L, q_g), x: e_k .. L - a_k - e_k, title: "Moment under the first wheel by its position", xlabel: "x (first wheel from the support A)", ylabel: "M") | kN·m
check "The exact largest moment is not greater than the sum of the largest values": M_ex ≤ M
check "The sum of the largest values differs from the exact one by at most 1 kN·m": M - M_ex ≤ 1 kN·m
check "The exact position of the first wheel differs from x_k by less than half a metre": abs(x_ex - x_k) < 0.5 m

### c) Largest reaction in the support (trolley at the edge)
"The largest reaction occurs when the trolley is as near to the support as possible, the first wheel being at the distance e_k. The reaction of each wheel is found by the lever about the other support, and half of the self-weight is added." [T5]
relation R_max == P·(L - e_k)/L + P·(L - e_k - a_k)/L + q_g·L/2 {eq=R1}
R_max := P·(L - e_k)/L + P·(L - e_k - a_k)/L + q_g·L/2 | kN
"A check by equilibrium: the reaction in the other support plus R_max equals the whole vertical load of the girder."
R_B := P·e_k/L + P·(e_k + a_k)/L + q_g·L/2 | kN
check "Equilibrium of the vertical forces on the girder": abs(R_max + R_B - 2·P - q_g·L) ≤ 0.000001 kN

### d) Section modulus and bending check
![Cross-section of the welded I girder. The upper and lower flanges are wide and thin, the web between them is narrow. Marked are the depth h_g, the flange width b_g, the flange thickness t_g and the web thickness s_g, and the axes y and z through the centroid in red dash-dot lines.](images/prurez-nosniku.en.svg){width=75%}
"The second moment of area I of the section is found by subtracting the gaps at the sides of the web from the rectangle of the whole section." [T6]
relation I_y == (b_g·h_g^3 - (b_g - s_g)·(h_g - 2·t_g)^3)/12 {eq}
I_y := (b_g·h_g^3 - (b_g - s_g)·(h_g - 2·t_g)^3)/12 | cm^4
"The section modulus is the second moment of area divided by the distance of the outer fibre from the axis." [T6]
relation W_y == 2·I_y/h_g {eq}
W_y := 2·I_y/h_g | cm^3
"The design strength is the yield strength divided by the partial factor." [T6]
relation f_d == f_y/γ_M {eq}
f_d := f_y/γ_M | MPa
"The actual bending stress is the moment divided by the section modulus." [T6]
relation σ == M/W_y {eq}
σ := M/W_y | MPa
check "Bending stress in the main girder": σ ≤ f_d  source "T6"
"The main girder passes in bending. The largest reaction R_max is the wheel pressure that the girder passes on to the runway."

## Crane runway
### Input
"The bridge runs on a rail on the runway beam, which is a simple beam supported on the brackets of two neighbouring columns. The end truck of the bridge has two wheels and carries the ends of both main girders, so each wheel carries the largest reaction R_max of one main girder from the previous part. The runway beam is loaded by two equal forces and its self-weight."
F_k := R_max | kN         ' wheel pressure of the bridge on the runway from the previous part
c := 2.4 m                ' wheel base of the end truck
l_d := 7.5 m              ' span of the runway beam between the brackets
g_d := 1.8 kN/m           ' self-weight of the runway beam with the rail
W_d := 1500 cm^3          ' section modulus of the runway beam
"a) Find the largest bending moment of the runway beam from the two wheels and from its self-weight. The least favourable position is when the midpoint of the beam lies midway between the resultant of the two wheels and the wheel nearer to the middle."
"b) Find the largest normal stress in bending and check the runway beam against f_y/γ_M."
"c) What is the largest reaction R_d on the bracket of the column? The load is greatest when one wheel stands above the support."
![A horizontal runway beam rests on the brackets of two vertical columns. On the rail at the top stand two wheels with concentrated forces F_k, the wheel base is c, along the whole beam there is a uniform load g_d. The green arrow R_d is the reaction on the left bracket, dimension l_d is the span between the columns.](images/draha.en.svg){width=75%}

### a) Largest bending moment
"Two equal forces F_k with the wheel base c on a simple beam act as on the main girder: the moment is greatest under one of the forces when the midpoint of the span halves the distance between the resultant and the nearer wheel. The self-weight is added." [T7]
relation M_d == 2·F_k/l_d·(l_d/2 - c/4)^2 + g_d·l_d^2/8 {eq}
M_d := 2·F_k/l_d·(l_d/2 - c/4)^2 + g_d·l_d^2/8 | kN·m
"A check by the same procedure as for the main girder, looking for the largest moment over all positions of the truck:"
x_dex := maximize(M_kola(x, F_k, c, l_d, g_d), x: 0 m .. l_d - c)
M_dex := M_kola(x_dex, F_k, c, l_d, g_d) | kN·m
check "The exact largest moment of the runway is not greater than the sum of the largest values": M_dex ≤ M_d

### b) Bending stress
"The stress is the moment divided by the section modulus of the runway beam." [T7]
relation σ_d == M_d/W_d {eq}
σ_d := M_d/W_d | MPa
check "Bending stress in the runway beam": σ_d ≤ f_d  source "T7"

### c) Largest reaction on the bracket
"One wheel stands above the support and passes into it entirely; the other is at the distance c and passes into the support according to the lever. Half of the self-weight of the beam is added." [T7]
relation R_d == F_k + F_k·(l_d - c)/l_d + g_d·l_d/2 {eq}
R_d := F_k + F_k·(l_d - c)/l_d + g_d·l_d/2 | kN
"A check by equilibrium: the reaction in the other support plus R_d equals the whole load of the runway beam."
R_dB := F_k·c/l_d + g_d·l_d/2 | kN
check "Equilibrium of the vertical forces on the runway beam": abs(R_d + R_dB - 2·F_k - g_d·l_d) ≤ 0.000001 kN
"The runway beam passes in bending. The reaction R_d goes through the bracket into the column."

## Hall column under the runway bracket
### Input
"The hall column is a rolled I section, hinged and guided at the head and fixed at the base. In buckling in the weak plane it buckles about the axis z. It is loaded vertically by the reaction of the runway beam from the previous part, half of the weight of the runway beam in the neighbouring bay and the load from the roof. The eccentricity of the bracket and lateral forces are neglected."
H := 8 m                  ' height of the column
N_r := 60 kN              ' vertical load from the roof at the head of the column
μ := 0.7                  ' effective length factor for a fixed base and a guided head
E_s := 210 GPa            ' modulus of elasticity of steel
n_req := 2.5              ' required safety against the Euler critical force
h_s := 170 mm             ' depth of the column section
b_s := 180 mm             ' flange width
t_s := 10 mm              ' flange thickness
s_s := 6.5 mm             ' web thickness
"a) Find the axial force N in the column under the bracket: the reaction R_d from the previous part, half of the weight g_d·l_d of the neighbouring runway beam and the load N_r."
"b) Find the area of the section, the second moment of area about the weak axis z (neglect the rounding of the flanges) and the radius of gyration."
"c) Find the effective length, the slenderness of the column and the limit slenderness π·√(E_s/f_y). Verify that Euler's formula applies."
"d) Find Euler's critical force N_cr and the safety n = N_cr/N. Check the column against the required safety n_req and in addition the compression σ_c = N/A against f_y/γ_M."
![A vertical column stands on a foundation and is fixed at the base; at the top it is guided by a hinge and loaded by the axial force N. The blue curve shows the buckled shape, the dashed line is the original axis. On the right the dimension marks the effective length L_cr as the distance from the inflection point to the head, on the left the total height H.](images/sloup.en.svg){width=75%}

### a) Axial force in the column
"The axial force is the sum of the vertical reactions and loads above the section. The reaction R_d already contains half of the weight of the runway beam in this bay, the other half comes from the neighbouring bay." [T8]
relation N == R_d + g_d·l_d/2 + N_r {eq}
N := R_d + g_d·l_d/2 + N_r | kN

### b) Section of the column
![Cross-section of the rolled I column with the axes y and z in red dash-dot lines. Marked are the depth h_s, the flange width b_s, the flange thickness t_s and the web thickness s_s. The section is almost square, with wide flanges and a thin web.](images/prurez-sloupu.en.svg){width=75%}
"The area is the sum of the two flanges and the web between them." [T8]
relation A_s == 2·b_s·t_s + (h_s - 2·t_s)·s_s {eq}
A_s := 2·b_s·t_s + (h_s - 2·t_s)·s_s | cm^2
"Buckling occurs about the axis with the smaller second moment of area. For this section it is the axis z, about which the flange has its width b_s as depth." [T8]
relation I_z == 2·t_s·b_s^3/12 + (h_s - 2·t_s)·s_s^3/12 {eq}
I_z := 2·t_s·b_s^3/12 + (h_s - 2·t_s)·s_s^3/12 | cm^4
"The radius of gyration is the square root of the ratio of the second moment of area to the area." [T8]
relation i_z == sqrt(I_z/A_s) {eq}
i_z := sqrt(I_z/A_s) | mm

### c) Effective length and slenderness
"The fixed base and the guided hinge at the head shorten the effective length against the height of the column to μ times the height." [T8]
relation L_cr == μ·H {eq}
L_cr := μ·H | m
"The slenderness is the effective length divided by the radius of gyration. Euler's formula applies when it is larger than the limit slenderness, at which Euler's critical stress would reach the yield strength." [T8]
relation λ == L_cr/i_z {eq}
λ := L_cr/i_z
relation λ_p == π·sqrt(E_s/f_y) {eq}
λ_p := π·sqrt(E_s/f_y)
check "Euler's formula applies, the column is more slender than the limit slenderness": λ > λ_p

### d) Euler's critical force and check
"Euler's critical force depends on the stiffness of the column and on the effective length." [T8]
relation N_cr == π^2·E_s·I_z/L_cr^2 {eq}
N_cr := π^2·E_s·I_z/L_cr^2 | kN
"The safety is the ratio of the critical force to the actual axial force." [T8]
relation n_s == N_cr/N {eq}
n_s := N_cr/N
σ_c := N/A_s | MPa
σ_cr := N_cr/A_s | MPa
check "Safety against buckling": n_s ≥ n_req  source "T8"
check "Compression of the section": σ_c ≤ f_d
"The chart shows Euler's critical stress by slenderness. The column lies on the branch of the hyperbola below the yield strength, so it loses stability before it would be crushed."
σ_E(λ_x) := π^2·E_s/λ_x^2
plot(σ_E(λ_x), f_y + 0·λ_x, λ_x: 60 .. 200, points: [λ, σ_cr], title: "Euler's critical stress by slenderness", xlabel: "λ", ylabel: "σ") | MPa
"The column passes, buckling governs and compression does not: the axial force is about a third of Euler's critical force and the compression uses only a small part of the design strength."
