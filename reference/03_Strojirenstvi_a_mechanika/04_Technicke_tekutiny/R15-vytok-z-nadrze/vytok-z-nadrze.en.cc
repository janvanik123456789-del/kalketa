# Outflow of water from a tank and the time to empty it
"After problem 1154 of a Czech collection of solved physics problems (reseneulohy.cz/1154; originally Halpern: Schaum's 3000 Solved Problems in Physics). A cylindrical tank of radius 0.9 m stands on a pedestal 6 m high and is filled with water to a height of 3 m. Near the bottom there is an opening closed with a plug, of area 6.3 cm². At what speed does the jet of water hit the ground when the plug is pulled out, and how long does it take to empty the tank? The theory (the Bernoulli equation, the continuity equation, Torricelli's formula) is in the Sources layer. The picture and the graphs are our own."
"Source: https://reseneulohy.cz/1154"

## Input
r := 0.9 m            ' radius of the tank
h_1 := 3 m            ' height of the water in the tank
h_2 := 6 m            ' height of the pedestal
S_2 := 6.3 cm^2       ' area of the opening left by the plug
g := 9.81 m/s^2       ' gravitational acceleration
![A tank on a pedestal: water up to the height h₁ above the bottom, the bottom at the height h₂ above the ground, an opening near the bottom, the jet hits the ground at the point A](images/nadrz.en.svg){width=80%}

## Speed of impact on the ground
"The Bernoulli equation (see Sources) for the surface (index 1) and the point A where the jet hits the ground (index 3):"
relation p_1 + y_1·ρ·g + ρ·v_1^2/2 == p_3 + y_3·ρ·g + ρ·v_3^2/2 {eq}
"Only the atmospheric pressure acts on the surface and at the ground, the ground has zero height, the surface is h_1 + h_2 above the ground and at the moment the plug is pulled out it is at rest:"
relation p_1 == p_a {eq}
relation p_3 == p_a {eq}
relation y_3 == 0 m {eq}
relation y_1 == h_1 + h_2 {eq}
relation v_1 == 0 m/s {eq}
derive v_3 == sqrt(2·g·(h_1 + h_2))
"Speed of the jet hitting the ground:"
v_A := sqrt(2·g·(h_1 + h_2)) | m/s

## Time to empty
"The outflow speed v_v through the opening from the Bernoulli equation for the surface at the height h above the opening and for the opening (Torricelli's formula, see Sources):"
relation p_a + (h_2 + h)·ρ·g == p_a + h_2·ρ·g + ρ·v_v^2/2 {eq}
derive v_v == sqrt(2·g·h) {eq}
"At every moment the tank loses as much water as flows out through the opening (the continuity equation). But both the speed of the falling surface v_p and the outflow speed change with the height h of the surface, so we work with a drop of dh in the time dt (dh is negative, the surface falls):"
S_1 := π·r^2 | m^2
relation S_1·v_p == S_2·v_v {eq}
relation v_p == -dh/dt {eq}
"Substituting gives a differential equation whose variables can be separated:"
derive -S_1·dh/dt == S_2·sqrt(2·g·h) {eq}
derive -dh/sqrt(h) == sqrt(2·g)·S_2/S_1·dt
"Integrating from the full tank (height h_1) to the empty one (0) and from the time 0 to t gives the time to empty:"
t_v := S_1/(S_2·sqrt(2·g))·integral(1/sqrt(h), h: 0 m .. h_1) == S_1/(S_2·sqrt(2·g))·2·sqrt(h_1) == S_1/S_2·sqrt(2·h_1/g) | min {eq}

## Progress of the emptying
"The height of the surface at the time t, the solution of that differential equation with h(0) = h_1:"
h_t(t) := (sqrt(h_1) - S_2/S_1·sqrt(g/2)·t)^2
v_t(t) := sqrt(2·g·h_t(t))
plot(h_t(t), t: 0 s .. t_v, title: "Height of the surface in the tank") | m
plot(v_t(t), t: 0 s .. t_v, title: "Outflow speed through the opening") | m/s
"The first half of the water flows out faster than the second half: the surface falls to h_1/2 in"
solve t_pol: h_t(t_pol) == h_1/2 in 0 s .. t_v
t_pol_min := t_pol | min
