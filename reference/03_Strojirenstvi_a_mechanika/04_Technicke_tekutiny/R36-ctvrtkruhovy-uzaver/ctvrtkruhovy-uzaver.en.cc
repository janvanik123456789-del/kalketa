# River depth at which a quarter-circle gate opens
"After problem 2.3 of the collection Hydromechanik – Übungsaufgaben (KIT Karlsruhe, G. H. Jirka, T. Bleninger, 2001): a gate shaped as a quarter-circle sector of radius R separates a river from the sea. It turns about the hinge D at the top and rests on a seal at the point A at the bottom. River water presses on the vertical wall from the left (its surface is t above the hinge), salt water presses on the arc from the right (its surface is level with the hinge). There is no water under the gate (the source does not say so in the problem; it follows from the figure, where the gate lies on the bottom). We find the seal force per metre of width and the depth t_0 at which the gate opens. The source gives no solution; the solution and the picture are our own."
"Source: G. H. Jirka, T. Bleninger, Hydromechanik – Übungsaufgaben, KIT Karlsruhe 2001, https://publikationen.bibliothek.kit.edu/1512004/1539 (problem without a solution; the solution is our own)"

## Input
R := 1.0 m
ρ_F := 997 kg/m^3         ' river water
ρ_S := 1025 kg/m^3        ' salt water
g := 9.81 m/s^2
G := 30 kN/m              ' weight of the gate per metre of width
s_G := R/3                ' arm of the weight from the vertical wall
![Quarter-circle gate: hinge D, centre O below it, seal A; river water on the left t above the hinge, salt water on the right level with the hinge; weight G with arm s_G and seal force F_A](images/uzaver.en.svg){width=80%}

## Salt water on the arc
"The pressure on the arc points to the centre O below the hinge; the vertical component of the resultant therefore has no moment about the hinge D, the horizontal one has, on the arm R."
H_S := integral(ρ_S·g·s, s: 0 m .. R) | kN/m
M_S := R·H_S | kN·m/m

## River water on the vertical wall
"Depth below the hinge s, pressure ρ_F·g·(t + s), arm to the hinge s:"
M_F(t) := integral(ρ_F·g·(t + s)·s, s: 0 m .. R)
F_A(t) := (M_S + G·s_G - M_F(t))/R
M_G := G·s_G | kN·m/m

## When the gate opens
"The gate opens when the seal force F_A drops to zero:"
solve t_0: M_F(t_0) == M_S + M_G guess t_0 = 1 m
F_A0 := F_A(0 m) | kN/m
F_A1 := F_A(1 m) | kN/m
check "The seal force is zero at t_0": abs(F_A(t_0)) ≤ 0.001 kN/m
"The seal force falls linearly with the river depth; the intersection with zero is the depth t_0:"
plot(F_A(t), t: 0 m .. 3 m, title: "Seal force against the depth t", xlabel: "t", ylabel: "F_A") | kN/m
"At t_0 ≈ 2.4 m above the hinge the gate opens: the salt water together with the weight of the gate holds the moment of the river only up to this depth. At t = 0 the seal pushes with about 11.8 kN/m, at t = 1 m with about 6.9 kN/m."
