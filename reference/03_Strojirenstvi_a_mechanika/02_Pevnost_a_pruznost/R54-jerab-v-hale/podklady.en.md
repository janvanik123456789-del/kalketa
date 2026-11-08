# Crane in a hall: theory {#T1}

The theory behind the calculation, in our own words. Kalketa checks the formulas in the boxes. The weight of the load goes through the rope, the main girder of the bridge, the runway and the column, and each part receives its load from the previous one.

## Force in the rope of the block and tackle {#T2}

The load hangs on n load-carrying parts of the rope, so its weight is shared among them. The friction in the bearings of the sheaves is included by the efficiency of the tackle: the worse the efficiency, the more the rope has to pull. The equality also follows from energy: when the load is lifted by a height h, n·h of rope winds onto the drum, the work of the pull S·n·h exceeds the work against gravity Q·h by the losses, so S·n·η = Q.

```kalk
m := 10 t
m_h := 250 kg
g := 9.81 m/s^2
n := 4
η_k := 0.95
Q := (m + m_h)·g | kN
S := Q/(n·η_k) | kN
check "Equilibrium of the hook block": abs(S·n·η_k - Q) ≤ 1e-9 kN
check "Q is about 100.55 kN": abs(Q - 100.55 kN) ≤ 0.01 kN
```

## Design of the rope diameter {#T3}

The rope carries only through the metal part of its section, that is the sum of the areas of the wires. The allowable stress is the tensile strength of the wires divided by the required safety factor. The metal area is a fraction of the area of a circle of the rope diameter, and the fill factor ψ_l gives the fraction. The diameter follows: d = √(4A/(ψ_l·π)).

```kalk
S := 26.461 kN
R_m := 1770 MPa
k := 5.5
ψ_l := 0.5
σ_dov := R_m/k | MPa
A := S/σ_dov | mm²
d := sqrt(4·A/(ψ_l·π)) | mm
check "The circular area with the fill factor gives A back": abs(ψ_l·π·d^2/4 - A) ≤ 1e-9 mm²
check "The rope diameter is about 14.5 mm": abs(d - 14.47 mm) ≤ 0.01 mm
```

## Load of the main girder by the trolley {#T4}

While lifting, the weight of the load is increased by the dynamic factor ψ_d, and the weight of the trolley is added. The load is divided among four wheels, because the trolley runs on two main girders and each has two wheels.

```kalk
ψ_d := 1.2
F_Q := 100.5525 kN
m_k := 3.2 t
g := 9.81 m/s^2
P := (ψ_d·F_Q + m_k·g)/4 | kN
check "The four wheels together carry the dynamic load and the trolley": abs(4·P - ψ_d·F_Q - m_k·g) ≤ 1e-9 kN
```

## Largest moment and reaction of the main girder {#T5}

Two equal forces P with the wheel base a act on a simple beam of span L. If the first wheel is at the distance x from the left support, the left reaction is R_A = P·(2L − 2x − a)/L and the moment under the first wheel is M(x) = R_A·x. The largest value is where the derivative is zero, that is 2L − 4x − a = 0 and x = L/2 − a/4. The midpoint of the span then lies midway between the resultant (at the distance a/2 from both wheels) and the first wheel. After substitution M_P = 2P/L·(L/2 − a/4)².

The moment from the self-weight q is q·x·(L − x)/2 along the whole girder, largest in the middle of the span, q·L²/8. The two largest moments do not occur at exactly the same place; their sum is therefore a little larger than the true largest moment, so on the safe side. The difference can be found by putting both loads into the total moment under the wheel (see the check). The largest reaction occurs when the trolley is at the edge and the first wheel has the smallest possible distance e_k from the support.

```kalk
P := 38.01375 kN
L := 18 m
a_k := 1.6 m
q_g := 2 kN/m
e_k := 1.2 m
x_k := L/2 - a_k/4
M_P := 2·P/L·(L/2 - a_k/4)^2 | kN·m
M_pod_kolem := P·(2·L - 2·x_k - a_k)/L·x_k | kN·m
M_q := q_g·L^2/8 | kN·m
M := M_P + M_q | kN·m
R_max := P·(L - e_k)/L + P·(L - e_k - a_k)/L + q_g·L/2 | kN
check "The moment under the first wheel at the position x_k is M_P": abs(M_pod_kolem - M_P) ≤ 1e-9 kN·m
check "M_P is about 312.4 kN·m": abs(M_P - 312.39 kN·m) ≤ 0.01 kN·m
check "R_max is about 85.58 kN": abs(R_max - 85.58 kN) ≤ 0.01 kN
```

## Bending stress in an I section {#T6}

The second moment of area I of the section is found by subtracting the two gaps at the sides of the web from the rectangle of the whole depth and the flange width. The section modulus is the second moment of area divided by the distance of the outer fibre from the axis, h/2 for a symmetric section. The design strength is the yield strength divided by the partial factor. The bending stress is the moment divided by the section modulus and is largest in the outer fibre.

```kalk
h_g := 550 mm
b_g := 220 mm
t_g := 18 mm
s_g := 10 mm
f_y := 235 MPa
γ_M := 1.1
M := 393.39 kN·m
I_y := (b_g·h_g^3 - (b_g - s_g)·(h_g - 2·t_g)^3)/12 | cm^4
I_dil := 2·b_g·t_g^3/12 + 2·b_g·t_g·((h_g - t_g)/2)^2 + s_g·(h_g - 2·t_g)^3/12 | cm^4
W_y := 2·I_y/h_g | cm^3
f_d := f_y/γ_M | MPa
σ := M/W_y | MPa
check "The second moment of area from the gaps and from the parallel axis theorem is the same": abs(I_y - I_dil) ≤ 0.001 cm^4
check "σ is about 160.6 MPa": abs(σ - 160.56 MPa) ≤ 0.01 MPa
check "The girder passes": σ ≤ f_d
```

## Runway beam and bracket {#T7}

The runway beam is a simple beam with two wheels of the bridge and its self-weight. The largest moment is found in the same way as for the main girder, with the wheel base c and the span l_d. The reaction on the bracket is largest when one wheel stands directly above the support; the other is at the distance c and passes the share (l_d − c)/l_d of its force into the support.

```kalk
F_k := 85.58 kN
c := 2.4 m
l_d := 7.5 m
g_d := 1.8 kN/m
W_d := 1500 cm^3
M_d := 2·F_k/l_d·(l_d/2 - c/4)^2 + g_d·l_d^2/8 | kN·m
σ_d := M_d/W_d | MPa
R_d := F_k + F_k·(l_d - c)/l_d + g_d·l_d/2 | kN
R_dB := F_k·c/l_d + g_d·l_d/2 | kN
check "Equilibrium of the vertical forces": abs(R_d + R_dB - 2·F_k - g_d·l_d) ≤ 1e-9 kN
check "R_d is about 150.5 kN": abs(R_d - 150.52 kN) ≤ 0.01 kN
```

## Buckling of a column by Euler {#T8}

The axial force in the column is the sum of the reactions and loads above the section. A slender compressed member loses stability before it would be crushed. Euler's critical force depends on the stiffness of the member and on the effective length, which is set by the supports of the ends. The relation holds only for a slenderness larger than the limit one; otherwise inelastic behaviour governs buckling.

Buckling occurs about the axis with the smaller second moment of area, for an I section the axis z. A hinge at both ends gives an effective length equal to the height, a fixed base shortens it. For a fixed base and a hinge at the head the exact effective length is 0.699·H; the factor μ = 0.7 is rounded. The limit slenderness is the slenderness at which Euler's critical stress π²E/λ² would reach the yield strength.

```kalk
R_d := 150.5244 kN
g_d := 1.8 kN/m
l_d := 7.5 m
N_r := 60 kN
H := 8 m
μ := 0.7
E_s := 210 GPa
f_y := 235 MPa
h_s := 170 mm
b_s := 180 mm
t_s := 10 mm
s_s := 6.5 mm
N := R_d + g_d·l_d/2 + N_r | kN
A_s := 2·b_s·t_s + (h_s - 2·t_s)·s_s | cm^2
I_z := 2·t_s·b_s^3/12 + (h_s - 2·t_s)·s_s^3/12 | cm^4
i_z := sqrt(I_z/A_s) | mm
L_cr := μ·H | m
λ := L_cr/i_z
λ_p := π·sqrt(E_s/f_y)
N_cr := π^2·E_s·I_z/L_cr^2 | kN
n_s := N_cr/N
σ_cr := N_cr/A_s | MPa
check "At the limit slenderness Euler's stress equals the yield strength": abs(π^2·E_s/λ_p^2 - f_y) ≤ 1e-6 MPa
check "Euler's formula applies": λ > λ_p
check "The critical stress is below the yield strength": σ_cr < f_y
check "N_cr is about 642.6 kN": abs(N_cr - 642.6 kN) ≤ 0.1 kN
```
