# Pressure losses in a pipe: pump input power and flow through a parallel branch
"After exercise 11 of the course Fluid Mechanics I (University of West Bohemia in Pilsen, Department of Machine Design, Ing. M. Klimko), examples 4 and 1. First the input power of the pump of a garden sprayer: water is drawn from a tank through a suction strainer, led through smooth pipes and an elbow and sprayed through twelve holes of the nozzle 3 m above the surface. Then two parallel branches of a water main: what flow rate passes through the longer branch when the shorter one carries 0.4 m³/s. The friction factor is computed from the Blasius relation as in the exercise and from the Colebrook equation, which Kalketa solves as an equation. The theory is in the Sources layer."
"Source: Ing. M. Klimko: Mechanika tekutin I, cvičení 11, ZČU v Plzni, http://home.zcu.cz/~kovarikp/MT/cviceni/cviceni_MT_11.pdf"

## Input power of the sprayer pump
D := 30 mm                  ' inside diameter (bore) of the pipe
L_1 := 1 m                  ' suction
L_2 := 10 m                 ' delivery
L_3 := 1 m                  ' feed to the nozzle
h := 3 m                    ' height of the nozzle above the surface
Q := 1.2 l/s                ' flow rate
n_d := 12                   ' number of holes of the nozzle
d_d := 2.5 mm               ' diameter of a hole
ρ := 1000 kg/m^3
η := 0.001 Pa·s             ' dynamic viscosity of water
η_č := 0.49                 ' efficiency of the pump
ξ_SK := 0.5                 ' suction strainer
ξ_KO := 0.33                ' elbow
ξ_T := 0.8                  ' nozzle
g := 9.81 m/s^2
![Garden sprayer: a tank with a suction strainer, a pump, a pipe with an elbow and a nozzle at the height h above the surface](images/rozprasovac.en.svg){width=75%}
"Speed in the pipe and the Reynolds number; the flow is turbulent (Re > 2300):"
w := Q/(π·D^2/4) | m/s
Re := ρ·w·D/η
"Hydraulically smooth pipe: the friction factor from the Blasius relation (valid up to Re ≐ 10⁵):"
λ := 0.3164/Re^(1/4)
"For comparison the Colebrook equation for a smooth pipe (roughness 0), solved for λ:"
solve λ_C: 1/sqrt(λ_C) == -2·log10(2.51/(Re·sqrt(λ_C))) in 0.005 .. 0.1
"Energy loss per kilogram of water: local losses of the strainer, the elbow and the nozzle and friction along the whole length. (In the exercise the nozzle coefficient is listed by mistake as 0.5 instead of the given 0.8; the numerical result 14.52 J/kg corresponds to 0.8 and a speed rounded to 1.7 m/s.)"
e_z := w^2/2·(ξ_SK + ξ_KO + ξ_T + λ·(L_1 + L_2 + L_3)/D) | J/kg
"The water leaves the nozzle at a speed given by the flow rate and the area of all the holes:"
w_t := Q/(n_d·π·d_d^2/4) | m/s
"The Bernoulli equation between the surface and the nozzle outlet: the specific work of the pump covers the losses, the kinetic energy of the outflow and the height."
e_č := e_z + w_t^2/2 + g·h | J/kg
P := ρ·Q·e_č | W
P_p := P/η_č | W
"The kinetic energy of the outflow dominates: a nozzle with twelve holes of 2.5 mm throttles the stream to more than twenty metres per second."

## Flow through the second parallel branch
D_2 := 0.3 m                ' both branches
L_A := 1 km
L_B := 3 km
Q_A := 0.4 m^3/s
η_v := 1.138e-3 Pa·s         ' water at 15 °C
ε := 0.26 mm                 ' roughness of the pipe
"Both branches have a common start and end, so the pressure loss by friction is the same in them:"
relation λ_A·L_A/D_2·ρ·w_A^2/2 == λ_B·L_B/D_2·ρ·w_B^2/2 {eq}
w_A := Q_A/(π·D_2^2/4) | m/s
"The exercise assumes λ_A = λ_B (fully turbulent flow, λ does not depend on Re):"
w_B_0 := w_A·sqrt(L_A/L_B) | m/s
Q_B_0 := w_B_0·π·D_2^2/4 | m^3/s
"Checking the assumption: the Reynolds numbers of both branches and the relative roughness."
Re_A := ρ·w_A·D_2/η_v
Re_B_0 := ρ·w_B_0·D_2/η_v
ε_r := ε/D_2
"In the fully rough region (Re → ∞) it would be:"
λ_drsne := (-2·log10(ε_r/3.7))^(-2)
"The Colebrook equation for the shorter branch, where we know the speed:"
solve λ_A: 1/sqrt(λ_A) == -2·log10(ε_r/3.7 + 2.51/(Re_A·sqrt(λ_A))) in 0.005 .. 0.1
"The longer branch: the speed and the friction factor depend on each other, so both equations at once:"
solve (w_B, λ_B): λ_B·L_B·w_B^2 == λ_A·L_A·w_A^2, 1/sqrt(λ_B) == -2·log10(ε_r/3.7 + 2.51·η_v/(ρ·w_B·D_2·sqrt(λ_B))) guess w_B = 3 m/s, λ_B = 0.02
Q_B := w_B·π·D_2^2/4 | m^3/s
Δp := λ_A·L_A/D_2·ρ·w_A^2/2 | kPa
"The assumption λ_A = λ_B gives a flow rate less than half a percent larger: the Reynolds numbers are high, λ only approaches the value for a fully rough pipe."
