# Forces, torque and flywheel of a crank mechanism
"After an article on the basic equations of the crank mechanism of a steam engine in a Czech online textbook (Transformation Technologies, ch. 31, www.transformacni-technologie.cz/31.html). The article does not give the dimensions of the engine or the course of the steam pressure (they are in paid appendices); the values below are an assumption for the demonstration, replace them with your own. The pictures are our own, drawn after the formulas of the article. Everything in SI units: revolutions in s⁻¹, angles in radians."
"Source: J. Škorpík: Základní rovnice klikového mechanismu parního motoru, Transformační technologie, kap. 31, https://www.transformacni-technologie.cz/31.html"

## Input
![Crank mechanism: piston position x from top dead centre, connecting rod o, crank r, shaft rotation φ, rod angle γ](images/mechanismus.en.svg){width=90%}
"Crank mechanism (Figure 558 of the article):"
r := 0.05 m             ' crank arm
o := 0.25 m             ' length of the connecting rod
s := 2·r                ' stroke of the piston
"Cylinder of a double-acting engine:"
d := 0.10 m             ' cylinder diameter
d_T := 0.03 m           ' piston rod diameter
x_0 := 0.01 m           ' clearance volume as a cylinder length
m_p := 6 kg             ' reciprocating masses: piston, piston rod, crosshead, 1/3 of the connecting rod
η_m := 0.9              ' mechanical efficiency (Problem 776)
"Steam (simplified p-V diagram: admission up to ε of the stroke, then expansion p·V = const., exhaust):"
![Assumed course of the steam pressure in the chamber above the piston during the stroke](images/tlak-pary.en.svg){width=75%}
p_1 := 0.8 MPa {slider=0.5..2..0.05}    ' pressure of the admission steam
p_2 := 0.12 MPa         ' pressure in the exhaust
p_at := 0.1 MPa         ' pressure in the crankcase
ε := 0.3 {slider=0.1..0.8..0.05}        ' admission
"Set with an asynchronous generator (Problem 785):"
P_G := 15 kW            ' rated power of the generator
n_G := 25.75 [s^-1]     ' rated speed (1 545 rpm)
n_0 := 25 [s^-1]        ' speed at zero power (1 500 rpm)
P_ZG := 1500 W          ' power loss of the generator
N := 1/300              ' required irregularity of running

## Piston position
"Position of the piston from top dead centre (Equation 559):"
x(φ) := o + r - sqrt(o^2 - (r·sin(φ))^2) - r·cos(φ)
"Angle of the connecting rod to the direction of the piston motion (Equation 764):"
γ(φ) := asin(r/o·sin(φ))
"Rotation of the shaft to the piston position given as a percentage of the stroke (Equation 768), for example the end of admission:"
φ_ε := acos((r^2 + (o + r - r/50·100·ε)^2 - o^2)/(2·r·(o + r - r/50·100·ε))) | rad

## Forces
"Steam pressure above the piston (chamber H) and below the piston (chamber D): admission, expansion, exhaust."
p_H(φ) := if(sin(φ) >= 0, if(x(φ) <= ε·s, p_1, p_1·(ε·s + x_0)/(x(φ) + x_0)), p_2)
p_D(φ) := if(sin(φ) < 0, if(s - x(φ) <= ε·s, p_1, p_1·(ε·s + x_0)/(s - x(φ) + x_0)), p_2)
"Forces from the steam pressure and the inertia force of the reciprocating masses (Equation 347, weight neglected):"
F_H(φ) := π·d^2/4·p_H(φ)
F_D(φ) := π/4·((d^2 - d_T^2)·p_D(φ) + d_T^2·p_at)
ω_n := 2·π·n_0 | rad/s   ' angular velocity for the inertia forces
k(φ) := ω_n^2·r·(cos(φ) + r/o·cos(2·φ))
F_s(φ) := -k(φ)·m_p
F_p(φ) := F_H(φ) - F_D(φ) + F_s(φ)
![Forces in the crank mechanism: force on the piston, force in the connecting rod, force on the guide of the piston rod and the rotating component of the force in the connecting rod, which gives the torque](images/sily.svg){width=90%}
"Force in the connecting rod and force on the guide of the piston rod (Equation 764; the force in the rod is F_p / cos γ, so F_k = F_p·tan γ):"
F_l(φ) := F_p(φ)/cos(γ(φ))
F_k(φ) := F_l(φ)·sin(γ(φ))
plot(F_p(φ), F_s(φ), F_k(φ), φ: 0 .. 2·π, title: "Forces on the crank mechanism (Figure 766)") | kN

## Torque
"Moment from the force in the connecting rod (Equation 774) and its mean value over a revolution:"
M_p(φ) := F_l(φ)·sin(φ + γ(φ))·r
A_i := integral(M_p(φ), φ: 0 .. 2·π) | J      ' internal work per revolution
M_i := A_i/(2·π) | N·m
"Loss moment from the mechanical efficiency, constant (Figure 777); moment on the output shaft (Formula 773):"
M_Z := (1 - η_m)·M_i
M_k(φ) := M_p(φ) - M_Z
plot(M_p(φ), M_k(φ), φ: 0 .. 2·π, title: "Torque") | N·m

## Speed of the set
"The input power of the generator is linear in the angular velocity, P_sp = a·ω + b (Figure 784): at n_0 it covers only the losses, at n_G also the rated power."
ω_0 := 2·π·n_0 | rad/s
ω_G := 2·π·n_G | rad/s
a := P_G/(ω_G - ω_0) | W·s
b := P_ZG - a·ω_0 | W
"Mean angular velocity: the mean moment of the engine equals the moment of the generator, η_m·M_i·ω = a·ω + b."
solve ω_s: η_m·M_i·ω_s == a·ω_s + b in ω_0 .. 2·ω_G
n_s := ω_s/(2·π) | s^-1
P_m := η_m·M_i·ω_s | kW
check "speed within the working range of the generator": n_0 ≤ n_s and n_s ≤ n_G

## Flywheel
"The mean moment with which the engine turns the generator; where the moment of the engine exceeds it, the set accelerates, elsewhere it slows down."
M_s := η_m·M_i
"The moment against the mean crosses zero four times per revolution (double-acting cylinder): around each of the two peaks of the moment."
φ_a := maximize(M_k(φ), φ: 0 .. π)
φ_b := maximize(M_k(φ), φ: π .. 2·π)
solve φ_1: M_k(φ_1) == M_s in 0 .. φ_a
solve φ_2: M_k(φ_2) == M_s in φ_a .. π
solve φ_3: M_k(φ_3) == M_s in π .. φ_b
solve φ_4: M_k(φ_4) == M_s in φ_b .. 2·π
"Surpluses and deficits of work between the intersections:"
A_1 := integral(M_k(φ) - M_s, φ: φ_1 .. φ_2) | J
A_2 := integral(M_k(φ) - M_s, φ: φ_2 .. φ_3) | J
A_3 := integral(M_k(φ) - M_s, φ: φ_3 .. φ_4) | J
plot(M_k(φ) - M_s, φ: 0 .. 2·π, area: φ_1 .. φ_2, roots: true, title: "Moment above and below the mean: surplus of work A_1") | N·m
"Work accumulated from φ_1 at the intersections; the flywheel evens out its swing ΔA:"
A_e := [0 J, A_1, A_1 + A_2, A_1 + A_2 + A_3]
ΔA := max(A_e) - min(A_e) | J
"Moment of inertia of the set for the irregularity N = (ω_max − ω_min)/ω_s (Figure 783), ΔA = J·ω_s²·N:"
J := ΔA/(N·ω_s^2) | kg·m^2
"What this means: during one revolution the speed varies by only"
Δn := N·n_s | s^-1
n_max := n_s + Δn/2 | s^-1
n_min := n_s - Δn/2 | s^-1
"Kinetic energy of the set; the swing of work ΔA is only a small part of it (2·N), so the speed hardly varies:"
E_k := J·ω_s^2/2 | kJ
"A full steel disc of diameter D_s, width b_s and mass m_s has such a moment of inertia:"
![The flywheel as a full steel disc: diameter, width and peripheral speed](images/setrvacnik.en.svg){width=70%}
D_s := 0.5 m
ρ_s := 7850 kg/m^3
b_s := 32·J/(π·ρ_s·D_s^4) | mm     ' from J = π·ρ·b·D⁴/32
m_s := ρ_s·π·D_s^2/4·b_s | kg
"Peripheral speed of the disc; the limit is an assumption for a full steel disc, for cast iron about half is taken:"
v_s := ω_s·D_s/2 | m/s
v_dov := 60 [m/s]
check "peripheral speed of the flywheel": v_s ≤ v_dov
